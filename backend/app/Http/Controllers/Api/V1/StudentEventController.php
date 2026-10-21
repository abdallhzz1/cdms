<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\Student;
use App\Models\StudentEvent;
use App\Models\StudentEventAttendance;
use App\Services\StudentEventQrService;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class StudentEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(['scope' => ['nullable', Rule::in(['upcoming', 'past', 'draft', 'archived', 'all'])],
            'search' => ['nullable', 'string', 'max:100']]);
        $query = StudentEvent::query()->withCount(['attendances as attendance_count' => fn ($q) => $q->whereNull('voided_at')]);
        $scope = $request->query('scope', 'upcoming');
        if ($scope === 'upcoming') $query->where('status', 'published')->where('ends_at', '>=', now())->orderBy('starts_at');
        elseif ($scope === 'past') $query->where('status', 'published')->where('ends_at', '<', now())->orderByDesc('starts_at');
        elseif (in_array($scope, ['draft', 'archived'], true)) $query->where('status', $scope)->orderByDesc('starts_at');
        else $query->where('status', '!=', 'archived')->orderByDesc('starts_at');
        if ($search = trim((string) $request->query('search', ''))) {
            $query->where(fn ($q) => $q->where('title_ar', 'like', '%'.$search.'%')->orWhere('title_en', 'like', '%'.$search.'%'));
        }
        return ApiResponse::success($query->paginate(20));
    }

    public function show(StudentEvent $event): JsonResponse
    {
        return ApiResponse::success($event->loadCount(['attendances as attendance_count' => fn ($q) => $q->whereNull('voided_at')]));
    }

    public function store(Request $request): JsonResponse
    {
        $data = $this->validated($request);
        $event = DB::transaction(function () use ($request, $data) {
            $event = StudentEvent::create([...$data, 'public_id' => (string) Str::uuid(), 'status' => 'draft',
                'created_by' => $request->user()->id, 'updated_by' => $request->user()->id]);
            $this->audit($request, 'student_event.created', $event, ['after' => $event->toArray()]);
            return $event;
        });
        return ApiResponse::success($event, null, [], 201);
    }

    public function update(Request $request, StudentEvent $event): JsonResponse
    {
        if ($event->status === 'archived') throw ValidationException::withMessages(['event' => [__('student_events.unavailable')]]);
        $data = $this->validated($request);
        if ($event->attendances()->whereNull('voided_at')->exists()) {
            foreach (['starts_at', 'ends_at', 'check_in_opens_at', 'check_in_closes_at', 'eligible_levels'] as $field) {
                if ($field === 'eligible_levels' ? array_diff($data[$field], $event->$field) || array_diff($event->$field, $data[$field])
                    : ! $event->$field->equalTo($data[$field])) {
                    throw ValidationException::withMessages([$field => [__('student_events.immutable_roster')]]);
                }
            }
        }
        DB::transaction(function () use ($request, $event, $data) {
            $before = $event->toArray();
            $event->update([...$data, 'updated_by' => $request->user()->id]);
            $this->audit($request, 'student_event.updated', $event, ['before' => $before, 'after' => $event->toArray()]);
        });
        return ApiResponse::success($event);
    }

    public function status(Request $request, StudentEvent $event): JsonResponse
    {
        $data = $request->validate(['status' => ['required', Rule::in(['draft', 'published', 'archived'])],
            'reason' => ['required_if:status,archived', 'nullable', 'string', 'min:10', 'max:1000']]);
        if ($event->status === 'archived') throw ValidationException::withMessages(['event' => [__('student_events.unavailable')]]);
        DB::transaction(function () use ($request, $event, $data) {
            $before = $event->status;
            $event->update(['status' => $data['status'], 'updated_by' => $request->user()->id]);
            $this->audit($request, 'student_event.status_changed', $event,
                ['before' => $before, 'after' => $event->status, 'reason' => $data['reason'] ?? null]);
        });
        return ApiResponse::success($event);
    }

    public function destroy(Request $request, StudentEvent $event): JsonResponse
    {
        if ($event->status !== 'draft' || $event->attendances()->exists())
            throw ValidationException::withMessages(['event' => [__('student_events.only_empty_draft_delete')]]);
        DB::transaction(function () use ($request, $event) {
            $this->audit($request, 'student_event.deleted_empty_draft', $event, ['before' => $event->toArray()]);
            $event->delete();
        });
        return ApiResponse::success(['deleted' => true]);
    }

    public function qr(StudentEvent $event, StudentEventQrService $qr): JsonResponse
    {
        if ($event->status !== 'published') throw ValidationException::withMessages(['event' => [__('student_events.unavailable')]]);
        if (!now()->betweenIncluded($event->check_in_opens_at, $event->check_in_closes_at))
            throw ValidationException::withMessages(['event' => [__('student_events.window_closed')]]);
        return ApiResponse::success($qr->issue($event));
    }

    public function attendance(StudentEvent $event): JsonResponse
    {
        request()->validate(['page' => ['nullable', 'integer', 'min:1']]);
        return ApiResponse::success($event->attendances()->with('student:id,university_number,full_name_ar,full_name_en,academic_level')
            ->whereNull('voided_at')->orderByDesc('checked_in_at')->paginate(50));
    }

    public function recordAttendance(Request $request, StudentEvent $event): JsonResponse
    {
        $data = $request->validate(['university_number' => ['required', 'string', 'max:20'],
            'reason' => ['required', 'string', 'min:10', 'max:1000']]);
        $student = Student::where('university_number', $data['university_number'])->first();
        if (!$student || $student->academic_registration_status !== 'registered')
            throw ValidationException::withMessages(['university_number' => [__('student_events.student_missing')]]);
        if (!in_array($student->academic_level, $event->eligible_levels, true))
            throw ValidationException::withMessages(['university_number' => [__('student_events.ineligible')]]);
        try {
            return DB::transaction(function () use ($request, $event, $student, $data) {
            $existing = StudentEventAttendance::where('student_event_id', $event->id)->where('student_id', $student->id)
                ->lockForUpdate()->first();
            if ($existing && !$existing->voided_at) return ApiResponse::success($existing, __('student_events.already_recorded'));
            if ($existing) $existing->update(['voided_at' => null, 'voided_by' => null, 'void_reason' => null,
                'checked_in_at' => now(), 'source' => 'manual', 'recorded_by' => $request->user()->id, 'reason' => $data['reason']]);
            else $existing = StudentEventAttendance::create(['student_event_id' => $event->id, 'student_id' => $student->id,
                'checked_in_at' => now(), 'source' => 'manual', 'recorded_by' => $request->user()->id, 'reason' => $data['reason']]);
            $this->audit($request, 'student_event.attendance_recorded', $event,
                ['attendance_id' => $existing->id, 'student_id' => $student->id, 'reason' => $data['reason']]);
            return ApiResponse::success($existing, __('student_events.recorded'));
            });
        } catch (UniqueConstraintViolationException $e) {
            $attendance = StudentEventAttendance::where('student_event_id', $event->id)->where('student_id', $student->id)
                ->whereNull('voided_at')->first();
            if (!$attendance) throw $e;
            return ApiResponse::success($attendance, __('student_events.already_recorded'));
        }
    }

    public function voidAttendance(Request $request, StudentEvent $event, StudentEventAttendance $attendance): JsonResponse
    {
        abort_unless($attendance->student_event_id === $event->id && !$attendance->voided_at, 404);
        $data = $request->validate(['reason' => ['required', 'string', 'min:10', 'max:1000']]);
        DB::transaction(function () use ($request, $event, $attendance, $data) {
            $attendance->update(['voided_at' => now(), 'voided_by' => $request->user()->id, 'void_reason' => $data['reason']]);
            $this->audit($request, 'student_event.attendance_voided', $event,
                ['attendance_id' => $attendance->id, 'student_id' => $attendance->student_id, 'reason' => $data['reason']]);
        });
        return ApiResponse::success($attendance);
    }

    private function validated(Request $request): array
    {
        $data = $request->validate([
            'type' => ['required', Rule::in(['conference', 'seminar', 'lecture'])],
            'title_ar' => ['required', 'string', 'max:255'], 'title_en' => ['required', 'string', 'max:255'],
            'description_ar' => ['nullable', 'string', 'max:5000'], 'description_en' => ['nullable', 'string', 'max:5000'],
            'location_ar' => ['required', 'string', 'max:255'], 'location_en' => ['required', 'string', 'max:255'],
            'starts_at' => ['required', 'date'], 'ends_at' => ['required', 'date', 'after:starts_at'],
            'check_in_opens_at' => ['required', 'date', 'before_or_equal:ends_at'],
            'check_in_closes_at' => ['required', 'date', 'after:check_in_opens_at'],
            'eligible_levels' => ['required', 'array', 'min:1', 'max:3'],
            'eligible_levels.*' => ['required', Rule::in(['fourth', 'fifth', 'sixth'])],
        ]);
        $data['eligible_levels'] = array_values(array_unique($data['eligible_levels']));
        return $data;
    }

    private function audit(Request $request, string $action, StudentEvent $event, array $changes): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => $action,
            'entity_type' => 'student_event', 'entity_id' => $event->id, 'changes' => $changes]);
    }
}
