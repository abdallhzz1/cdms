<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\AuditLog;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\Person;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** Campus lectures are cohort-wide and intentionally separate from hospital/course attendance. */
class ClinicalUniversityAttendanceController extends Controller
{
    private const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    private const MANAGERS = ['SYS_ADMIN', 'RTA', 'CLINICAL_DIRECTOR'];

    public function index(Request $request): JsonResponse
    {
        $this->authorizeManager($request);
        $request->validate(['student_group_id' => ['nullable', 'integer', 'exists:student_groups,id']]);
        $groups = StudentGroup::query()->with('academicYear:id,code,start_date,end_date,is_current')
            ->whereHas('academicYear', fn ($query) => $query->where('status', 'active'))
            ->orderByDesc('academic_year_id')->orderBy('name')->get(['id', 'academic_year_id', 'academic_level', 'name']);
        $supervisorUsers = User::query()->where('is_active', true)
            ->whereHas('roles', fn ($roles) => $roles->where('code', 'CLINICAL_SUPERVISOR'))
            ->get(['id', 'email']);
        $supervisors = Person::query()->where('is_active', true)
            ->where(fn ($query) => $query->whereIn('user_id', $supervisorUsers->pluck('id'))
                ->orWhere(fn ($unlinked) => $unlinked->whereNull('user_id')->whereIn('email', $supervisorUsers->pluck('email'))))
            ->orderBy('full_name_ar')->get(['id', 'full_name_ar', 'full_name_en']);
        $lectures = ClinicalUniversityLecture::query()->with(['group.academicYear:id,code', 'supervisor:id,full_name_ar,full_name_en'])
            ->withCount('sessions')
            ->orderByDesc('is_active')->orderByDesc('starts_on')->orderBy('weekday')->orderBy('starts_at')->get();
        $sessions = ClinicalUniversitySession::query()->with(['lecture.group:id,name', 'supervisor:id,full_name_ar'])
            ->when($request->filled('student_group_id'), fn ($query) => $query->whereHas('lecture', fn ($lecture) => $lecture->where('student_group_id', $request->integer('student_group_id'))))
            ->withCount('records')->orderByDesc('session_date')->orderByDesc('id')->limit(250)->get();

        return ApiResponse::success(compact('groups', 'supervisors', 'lectures', 'sessions'));
    }

    public function store(Request $request): JsonResponse
    {
        $this->authorizeManager($request);
        $data = $this->validateLecture($request);
        $lecture = DB::transaction(function () use ($request, $data) {
            StudentGroup::query()->whereKey($data['student_group_id'])->lockForUpdate()->firstOrFail();
            $this->validatePlan($data);
            $lecture = ClinicalUniversityLecture::create($data + ['created_by_user_id' => $request->user()->id]);
            $this->audit($request, 'clinical_university.lecture_created', $lecture->id, ['plan' => $lecture->only(array_keys($data))]);
            return $lecture;
        });
        return ApiResponse::success($lecture->load(['group.academicYear', 'supervisor']), 'تم إعداد محاضرة الجامعة للمجموعة الرئيسية.', [], 201);
    }

    public function update(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->authorizeManager($request);
        $data = $this->validateLecture($request);
        $lecture = DB::transaction(function () use ($request, $lecture, $data) {
            StudentGroup::query()->whereKey($data['student_group_id'])->lockForUpdate()->firstOrFail();
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_if($locked->sessions()->exists(), 409, 'هذه المحاضرة لها كشوف محفوظة. أوقفها وأنشئ موعدًا جديدًا لحفظ السجل التاريخي.');
            $this->validatePlan($data, $locked->id);
            $before = $locked->only(array_keys($data));
            $locked->update($data);
            $this->audit($request, 'clinical_university.lecture_updated', $locked->id, ['before' => $before, 'after' => $data]);
            return $locked;
        });
        return ApiResponse::success($lecture->load(['group.academicYear', 'supervisor']));
    }

