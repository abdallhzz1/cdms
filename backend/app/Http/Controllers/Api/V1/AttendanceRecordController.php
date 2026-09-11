<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\ClinicalSession;
use App\Models\RotationBlock;
use App\Models\StudentClinicalAssignment;
use App\Models\Student;
use App\Traits\ScopesByDepartmentAndLevel;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AttendanceRecordController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'clinical_session_id' => ['nullable', 'integer', 'exists:clinical_sessions,id'],
            'clinical_period_id' => ['nullable', 'integer', 'exists:clinical_periods,id'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'training_site_id' => ['nullable', 'integer', 'exists:training_sites,id'],
            'status' => ['nullable', Rule::in(AttendanceRecord::STATUSES)],
            'date' => ['nullable', 'date'],
            'search' => ['nullable', 'string', 'max:120'],
            'per_page' => ['nullable', 'integer', 'min:10', 'max:100'],
            'page_payload' => ['nullable', 'boolean'],
        ]);

        $query = AttendanceRecord::with(['student', 'session.trainingSite', 'session.rotationBlock.rotation.course', 'session.rotationBlock.rotation.clinicalPeriod', 'recorder:id,name,email']);

        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        $isSupervisorOnly = $this->isSupervisorOnly($roles);
        if ($isSupervisorOnly) {
            $personId = $user?->person?->id;
            $studentIds = StudentClinicalAssignment::query()
                ->where('supervisor_id', $personId ?: 0)
                ->whereHas('distributionVersion', fn ($distribution) => $distribution->where('status', 'published')->where('is_current', true))
                ->pluck('student_id');
            $query->whereIn('student_id', $studentIds);
        }

        $allowedStudentIds = $this->applyStudentAccessScope(Student::query())
            ->select('students.id');
        $query->whereIn('student_id', $allowedStudentIds);

        $userDeptId = $this->getClinicalOperationsDepartmentId();
        if ($userDeptId) {
            $query->whereHas('session.rotationBlock', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }

        $records = $query
            ->when($request->filled('clinical_session_id'), fn ($q) => $q->where('clinical_session_id', $request->integer('clinical_session_id')))
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('date'), fn ($q) => $q->whereHas('session', fn ($session) => $session->whereDate('session_date', $request->string('date'))))
            ->when($request->filled('clinical_period_id'), fn ($q) => $q->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('clinical_period_id', $request->integer('clinical_period_id'))))
            ->when($request->filled('academic_year_id'), fn ($q) => $q->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $request->integer('academic_year_id'))))
            ->when($request->filled('course_id'), fn ($q) => $q->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $request->integer('course_id'))))
            ->when($request->filled('training_site_id'), fn ($q) => $q->whereHas('session', fn ($session) => $session->where('training_site_id', $request->integer('training_site_id'))))
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = trim((string) $request->string('search'));
                $q->whereHas('student', fn ($student) => $student
                    ->where('university_number', 'like', "%{$search}%")
                    ->orWhere('full_name_ar', 'like', "%{$search}%")
                    ->orWhere('full_name_en', 'like', "%{$search}%"));
            });

        $summary = (clone $records)
            ->reorder()->selectRaw('status, COUNT(*) as total')
            ->groupBy('status')->pluck('total', 'status');
        $records = $records
            ->orderByDesc(ClinicalSession::select('session_date')->whereColumn('clinical_sessions.id', 'attendance_records.clinical_session_id'))
            ->orderByDesc('attendance_records.id')
            ->paginate($request->integer('per_page', 25));

        $pagination = [
            'current_page' => $records->currentPage(),
            'last_page' => $records->lastPage(),
            'per_page' => $records->perPage(),
            'total' => $records->total(),
        ];

        if ($request->boolean('page_payload')) {
            return ApiResponse::success([
                'items' => $records->items(),
                'pagination' => $pagination,
                'summary' => collect(AttendanceRecord::STATUSES)->mapWithKeys(fn (string $status) => [$status => (int) ($summary[$status] ?? 0)]),
            ]);
        }

        return ApiResponse::success($records->items(), null, $pagination);
    }

    public function options(Request $request): JsonResponse
    {
        $allowedStudentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');
        $query = ClinicalSession::query()
            ->with([
                'trainingSite:id,name_ar,name_en',
                'rotationBlock.rotation:id,academic_year_id,course_id,clinical_period_id,academic_level',
                'rotationBlock.rotation.academicYear:id,code,is_current',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en,sequence',
            ])
            ->whereHas('attendanceRecords', fn ($records) => $records->whereIn('student_id', $allowedStudentIds));

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $query->whereHas('rotationBlock', fn ($block) => $block->where('department_id', $departmentId));
        }
        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            empty($levelScope)
                ? $query->whereRaw('1 = 0')
                : $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('academic_level', $levelScope));
        }

        $sessions = $query->orderByDesc('session_date')->limit(250)->get();
        $rotations = $sessions->pluck('rotationBlock.rotation')->filter();

        return ApiResponse::success([
            'academic_years' => $rotations->pluck('academicYear')->filter()->unique('id')->sortByDesc('code')->values(),
            'courses' => $rotations->pluck('course')->filter()->unique('id')->sortBy('code')->values(),
            'clinical_periods' => $rotations->pluck('clinicalPeriod')->filter()->unique('id')->sortBy('sequence')->values(),
            'training_sites' => $sessions->pluck('trainingSite')->filter()->unique('id')->sortBy('name_ar')->values(),
            'sessions' => $sessions->map(fn (ClinicalSession $session) => [
                'id' => $session->id,
                'session_date' => $session->session_date?->toDateString(),
                'title' => $session->title,
                'clinical_period_id' => $session->rotationBlock?->rotation?->clinical_period_id,
            ])->values(),
        ]);
    }

    public function groups(Request $request): JsonResponse
    {
        $assignments = $this->scopedCurrentAssignments()
            ->with([
                'student:id,batch_year',
                'studentSubgroup.group',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.academicYear:id,code,is_current',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en,sequence',
                'trainingSite:id,name_ar,name_en',
                'supervisor:id,full_name_ar,full_name_en',
            ])->get();

        $groups = $assignments->groupBy(fn (StudentClinicalAssignment $assignment) => $this->assignmentGroupKey($assignment))
            ->map(function ($items) {
                /** @var StudentClinicalAssignment $first */
                $first = $items->first();
                $rotation = $first->rotationBlock?->rotation;

                return [
                    'assignment_id' => $first->id,
                    'academic_year' => $rotation?->academicYear,
                    'course' => $rotation?->course,
                    'clinical_period' => $rotation?->clinicalPeriod,
                    'block' => [
                        'code' => $first->rotationBlock?->block_code,
                        'from_week' => $first->rotationBlock?->from_week,
                        'to_week' => $first->rotationBlock?->to_week,
                    ],
                    'group_name' => $first->studentSubgroup?->group?->name,
                    'subgroup_name' => $first->studentSubgroup?->name,
                    'batch_year' => $first->student?->batch_year,
                    'training_site' => $first->trainingSite,
                    'supervisor' => $first->supervisor,
                    'student_count' => $items->pluck('student_id')->unique()->count(),
                ];
            })->sortBy(fn (array $group) => implode('|', [
                $group['academic_year']?->code ?? '',
                $group['course']?->code ?? '',
                $group['subgroup_name'] ?? '',
            ]))->values();

        return ApiResponse::success($groups);
    }

    public function groupSummary(Request $request): JsonResponse
    {
        $data = $request->validate([
            'assignment_id' => ['required', 'integer', 'exists:student_clinical_assignments,id'],
            'week' => ['nullable', 'integer', 'min:1', 'max:60'],
        ]);

        /** @var StudentClinicalAssignment $reference */
        $reference = $this->scopedCurrentAssignments()
            ->with([
                'student:id,batch_year',
                'studentSubgroup.group',
                'rotationBlock.rotation.course',
                'rotationBlock.rotation.academicYear',
                'rotationBlock.rotation.clinicalPeriod',
                'trainingSite',
                'supervisor.availabilities',
            ])->findOrFail($data['assignment_id']);

        $assignments = $this->sameAttendanceGroupAssignments($reference)
            ->with([
                'student:id,university_number,full_name_ar,full_name_en,photo_url,batch_year',
                'rotationBlock.rotation',
                'trainingSite:id,name_ar,name_en',
                'supervisor.availabilities',
            ])
            ->get();
        $students = $assignments->pluck('student')->filter()->unique('id')->values();
        $rotation = $reference->rotationBlock?->rotation;
        $totalWeeks = max(
            (int) ($rotation?->duration_weeks ?? 0),
            (int) RotationBlock::query()->where('rotation_id', $rotation?->id)->max('to_week'),
        );
        $availableWeeks = collect($totalWeeks > 0 ? range(1, $totalWeeks) : []);
        $currentWeek = $rotation?->start_date ? Carbon::parse($rotation->start_date)->diffInWeeks(today(), false) + 1 : null;
        $defaultWeek = $currentWeek === null ? $availableWeeks->first() : $availableWeeks->sortBy(fn ($week) => abs($week - $currentWeek))->first();
        $selectedWeek = $request->filled('week') ? $request->integer('week') : $defaultWeek;
        abort_unless($selectedWeek && $availableWeeks->contains($selectedWeek), 422, 'The selected week is outside this group schedule.');

        $weekStart = Carbon::parse($rotation->start_date)->addWeeks($selectedWeek - 1)->startOfDay();
        $weekEnd = $weekStart->copy()->addDays(6)->endOfDay();
        $weekAssignments = $assignments->filter(fn (StudentClinicalAssignment $assignment) =>
            $assignment->rotationBlock
            && (int) $assignment->rotationBlock->from_week <= $selectedWeek
            && (int) $assignment->rotationBlock->to_week >= $selectedWeek);

        $schedule = $weekAssignments->groupBy(fn (StudentClinicalAssignment $assignment) => implode('|', [
            $assignment->rotation_block_id, $assignment->training_site_id ?: 0, $assignment->supervisor_id ?: 0,
        ]))->map(function ($items) use ($weekStart, $weekEnd) {
            /** @var StudentClinicalAssignment $first */
            $first = $items->first();
            $dates = $this->scheduledDates($first, $weekStart, $weekEnd);
            return [
                'rotation_block_id' => $first->rotation_block_id,
                'block_code' => $first->rotationBlock?->block_code,
                'training_site' => $first->trainingSite,
                'supervisor' => $first->supervisor,
                'scheduled_dates' => $dates,
                'student_count' => $items->pluck('student_id')->unique()->count(),
            ];
        })->values();

        $blockIds = $weekAssignments->pluck('rotation_block_id')->filter()->unique();
        $records = AttendanceRecord::query()
            ->with('session:id,rotation_block_id,training_site_id,session_date')
            ->whereIn('student_id', $students->pluck('id'))
            ->whereHas('session', fn ($session) => $session->whereIn('rotation_block_id', $blockIds)->whereBetween('session_date', [$weekStart, $weekEnd]))
            ->get();

        $studentRows = $students->map(function (Student $student) use ($records, $weekAssignments, $weekStart, $weekEnd, $selectedWeek) {
            $studentAssignments = $weekAssignments->where('student_id', $student->id);
            $plan = $studentAssignments->flatMap(function (StudentClinicalAssignment $assignment) use ($weekStart, $weekEnd) {
                return collect($this->scheduledDates($assignment, $weekStart, $weekEnd))->map(fn ($date) => implode('|', [
                    $assignment->rotation_block_id, $assignment->training_site_id ?: 0, $date,
                ]));
            })->unique()->values();
            $weekRecords = $records->where('student_id', $student->id)->filter(function (AttendanceRecord $record) use ($plan) {
                if (! $record->session?->session_date) return false;
                $key = implode('|', [$record->session->rotation_block_id, $record->session->training_site_id ?: 0, $record->session->session_date->toDateString()]);
                return $plan->contains($key);
            });
            $elapsedRequired = $plan->filter(fn ($key) => Carbon::parse(substr(strrchr($key, '|'), 1))->lte(today()))->count();
            $absent = $weekRecords->where('status', 'absent')->count();
            $absencePercentage = $elapsedRequired > 0 ? round(($absent / $elapsedRequired) * 100, 2) : 0;
            return [
                'student' => $student,
                'totals' => [
                    'scheduled_days' => $plan->count(),
                    'elapsed_scheduled_days' => $elapsedRequired,
                    'recorded_days' => $weekRecords->pluck('session.session_date')->filter()->unique()->count(),
                    'present' => $weekRecords->where('status', 'present')->count(),
                    'absent' => $absent,
                    'late' => $weekRecords->where('status', 'late')->count(),
                    'excused' => $weekRecords->where('status', 'excused')->count(),
                    'absence_percentage' => $absencePercentage,
                    'warning_level' => $absencePercentage > 20 ? 20 : ($absencePercentage > 10 ? 10 : null),
                ],
            ];
        });

        return ApiResponse::success([
            'group' => [
                'assignment_id' => $reference->id,
                'academic_year' => $rotation?->academicYear,
                'course' => $rotation?->course,
                'clinical_period' => $rotation?->clinicalPeriod,
                'group_name' => $reference->studentSubgroup?->group?->name,
                'subgroup_name' => $reference->studentSubgroup?->name,
                'batch_year' => $reference->student?->batch_year,
                'student_count' => $students->count(),
            ],
            'weeks' => $availableWeeks->map(fn ($week) => [
                'number' => $week,
                'start_date' => Carbon::parse($rotation->start_date)->addWeeks($week - 1)->toDateString(),
                'end_date' => Carbon::parse($rotation->start_date)->addWeeks($week - 1)->addDays(6)->toDateString(),
            ]),
            'selected_week' => ['number' => $selectedWeek, 'start_date' => $weekStart->toDateString(), 'end_date' => $weekEnd->toDateString()],
            'schedule' => $schedule,
            'students' => $studentRows,
        ]);
    }

    public function gaps(Request $request): JsonResponse
    {
        $request->validate([
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'clinical_period_id' => ['nullable', 'integer', 'exists:clinical_periods,id'],
            'date' => ['nullable', 'date'],
            'include_complete' => ['nullable', 'boolean'],
        ]);

        $targetDate = $request->filled('date')
            ? Carbon::parse($request->string('date'))->startOfDay()
            : null;
        $includeComplete = $request->boolean('include_complete');

        $assignments = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($version) => $version->where('status', 'published')->where('is_current', true))
            ->whereIn('student_id', $this->applyStudentAccessScope(Student::query())->select('students.id'))
            ->when($request->filled('academic_year_id'), fn ($query) => $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $request->integer('academic_year_id'))))
            ->when($request->filled('course_id'), fn ($query) => $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $request->integer('course_id'))))
            ->when($request->filled('clinical_period_id'), fn ($query) => $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->where('clinical_period_id', $request->integer('clinical_period_id'))))
            ->with([
                'student:id,university_number',
                'studentSubgroup.group',
                'rotationBlock.rotation.course:id,code,name_ar,name_en',
                'rotationBlock.rotation.clinicalPeriod:id,code,name_ar,name_en,sequence',
                'trainingSite:id,name_ar,name_en',
                'supervisor:id,full_name_ar,full_name_en',
                'supervisor.availabilities',
            ])->get();

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $assignments = $assignments->where('department_id', $departmentId);
        }

        $blockIds = $assignments->pluck('rotation_block_id')->unique();
        $sessions = ClinicalSession::query()
            ->whereIn('rotation_block_id', $blockIds)
            ->when(
                $targetDate,
                fn ($query) => $query->whereDate('session_date', $targetDate),
                fn ($query) => $query->whereDate('session_date', '<=', today()),
            )
            ->with('attendanceRecords:id,clinical_session_id,student_id,status')
            ->get()->keyBy(fn (ClinicalSession $session) => $session->rotation_block_id.'|'.$session->training_site_id.'|'.$session->session_date->toDateString());

        $gaps = $assignments
            ->filter(fn (StudentClinicalAssignment $assignment) => $assignment->supervisor && $assignment->training_site_id)
            ->groupBy(fn (StudentClinicalAssignment $assignment) => implode('|', [
                $assignment->distribution_version_id, $assignment->supervisor_id, $assignment->rotation_block_id,
                $assignment->training_site_id, $assignment->student_subgroup_id ?: 0,
            ]))
            ->flatMap(function ($group) use ($sessions, $targetDate, $includeComplete) {
                /** @var StudentClinicalAssignment $first */
                $first = $group->first();
                $rotation = $first->rotationBlock?->rotation;
                $block = $first->rotationBlock;
                if (! $rotation?->start_date || ! $block?->from_week || ! $block?->to_week) return [];

                $start = Carbon::parse($rotation->start_date)->addWeeks((int) $block->from_week - 1)->startOfDay();
                $end = Carbon::parse($rotation->start_date)->addWeeks((int) $block->to_week)->subDay()->min(today())->endOfDay();
                if ($targetDate) {
                    if ($targetDate->lt($start) || $targetDate->gt($end)) return [];
                    $start = $targetDate->copy();
                    $end = $targetDate->copy()->endOfDay();
                }
                if ($start->gt($end)) return [];

                $availability = $first->supervisor->availabilities->filter(fn ($row) =>
                    (int) $row->training_site_id === (int) $first->training_site_id
                    && ($row->status ?: 'work') === 'work'
                    && (! $row->available_until || $row->available_until->gte($start))
                    && (! $row->available_from || $row->available_from->lte($end))
                );
                if ($availability->isEmpty()) return [];

                $studentIds = $group->pluck('student_id')->map(fn ($id) => (int) $id)->unique();
                $items = [];
                for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
                    if (! $availability->contains(fn ($row) =>
                        $row->day === strtolower($date->format('l'))
                        && (! $row->available_from || $row->available_from->lte($date))
                        && (! $row->available_until || $row->available_until->gte($date)))) continue;

                    $key = $first->rotation_block_id.'|'.$first->training_site_id.'|'.$date->toDateString();
                    $session = $sessions->get($key);
                    $attendance = $session?->attendanceRecords->whereIn('student_id', $studentIds) ?? collect();
                    $recorded = $attendance->count();
                    if (! $includeComplete && $recorded >= $studentIds->count()) continue;

                    $items[] = [
                        'date' => $date->toDateString(),
                        'expected_students' => $studentIds->count(),
                        'recorded_students' => $recorded,
                        'missing_students' => $studentIds->count() - $recorded,
                        'status_summary' => collect(AttendanceRecord::STATUSES)->mapWithKeys(
                            fn (string $status) => [$status => $attendance->where('status', $status)->count()]
                        ),
                        'course' => $rotation->course,
                        'clinical_period' => $rotation->clinicalPeriod,
                        'training_site' => $first->trainingSite,
                        'supervisor' => $first->supervisor,
                        'group_name' => $first->studentSubgroup?->name ?: $first->studentSubgroup?->group?->name,
                    ];
                }
                return $items;
            })->sortByDesc('date')->values();

        return ApiResponse::success($gaps->take(100)->values(), null, ['total' => $gaps->count(), 'limited' => $gaps->count() > 100]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'clinical_session_id' => ['required', 'exists:clinical_sessions,id'],
            'student_id' => ['required', 'exists:students,id'],
            'status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'excuse_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $student = Student::findOrFail($data['student_id']);
        $this->authorizeStudentAccess($student);
        $session = \App\Models\ClinicalSession::with('rotationBlock.rotation')->findOrFail($data['clinical_session_id']);
        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            $sessionLevel = (string) $session->rotationBlock?->rotation?->academic_level;
            abort_unless(! empty($levelScope) && in_array($sessionLevel, $levelScope, true), 403, 'This session is outside your assigned cohort.');
        }

        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        if ($this->isSupervisorOnly($roles)) {
            $personId = $user?->person?->id;
            $ownsStudent = StudentClinicalAssignment::query()
                ->where('supervisor_id', $personId ?: 0)
                ->where('student_id', $data['student_id'])
                ->where('rotation_block_id', $session->rotation_block_id)
                ->where(function ($query) use ($session) {
                    $session->training_site_id
                        ? $query->where('training_site_id', $session->training_site_id)
                        : $query->whereNull('training_site_id');
                })
                ->whereHas('distributionVersion', fn ($distribution) => $distribution->where('status', 'published')->where('is_current', true))
                ->exists();
            abort_unless($ownsStudent, 403, 'You may only record attendance for students currently assigned to you.');
        }

        $data['recorded_by_user_id'] = $user?->id;

        $record = AttendanceRecord::updateOrCreate(
            ['clinical_session_id' => $data['clinical_session_id'], 'student_id' => $data['student_id']],
            $data,
        );

        return ApiResponse::success($record, 'Attendance recorded.');
    }

    private function scopedCurrentAssignments()
    {
        $query = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($version) => $version
                ->where('status', 'published')
                ->where('is_current', true))
            ->whereIn('student_id', $this->applyStudentAccessScope(Student::query())->select('students.id'));

        $departmentId = $this->getClinicalOperationsDepartmentId();
        if ($departmentId) {
            $query->where('department_id', $departmentId);
        }

        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            empty($levelScope)
                ? $query->whereRaw('1 = 0')
                : $query->whereHas('student', fn ($student) => $student->whereIn('academic_level', $levelScope));
        }

        return $query;
    }

    private function sameAttendanceGroupAssignments(StudentClinicalAssignment $reference)
    {
        $reference->loadMissing('student:id,batch_year');

        return $this->scopedCurrentAssignments()
            ->where('distribution_version_id', $reference->distribution_version_id)
            ->where('student_subgroup_id', $reference->student_subgroup_id)
            ->whereHas('student', fn ($student) => $student->where('batch_year', $reference->student?->batch_year));
    }

    private function assignmentGroupKey(StudentClinicalAssignment $assignment): string
    {
        return implode('|', [
            $assignment->distribution_version_id,
            $assignment->student_subgroup_id ?: 0,
            $assignment->student?->batch_year ?: 0,
        ]);
    }

    /** @return array<string> */
    private function scheduledDates(StudentClinicalAssignment $assignment, Carbon $rangeStart, Carbon $rangeEnd): array
    {
        $assignment->loadMissing('supervisor.availabilities', 'rotationBlock.rotation');
        $rotation = $assignment->rotationBlock?->rotation;
        $block = $assignment->rotationBlock;
        if (! $rotation?->start_date || ! $block?->from_week || ! $block?->to_week || ! $assignment->training_site_id || ! $assignment->supervisor) {
            return [];
        }

        $assignmentStart = Carbon::parse($rotation->start_date)->addWeeks((int) $block->from_week - 1)->startOfDay();
        $assignmentEnd = Carbon::parse($rotation->start_date)->addWeeks((int) $block->to_week)->subDay()->endOfDay();
        $start = $rangeStart->copy()->max($assignmentStart)->startOfDay();
        $end = $rangeEnd->copy()->min($assignmentEnd)->endOfDay();
        $availability = $assignment->supervisor->availabilities->filter(fn ($row) =>
            (int) $row->training_site_id === (int) $assignment->training_site_id
            && ($row->status ?: 'work') === 'work'
            && (! $row->available_until || $row->available_until->gte($start))
            && (! $row->available_from || $row->available_from->lte($end)));

        $dates = [];
        for ($date = $start->copy(); $date->lte($end); $date->addDay()) {
            if ($availability->contains(fn ($row) =>
                $row->day === strtolower($date->format('l'))
                && (! $row->available_from || $row->available_from->lte($date))
                && (! $row->available_until || $row->available_until->gte($date)))) {
                $dates[] = $date->toDateString();
            }
        }

        return $dates;
    }

    private function isSupervisorOnly($roles): bool
    {
        return $roles->contains('CLINICAL_SUPERVISOR')
            && ! $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN'])->count();
    }
}
