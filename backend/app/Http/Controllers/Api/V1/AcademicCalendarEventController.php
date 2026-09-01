<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicCalendarEvent;
use App\Models\AcademicYear;
use App\Models\ClinicalPeriod;
use App\Models\Rotation;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AcademicCalendarEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $events = AcademicCalendarEvent::query()
            ->with('academicYear:id,code')
            ->when($request->integer('academic_year_id'), fn ($query, $yearId) => $query->where('academic_year_id', $yearId))
            ->orderBy('start_date')
            ->get()
            ->map(fn (AcademicCalendarEvent $event) => $this->eventPayload($event));

        return ApiResponse::success($events);
    }

    public function overview(AcademicYear $academicYear): JsonResponse
    {
        $events = AcademicCalendarEvent::query()
            ->where('academic_year_id', $academicYear->id)
            ->with('academicYear:id,code')
            ->orderBy('start_date')
            ->get()
            ->map(fn (AcademicCalendarEvent $event) => $this->eventPayload($event));

        $rotations = Rotation::query()
            ->where('academic_year_id', $academicYear->id)
            ->with([
                'clinicalPeriod',
                'blocks' => fn ($query) => $query->orderBy('from_week'),
                'distributionVersions' => fn ($query) => $query->latest('id'),
            ])
            ->orderBy('academic_level')
            ->orderBy('start_date')
            ->get()
            ->map(fn (Rotation $rotation) => [
                'id' => $rotation->id,
                'code' => $rotation->code,
                'name' => $rotation->name,
                'academic_level' => $rotation->academic_level,
                'start_date' => $rotation->start_date?->toDateString(),
                'end_date' => $rotation->end_date?->toDateString(),
                'duration_weeks' => $rotation->duration_weeks,
                'status' => $rotation->status,
                'schedule_scope' => $rotation->schedule_scope,
                'clinical_period' => $rotation->clinicalPeriod ? $this->periodPayload($rotation->clinicalPeriod) : null,
                'blocks' => $rotation->blocks->map(fn ($block) => [
                    'id' => $block->id,
                    'block_code' => $block->block_code,
                    'from_week' => $block->from_week,
                    'to_week' => $block->to_week,
                ])->values(),
                'distribution_status' => $rotation->distributionVersions->first()?->status,
            ]);

        return ApiResponse::success([
            'academic_year' => $academicYear,
            'periods' => $academicYear->clinicalPeriods()->get()->map(fn (ClinicalPeriod $period) => $this->periodPayload($period)),
            'events' => $events,
            'rotations' => $rotations,
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $event = AcademicCalendarEvent::create($this->validatedData($request));

        return ApiResponse::success($this->eventPayload($event->load('academicYear:id,code')), 'تمت إضافة الحدث إلى التقويم.', [], 201);
    }

    public function update(Request $request, AcademicCalendarEvent $event): JsonResponse
    {
        $event->update($this->validatedData($request, $event));

        return ApiResponse::success($this->eventPayload($event->fresh()->load('academicYear:id,code')), 'تم تحديث الحدث بنجاح.');
    }

    public function destroy(AcademicCalendarEvent $event): JsonResponse
    {
        $event->delete();

        return ApiResponse::success(null, 'تم حذف الحدث من التقويم.');
    }

    public function storePeriod(Request $request): JsonResponse
    {
        $period = ClinicalPeriod::create($this->validatedPeriodData($request));
        return ApiResponse::success($this->periodPayload($period), 'تمت إضافة الفترة السريرية.', [], 201);
    }

    public function updatePeriod(Request $request, ClinicalPeriod $period): JsonResponse
    {
        $period->update($this->validatedPeriodData($request, $period));
        return ApiResponse::success($this->periodPayload($period->fresh()), 'تم تحديث الفترة السريرية.');
    }

    public function destroyPeriod(ClinicalPeriod $period): JsonResponse
    {
        if ($period->rotations()->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'period' => ['لا يمكن حذف الفترة لوجود جداول توزيع مرتبطة بها.'],
            ]);
        }
        $period->delete();
        return ApiResponse::success(null, 'تم حذف الفترة السريرية.');
    }

    private function validatedData(Request $request, ?AcademicCalendarEvent $event = null): array
    {
        $required = $event ? 'sometimes' : 'required';
        $data = $request->validate([
            'academic_year_id' => [$required, 'integer', 'exists:academic_years,id'],
            'name' => [$required, 'string', 'max:255'],
            'event_type' => [$required, Rule::in(['rotation', 'exam', 'holiday', 'break', 'registration', 'graduation', 'other'])],
            'start_date' => [$required, 'date'],
            'end_date' => [$required, 'date', 'after_or_equal:start_date'],
            'affected_levels' => ['nullable', 'array'],
            'affected_levels.*' => [Rule::in(['fourth', 'fifth', 'sixth'])],
            'suspends_clinical_training' => ['sometimes', 'boolean'],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);

        $year = AcademicYear::findOrFail($data['academic_year_id'] ?? $event?->academic_year_id);
        $start = $data['start_date'] ?? $event?->start_date->toDateString();
        $end = $data['end_date'] ?? $event?->end_date->toDateString();
        abort_if($start < $year->start_date->toDateString() || $end > $year->end_date->toDateString(), 422, 'يجب أن يقع الحدث ضمن بداية ونهاية العام الأكاديمي المحدد.');

        if (array_key_exists('affected_levels', $data)) {
            $data['affected_levels'] = empty($data['affected_levels']) ? null : implode(',', $data['affected_levels']);
        }

        return $data;
    }

    private function eventPayload(AcademicCalendarEvent $event): array
    {
        return [
            'id' => $event->id,
            'academic_year_id' => $event->academic_year_id,
            'academic_year' => $event->academicYear?->only(['id', 'code']),
            'name' => $event->name,
            'event_type' => $event->event_type,
            'start_date' => $event->start_date?->toDateString(),
            'end_date' => $event->end_date?->toDateString(),
            'affected_levels' => $event->affected_levels ? explode(',', $event->affected_levels) : [],
            'suspends_clinical_training' => $event->suspends_clinical_training,
            'notes' => $event->notes,
        ];
    }

    private function validatedPeriodData(Request $request, ?ClinicalPeriod $period = null): array
    {
        $required = $period ? 'sometimes' : 'required';
        $data = $request->validate([
            'academic_year_id' => [$required, 'integer', 'exists:academic_years,id'],
            'code' => [$required, 'string', 'max:20'],
            'name_ar' => [$required, 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'sequence' => [$required, 'integer', 'min:1', 'max:10'],
            'start_date' => [$required, 'date'],
            'end_date' => [$required, 'date', 'after_or_equal:start_date'],
            'weeks_count' => [$required, 'integer', 'min:1', 'max:52'],
            'status' => [$required, Rule::in(['planned', 'active', 'closed'])],
            'notes' => ['nullable', 'string', 'max:3000'],
        ]);
        $yearId = (int) ($data['academic_year_id'] ?? $period?->academic_year_id);
        $year = AcademicYear::findOrFail($yearId);
        $start = Carbon::parse($data['start_date'] ?? $period?->start_date);
        $end = Carbon::parse($data['end_date'] ?? $period?->end_date);
        if ($start->lt($year->start_date) || $end->gt($year->end_date)) {
            throw \Illuminate\Validation\ValidationException::withMessages(['start_date' => ['يجب أن تقع الفترة كاملة ضمن العام الأكاديمي.']]);
        }
        $overlap = ClinicalPeriod::where('academic_year_id', $yearId)
            ->when($period, fn ($query) => $query->whereKeyNot($period->id))
            ->whereDate('start_date', '<=', $end->toDateString())
            ->whereDate('end_date', '>=', $start->toDateString())
            ->exists();
        if ($overlap) {
            throw \Illuminate\Validation\ValidationException::withMessages(['start_date' => ['تتداخل هذه الفترة مع فترة سريرية أخرى.']]);
        }
        return $data;
    }

    private function periodPayload(ClinicalPeriod $period): array
    {
        return [
            'id' => $period->id,
            'academic_year_id' => $period->academic_year_id,
            'code' => $period->code,
            'name_ar' => $period->name_ar,
            'name_en' => $period->name_en,
            'sequence' => $period->sequence,
            'start_date' => $period->start_date?->toDateString(),
            'end_date' => $period->end_date?->toDateString(),
            'weeks_count' => $period->weeks_count,
            'status' => $period->status,
            'notes' => $period->notes,
        ];
    }
}