    public function archive(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $this->authorizeManager($request);
        $lecture = DB::transaction(function () use ($request, $lecture) {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            if ($locked->is_active) {
                $locked->update(['is_active' => false]);
                $this->audit($request, 'clinical_university.lecture_archived', $locked->id, []);
            }
            return $locked;
        });
        return ApiResponse::success($lecture, 'تم إيقاف المواعيد القادمة مع إبقاء كشوف الحضور السابقة.');
    }

    public function mine(Request $request): JsonResponse
    {
        $person = $this->supervisor($request);
        $lectures = ClinicalUniversityLecture::query()->where('supervisor_person_id', $person->id)->where('is_active', true)
            ->with(['group.academicYear:id,code', 'supervisor:id,full_name_ar,full_name_en'])
            ->orderBy('weekday')->orderBy('starts_at')->get();
        return ApiResponse::success($lectures->map(fn (ClinicalUniversityLecture $lecture) => $this->planPayload($lecture)));
    }

    public function day(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $date = $request->validate(['session_date' => ['required', 'date_format:Y-m-d']])['session_date'];
        $this->authorizeLecture($request, $lecture);
        $this->validateOccurrence($lecture, $date, false);
        $session = $lecture->sessions()->whereDate('session_date', $date)->first();
        $rows = $session
            ? $session->records()->with(['student:id,university_number,full_name_ar,full_name_en,photo_url', 'subgroup:id,name', 'recorder:id,name'])
                ->get()->map(fn ($record) => [
                    'student' => $record->student, 'subgroup' => $record->subgroup,
                    'status' => $record->status, 'excuse_note' => $record->excuse_note,
                    'recorded_by' => $record->recorder?->name, 'updated_at' => $record->updated_at,
                ])
            : $this->roster($lecture, $date)->map(fn ($membership) => [
                'student' => $membership->student, 'subgroup' => $membership->subgroup,
                'status' => null, 'excuse_note' => null, 'recorded_by' => null, 'updated_at' => null,
            ]);
        return ApiResponse::success(['session_id' => $session?->id, 'lecture' => $this->planPayload($lecture->loadMissing('group.academicYear')), 'rows' => $rows->sortBy(fn ($row) => ($row['subgroup']?->name ?? '').'|'.($row['student']?->full_name_ar ?? ''))->values()]);
    }

    public function record(Request $request, ClinicalUniversityLecture $lecture): JsonResponse
    {
        $person = $this->supervisor($request);
        $data = $request->validate([
            'session_date' => ['required', 'date_format:Y-m-d', 'before_or_equal:today'],
            'records' => ['required', 'array', 'min:1', 'max:500'],
            'records.*.student_id' => ['required', 'integer', 'distinct', 'exists:students,id'],
            'records.*.status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'records.*.excuse_note' => ['nullable', 'string', 'max:2000'],
        ]);
        abort_unless((int) $lecture->supervisor_person_id === (int) $person->id, 403);
        foreach ($data['records'] as $index => $row) {
            if ($row['status'] === 'excused' && ! filled(trim((string) ($row['excuse_note'] ?? '')))) {
                throw ValidationException::withMessages(["records.$index.excuse_note" => ['سبب العذر مطلوب عند اختيار «بعذر».']]);
            }
        }
        $session = DB::transaction(function () use ($request, $lecture, $person, $data) {
            $locked = ClinicalUniversityLecture::query()->whereKey($lecture->id)->lockForUpdate()->firstOrFail();
            abort_unless((int) $locked->supervisor_person_id === (int) $person->id, 403);
            $this->validateOccurrence($locked, $data['session_date'], true);
            $session = $locked->sessions()->whereDate('session_date', $data['session_date'])->lockForUpdate()->first();
            $existing = $session ? $session->records()->lockForUpdate()->get()->keyBy('student_id') : collect();
            $membership = $session ? collect() : $this->roster($locked, $data['session_date'])->keyBy('student_id');
            $allowed = ($session ? $existing->keys() : $membership->keys())->map(fn ($id) => (int) $id)->sort()->values()->all();
            $submitted = collect($data['records'])->pluck('student_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
            if ($allowed !== $submitted) {
                throw ValidationException::withMessages(['records' => ['يجب تحديد حالة لكل طالب في المجموعة الرئيسية مرة واحدة، بما يشمل جميع المجموعات الفرعية. حدّث الكشف وأعد المحاولة.']]);
            }
            if (! $session) {
                $session = ClinicalUniversitySession::create([
                    'clinical_university_lecture_id' => $locked->id,
                    'session_date' => $data['session_date'],
                    'supervisor_person_id' => $person->id,
                    'recorded_by_user_id' => $request->user()->id,
                ]);
            }
            foreach ($data['records'] as $row) {
                $studentId = (int) $row['student_id'];
                $previous = $existing->get($studentId);
                $note = trim((string) ($row['excuse_note'] ?? '')) ?: null;
                $record = ClinicalUniversityAttendanceRecord::updateOrCreate(
                    ['clinical_university_session_id' => $session->id, 'student_id' => $studentId],
                    ['student_subgroup_id' => $previous?->student_subgroup_id ?? $membership->get($studentId)?->student_subgroup_id,
                        'status' => $row['status'], 'excuse_note' => $note, 'recorded_by_user_id' => $request->user()->id],
                );
                if (! $previous || $previous->status !== $row['status'] || $previous->excuse_note !== $note) {
                    $this->audit($request, 'clinical_university.attendance_recorded', $record->id, [
                        'lecture_id' => $locked->id, 'session_id' => $session->id, 'date' => $data['session_date'],
                        'student_id' => $studentId, 'previous_status' => $previous?->status, 'status' => $row['status'],
                        'previous_note' => $previous?->excuse_note, 'note' => $note,
                    ], $studentId);
                }
            }
            return $session;
        });
        return ApiResponse::success(['session_id' => $session->id], 'تم حفظ كشف محاضرة الجامعة لجميع المجموعات الفرعية.');
    }

    private function validateLecture(Request $request): array
    {
        $data = $request->validate([
            'student_group_id' => ['required', 'integer', 'exists:student_groups,id'],
            'supervisor_person_id' => ['required', 'integer', 'exists:people,id'],
            'title' => ['required', 'string', 'max:160'],
            'weekday' => ['required', Rule::in(self::DAYS)],
            'starts_at' => ['required', 'date_format:H:i'],
            'ends_at' => ['required', 'date_format:H:i', 'after:starts_at'],
            'starts_on' => ['required', 'date_format:Y-m-d'],
            'ends_on' => ['required', 'date_format:Y-m-d', 'after_or_equal:starts_on'],
        ]);
        $data['title'] = trim($data['title']);
        if ($data['title'] === '') throw ValidationException::withMessages(['title' => ['اسم المحاضرة مطلوب.']]);
        $data['starts_at'] .= ':00';
        $data['ends_at'] .= ':00';
        return $data;
    }

    private function validatePlan(array $data, ?int $exceptId = null): void
    {
        $group = StudentGroup::with('academicYear')->findOrFail($data['student_group_id']);
        $supervisor = Person::findOrFail($data['supervisor_person_id']);
        $account = $supervisor->user ?? User::query()->where('email', $supervisor->email)->first();
        if (! $supervisor->is_active || ! $account?->is_active || ! $account->hasRole('CLINICAL_SUPERVISOR')) {
            throw ValidationException::withMessages(['supervisor_person_id' => ['اختر مشرفًا سريريًا نشطًا لديه حساب ودور المشرف.']]);
        }
        if ($data['starts_on'] < $group->academicYear->start_date->toDateString() || $data['ends_on'] > $group->academicYear->end_date->toDateString()
            || Carbon::parse($data['starts_on'])->diffInDays($data['ends_on']) > 370) {
            throw ValidationException::withMessages(['starts_on' => ['مدة المحاضرة يجب أن تقع ضمن العام الأكاديمي للمجموعة.']]);
        }
        $overlapping = ClinicalUniversityLecture::query()->where('student_group_id', $group->id)->where('is_active', true)
            ->whereDate('starts_on', '<=', $data['ends_on'])->whereDate('ends_on', '>=', $data['starts_on'])
            ->when($exceptId, fn ($query) => $query->where('id', '!=', $exceptId));
        if ((clone $overlapping)->where('weekday', $data['weekday'])
            ->where('starts_at', '<', $data['ends_at'])->where('ends_at', '>', $data['starts_at'])->exists()) {
            throw ValidationException::withMessages(['starts_at' => ['يوجد موعد متداخل للمجموعة في هذا اليوم.']]);
        }
        if ($overlapping->count() >= 2) {
            throw ValidationException::withMessages(['student_group_id' => ['لا يمكن إضافة أكثر من محاضرتين أسبوعيًا للمجموعة الرئيسية في الفترة نفسها.']]);
        }
    }

    private function roster(ClinicalUniversityLecture $lecture, string $date)
    {
        $lecture->loadMissing('group');
        return StudentGroupAssignment::query()->where('student_group_id', $lecture->student_group_id)
            ->where('academic_year_id', $lecture->group->academic_year_id)
            ->where(fn ($query) => $query->whereNull('valid_from')->orWhereDate('valid_from', '<=', $date))
            ->where(fn ($query) => $query->whereNull('valid_until')->orWhereDate('valid_until', '>=', $date))
            ->with(['student:id,university_number,full_name_ar,full_name_en,photo_url', 'subgroup:id,name'])
            ->orderByDesc('id')->get()->unique('student_id')->values();
    }

    private function planPayload(ClinicalUniversityLecture $lecture): array
    {
        $lecture->loadMissing('group.academicYear', 'supervisor');
        return [...$lecture->toArray(), 'scheduled_dates' => $lecture->scheduledDates()];
    }

    private function validateOccurrence(ClinicalUniversityLecture $lecture, string $date, bool $write): void
    {
        $day = Carbon::parse($date);
        if ($day->lt($lecture->starts_on) || $day->gt($lecture->ends_on) || strtolower($day->format('l')) !== $lecture->weekday
            || ($write && ! $lecture->is_active)) {
            throw ValidationException::withMessages(['session_date' => ['هذا التاريخ ليس موعدًا معتمدًا لهذه المحاضرة.']]);
        }
    }

    private function authorizeManager(Request $request): void
    {
        abort_unless(collect(self::MANAGERS)->contains(fn ($role) => $request->user()?->hasRole($role)), 403);
    }

    private function supervisor(Request $request): Person
    {
        abort_unless($request->user()?->hasRole('CLINICAL_SUPERVISOR'), 403);
        abort_unless($request->user()->can('permission', ['supervisor.workspace.view']), 403);
        $person = Person::query()->where('user_id', $request->user()->id)->first()
            ?? Person::query()->where('email', $request->user()->email)->whereNull('user_id')->first();
        if (! $person) abort(404, 'لم نجد ملف المشرف السريري المرتبط بحسابك.');
        if (! $person->user_id) $person->update(['user_id' => $request->user()->id]);
        return $person;
    }

    private function authorizeLecture(Request $request, ClinicalUniversityLecture $lecture): void
    {
        if (collect(self::MANAGERS)->contains(fn ($role) => $request->user()?->hasRole($role)) && $request->user()->can('permission', ['attendance.review'])) return;
        abort_unless((int) $lecture->supervisor_person_id === (int) $this->supervisor($request)->id, 403);
    }

    private function audit(Request $request, string $action, int $id, array $changes, ?int $studentId = null): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => $action,
            'entity_type' => $action === 'clinical_university.attendance_recorded' ? ClinicalUniversityAttendanceRecord::class : ClinicalUniversityLecture::class,
            'entity_id' => $id,
            'student_id' => $studentId, 'changes' => $changes]);
    }
}
