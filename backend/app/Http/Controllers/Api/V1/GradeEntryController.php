<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasSafePagination;
use App\Http\Responses\ApiResponse;
use App\Models\GradeEntry;
use App\Models\StudentCourseEnrollment;
use App\Models\Course;
use App\Models\Student;
use App\Models\AcademicYear;
use App\Models\ClinicalAssessment;
use App\Services\WorkflowTransitionService;
use App\Services\Approvals\ApprovalWorkflowService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GradeEntryController extends Controller
{
    use HasSafePagination;

    use ScopesByDepartmentAndLevel;

    public function options(): JsonResponse
    {
        $levelScope = $this->getEffectiveAcademicLevelScope();
        $courses = Course::query()
            ->when($levelScope !== null, function ($query) use ($levelScope) {
                empty($levelScope)
                    ? $query->whereRaw('1 = 0')
                    : $query->whereIn('academic_level', $levelScope);
            })
            ->where('is_active', true)
            ->orderBy('academic_level')
            ->orderBy('code')
            ->get(['id', 'code', 'name_ar', 'name_en', 'academic_level', 'is_active']);

        $years = AcademicYear::query()
            ->orderByDesc('is_current')
            ->orderByDesc('start_date')
            ->get(['id', 'code', 'is_current']);

        return ApiResponse::success([
            'academic_years' => $years,
            'courses' => $courses,
            'assigned_levels' => $levelScope,
        ]);
    }

    public function roster(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_id' => ['required', 'integer', 'exists:courses,id'],
            'academic_year_id' => ['required', 'integer', 'exists:academic_years,id'],
        ]);

        $course = Course::findOrFail($data['course_id']);
        if (auth()->user()?->hasRole('RTA') && empty($this->getUserScopedLevels())) {
            return ApiResponse::success([]);
        }
        $this->authorizeCourseDepartmentAccess($course);

        $students = $this->applyStudentAccessScope(Student::query())
            ->where('academic_level', $course->academic_level)
            ->whereIn('registration_status', ['active', 'registered'])
            ->orderBy('university_number')
            ->get(['id', 'university_number', 'full_name_ar', 'full_name_en', 'academic_level']);

        $enrollments = StudentCourseEnrollment::query()
            ->where('course_id', $course->id)
            ->where('academic_year_id', $data['academic_year_id'])
            ->whereIn('student_id', $students->pluck('id'))
            ->with('gradeEntry')
            ->get()
            ->keyBy('student_id');

        $clinical = $this->clinicalScores($students->pluck('id')->all(), $course->id, (int) $data['academic_year_id']);

        return ApiResponse::success($students->map(function (Student $student) use ($enrollments, $clinical) {
            $enrollment = $enrollments->get($student->id);
            return [
                'student' => $student,
                'enrollment_id' => $enrollment?->id,
                'grade_entry' => $enrollment?->gradeEntry,
                'official_clinical_score' => $clinical->get($student->id),
            ];
        })->values());
    }

    public function index(Request $request): JsonResponse
    {
        $query = GradeEntry::with('enrollment.course', 'enrollment.student');
        $studentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');
        $query->whereHas('enrollment', fn ($q) => $q->whereIn('student_id', $studentIds));

        if ($request->has('course_code')) {
            $query->whereHas('enrollment.course', function ($q) use ($request) {
                $q->where('code', $request->course_code);
            });
        }
        
        if ($request->has('academic_level')) {
            $query->whereHas('enrollment.course', function ($q) use ($request) {
                $q->where('academic_level', $request->academic_level);
            });
        }
        
        if ($request->filled('academic_year_id') || $request->filled('academic_year')) {
            $academicYearId = $request->filled('academic_year_id')
                ? $request->integer('academic_year_id')
                : AcademicYear::where('code', $request->input('academic_year'))->value('id');
            $query->whereHas('enrollment', function ($q) use ($academicYearId) {
                $q->where('academic_year_id', $academicYearId ?: -1);
            });
        }

        $items = $query->paginate($this->perPage($request, 100, 200));

        return ApiResponse::success(
            $items->items(),
            null,
            [
                'current_page' => $items->currentPage(),
                'last_page'    => $items->lastPage(),
                'total'        => $items->total()
            ]
        );
    }

    public function clinicalAssessmentSummary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'academic_year' => ['nullable', 'string', 'max:50'],
        ]);
        $studentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');
        $yearId = !empty($filters['academic_year_id'])
            ? (int) $filters['academic_year_id']
            : (!empty($filters['academic_year']) ? (int) AcademicYear::where('code', $filters['academic_year'])->value('id') : null);
        $summary = $this->clinicalScores(
            $studentIds->pluck('id')->all(),
            !empty($filters['course_id']) ? (int) $filters['course_id'] : null,
            $yearId,
            true,
        );

        return ApiResponse::success($summary);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_course_enrollment_id' => ['required', 'exists:student_course_enrollments,id'],
            'score' => ['nullable', 'numeric', 'min:0'],
            'clinical_score' => ['nullable', 'numeric', 'between:0,20'],
            'osce_score' => ['nullable', 'numeric', 'between:0,40'],
            'written_score' => ['nullable', 'numeric', 'between:0,40'],
            'max_score' => ['required', 'numeric', 'gt:0'],
            'notes' => ['nullable', 'string', 'max:2000']
        ]);

        $enrollment = StudentCourseEnrollment::with(['student', 'course'])
            ->findOrFail($data['student_course_enrollment_id']);
        $this->authorizeStudentAccess($enrollment->student);
        $this->authorizeCourseDepartmentAccess($enrollment->course);

        if (isset($data['score']) && $data['score'] > $data['max_score']) {
            return ApiResponse::error('Score cannot exceed maximum score.', ['score' => ['Score cannot exceed maximum score.']], [], 422);
        }

        $officialClinical = $this->clinicalScores([$enrollment->student_id], $enrollment->course_id, $enrollment->academic_year_id)->get($enrollment->student_id);
        $data['clinical_score'] = $officialClinical;
        $data['score'] = $this->totalScore($data['clinical_score'], $data['osce_score'] ?? null, $data['written_score'] ?? null);

        $grade = DB::transaction(function () use ($data) {
            $grade = GradeEntry::where('student_course_enrollment_id', $data['student_course_enrollment_id'])
                ->lockForUpdate()
                ->first();

            if ($grade && in_array($grade->status, ['approved', 'published', 'locked'], true)) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'status' => ['Approved or locked grades cannot be edited.'],
                ]);
            }

            return GradeEntry::updateOrCreate(
                ['student_course_enrollment_id' => $data['student_course_enrollment_id']],
                $data + ['status' => 'draft', 'prepared_by_user_id' => auth()->id(), 'return_reason' => null]
            );
        });

        return ApiResponse::success($grade, 'Grade saved.');
    }
    
    public function batchStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id', 'required_without:academic_year'],
            'academic_year' => ['nullable', 'string', 'exists:academic_years,code', 'required_without:academic_year_id'],
            'grades' => ['required', 'array'],
            'grades.*.student_id' => ['required', 'exists:students,id'],
            'grades.*.score' => ['nullable', 'numeric', 'min:0'],
            'grades.*.clinical_score' => ['nullable', 'numeric', 'between:0,20'],
            'grades.*.osce_score' => ['nullable', 'numeric', 'between:0,40'],
            'grades.*.written_score' => ['nullable', 'numeric', 'between:0,40'],
            'grades.*.max_score' => ['required', 'numeric', 'gt:0'],
            'grades.*.notes' => ['nullable', 'string', 'max:2000']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        $this->authorizeCourseDepartmentAccess($course);
        
        $academicYearId = $this->resolveAcademicYearId($data);

        foreach ($data['grades'] as $gradeData) {
            if (isset($gradeData['score']) && $gradeData['score'] > $gradeData['max_score']) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'grades' => ['Score cannot exceed maximum score.'],
                ]);
            }
            $student = Student::findOrFail($gradeData['student_id']);
            $this->authorizeStudentAccess($student);
        }

        $officialClinical = $this->clinicalScores(array_column($data['grades'], 'student_id'), $course->id, $academicYearId);
        $savedGrades = DB::transaction(function () use ($data, $course, $academicYearId, $officialClinical) {
            $savedGrades = [];
            foreach ($data['grades'] as $gradeData) {
                $enrollment = StudentCourseEnrollment::firstOrCreate([
                    'student_id' => $gradeData['student_id'],
                    'course_id' => $course->id,
                    'academic_year_id' => $academicYearId,
                    'semester' => 'FIRST',
                ]);

                $existing = GradeEntry::where('student_course_enrollment_id', $enrollment->id)
                    ->lockForUpdate()
                    ->first();
                if ($existing && in_array($existing->status, ['approved', 'published', 'locked'], true)) {
                    throw \Illuminate\Validation\ValidationException::withMessages([
                        'status' => ['The batch contains an approved or locked grade. No grades were changed.'],
                    ]);
                }

                $savedGrades[] = GradeEntry::updateOrCreate(
                    ['student_course_enrollment_id' => $enrollment->id],
                    [
                        'score' => $this->totalScore($officialClinical->get($gradeData['student_id']), $gradeData['osce_score'] ?? null, $gradeData['written_score'] ?? null),
                        'clinical_score' => $officialClinical->get($gradeData['student_id']),
                        'osce_score' => $gradeData['osce_score'] ?? null,
                        'written_score' => $gradeData['written_score'] ?? null,
                        'max_score' => $gradeData['max_score'] ?? 100,
                        'notes' => $gradeData['notes'] ?? null,
                        'status' => 'draft',
                        'prepared_by_user_id' => auth()->id(),
                        'submitted_at' => null,
                        'approved_by_user_id' => null,
                        'approved_at' => null,
                        'return_reason' => null,
                    ]
                );
            }

            return $savedGrades;
        });

        return ApiResponse::success($savedGrades, 'Grades saved successfully.');
    }
    
    public function batchSubmit(Request $request, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id', 'required_without:academic_year'],
            'academic_year' => ['nullable', 'string', 'exists:academic_years,code', 'required_without:academic_year_id'],
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        $this->authorizeCourseDepartmentAccess($course);
        
        $academicYearId = $this->resolveAcademicYearId($data);
        DB::transaction(function () use ($course, $academicYearId, $workflow) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->get(['id', 'student_id'])
                ->keyBy('id');

            $grades = GradeEntry::whereIn('student_course_enrollment_id', $enrollments->keys())
                ->whereIn('status', ['draft', 'returned'])->lockForUpdate()->get();
            if ($grades->isEmpty()) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => [$this->tr(
                    'لا توجد علامات محفوظة قابلة للإرسال ضمن هذا الكشف.',
                    'There are no saved editable grades to submit in this sheet.',
                )]]);
            }

            // Clinical marks are owned by the approved supervisor assessments.
            // Refresh them here so a sheet saved before the supervisors finished
            // does not retain stale null values when it is later submitted.
            $officialClinical = $this->clinicalScores($enrollments->pluck('student_id')->all(), $course->id, $academicYearId);
            foreach ($grades as $grade) {
                $studentId = $enrollments->get($grade->student_course_enrollment_id)?->student_id;
                $clinicalScore = $studentId ? $officialClinical->get($studentId) : null;
                $grade->forceFill([
                    'clinical_score' => $clinicalScore,
                    'score' => $this->totalScore($clinicalScore, $grade->osce_score, $grade->written_score),
                ])->save();
            }

            $missingClinical = $grades->whereNull('clinical_score')->count();
            $missingOsce = $grades->whereNull('osce_score')->count();
            $missingWritten = $grades->whereNull('written_score')->count();
            if ($missingClinical || $missingOsce || $missingWritten) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => [
                    $this->incompleteGradeSheetMessage($missingClinical, $missingOsce, $missingWritten),
                ]]);
            }
            foreach ($grades as $grade) {
                $workflow->transition($grade, 'submitted');
                $grade->newQuery()->whereKey($grade->id)->update(['submitted_at' => now(), 'return_reason' => null]);
            }
        });

        $approvals->submit('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId, $request->user(),
            'كشف علامات '.$course->name_ar, 'Grade sheet: '.($course->name_en ?: $course->code), '/grades',
            ['course_id' => $course->id, 'academic_year_id' => $academicYearId]);
        
        return ApiResponse::success(null, 'Grades submitted for approval.');
    }

    public function batchApprove(Request $request, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $user = auth()->user();
        if ($user && $user->hasRole('RTA') && !$user->hasRole('DEPARTMENT_HEAD') && !$user->hasRole('SYS_ADMIN') && !$user->hasRole('DEAN') && !$user->hasRole('CLINICAL_DIRECTOR')) {
            return ApiResponse::error('صلاحية اعتماد العلامات محصورة برئيس القسم الأكاديمي أو العمادة.', [], [], 403);
        }

        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id', 'required_without:academic_year'],
            'academic_year' => ['nullable', 'string', 'exists:academic_years,code', 'required_without:academic_year_id'],
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        $this->authorizeCourseDepartmentAccess($course);
        
        $academicYearId = $this->resolveAcademicYearId($data);
        $result = DB::transaction(function () use ($course, $academicYearId, $workflow, $approvals, $request) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->pluck('id');

            $grades = GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
                ->where('status', 'submitted')->lockForUpdate()->get();
            if ($grades->isEmpty()) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => ['There are no submitted grades to approve.']]);
            }
            if ($grades->contains(fn (GradeEntry $grade) => (int) $grade->prepared_by_user_id === (int) auth()->id())) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => ['The preparer cannot approve the same grade sheet.']]);
            }
            if (! $approvals->pending('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId)) {
                $requester = \App\Models\User::findOrFail((int) $grades->first()->prepared_by_user_id);
                $approvals->submit('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId, $requester,
                    'كشف علامات '.$course->name_ar, 'Grade sheet: '.($course->name_en ?: $course->code), '/grades',
                    ['course_id' => $course->id, 'academic_year_id' => $academicYearId]);
            }
            $decision = $approvals->approve('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId, $request->user());
            if (! $decision['completed']) return $decision;
            foreach ($grades as $grade) {
                $workflow->transition($grade, 'approved');
                $grade->newQuery()->whereKey($grade->id)->update(['approved_by_user_id' => auth()->id(), 'approved_at' => now()]);
            }
            return $decision;
        });
        
        return ApiResponse::success($result['request'], $result['completed']
            ? (app()->getLocale() === 'ar' ? 'اكتمل اعتماد كشف العلامات.' : 'Grade sheet approved successfully.')
            : (app()->getLocale() === 'ar' ? 'تم اعتماد مرحلتك وإرسال الكشف للمرحلة التالية.' : 'Your step was approved and sent to the next stage.'));
    }
    
    public function batchReturn(Request $request, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $user = auth()->user();
        if ($user && $user->hasRole('RTA') && !$user->hasRole('DEPARTMENT_HEAD') && !$user->hasRole('SYS_ADMIN') && !$user->hasRole('DEAN') && !$user->hasRole('CLINICAL_DIRECTOR')) {
            return ApiResponse::error('صلاحية إرجاع العلامات محصورة برئيس القسم الأكاديمي أو العمادة.', [], [], 403);
        }

        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id', 'required_without:academic_year'],
            'academic_year' => ['nullable', 'string', 'exists:academic_years,code', 'required_without:academic_year_id'],
            'reason' => ['required', 'string', 'min:3', 'max:2000']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        $this->authorizeCourseDepartmentAccess($course);
        
        $academicYearId = $this->resolveAcademicYearId($data);
        DB::transaction(function () use ($course, $academicYearId, $data, $workflow, $approvals, $request) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->pluck('id');

            $grades = GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
                ->where('status', 'submitted')->lockForUpdate()->get();
            if ($grades->isEmpty()) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => ['There are no submitted grades to return.']]);
            }
            if (! $approvals->pending('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId)) {
                $requester = \App\Models\User::findOrFail((int) $grades->first()->prepared_by_user_id);
                $approvals->submit('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId, $requester,
                    'كشف علامات '.$course->name_ar, 'Grade sheet: '.($course->name_en ?: $course->code), '/grades',
                    ['course_id' => $course->id, 'academic_year_id' => $academicYearId]);
            }
            $approvals->returnForRevision('grade_sheet', 'grade_sheet', $course->id.':'.$academicYearId, $request->user(), $data['reason']);
            foreach ($grades as $grade) {
                $workflow->transition($grade, 'returned', $data['reason']);
                $grade->newQuery()->whereKey($grade->id)->update(['return_reason' => $data['reason'], 'approved_by_user_id' => null, 'approved_at' => null]);
            }
        });
        
        return ApiResponse::success(null, 'Grades returned for revision.');
    }

    public function submit(GradeEntry $gradeEntry, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $this->authorizeGradeEntryAccess($gradeEntry);
        $gradeEntry->loadMissing('enrollment.course');
        $enrollment = $gradeEntry->enrollment;
        $officialClinical = $this->clinicalScores([$enrollment->student_id], $enrollment->course_id, $enrollment->academic_year_id)
            ->get($enrollment->student_id);
        $gradeEntry->forceFill([
            'clinical_score' => $officialClinical,
            'score' => $this->totalScore($officialClinical, $gradeEntry->osce_score, $gradeEntry->written_score),
        ])->save();
        if ($gradeEntry->clinical_score === null || $gradeEntry->osce_score === null || $gradeEntry->written_score === null || $gradeEntry->score === null) {
            throw \Illuminate\Validation\ValidationException::withMessages(['grade' => [
                $this->incompleteGradeSheetMessage(
                    $gradeEntry->clinical_score === null ? 1 : 0,
                    $gradeEntry->osce_score === null ? 1 : 0,
                    $gradeEntry->written_score === null ? 1 : 0,
                ),
            ]]);
        }
        $workflow->transition($gradeEntry, 'submitted');
        $gradeEntry->newQuery()->whereKey($gradeEntry->id)->update(['submitted_at' => now(), 'return_reason' => null]);
        $gradeEntry->loadMissing('enrollment.course');
        $course = $gradeEntry->enrollment->course;
        $approvals->submit('grade_sheet', 'grade_entry', $gradeEntry->id, auth()->user(), 'علامة طالب في '.$course->name_ar, 'Student grade in '.($course->name_en ?: $course->code), '/grades');
        return ApiResponse::success($gradeEntry->fresh(), 'Grade submitted.');
    }

    public function returnGrade(Request $r, GradeEntry $gradeEntry, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $this->authorizeGradeEntryAccess($gradeEntry);
        $data = $r->validate(['reason' => ['required', 'string', 'min:3', 'max:2000']]);
        if (! $approvals->pending('grade_sheet', 'grade_entry', $gradeEntry->id)) {
            $requester = \App\Models\User::findOrFail((int) $gradeEntry->prepared_by_user_id);
            $approvals->submit('grade_sheet', 'grade_entry', $gradeEntry->id, $requester, 'اعتماد علامة طالب', 'Student grade approval', '/grades');
        }
        $approvals->returnForRevision('grade_sheet', 'grade_entry', $gradeEntry->id, $r->user(), $data['reason']);
        $workflow->transition($gradeEntry, 'returned', $data['reason']);
        $gradeEntry->newQuery()->whereKey($gradeEntry->id)->update(['return_reason' => $data['reason']]);
        return ApiResponse::success($gradeEntry->fresh(), 'Grade returned.');
    }

    public function approve(GradeEntry $gradeEntry, WorkflowTransitionService $workflow, ApprovalWorkflowService $approvals): JsonResponse
    {
        $user = auth()->user();
        if ($user && $user->hasRole('RTA') && !$user->hasRole('DEPARTMENT_HEAD') && !$user->hasRole('SYS_ADMIN') && !$user->hasRole('DEAN') && !$user->hasRole('CLINICAL_DIRECTOR')) {
            return ApiResponse::error('صلاحية اعتماد العلامات محصورة برئيس القسم الأكاديمي أو العمادة.', [], [], 403);
        }

        $this->authorizeGradeEntryAccess($gradeEntry);

        if ((int) $gradeEntry->prepared_by_user_id === (int) auth()->id()) {
            throw \Illuminate\Validation\ValidationException::withMessages(['grade' => ['The preparer cannot approve the same grade.']]);
        }

        if (! $approvals->pending('grade_sheet', 'grade_entry', $gradeEntry->id)) {
            $requester = \App\Models\User::findOrFail((int) $gradeEntry->prepared_by_user_id);
            $approvals->submit('grade_sheet', 'grade_entry', $gradeEntry->id, $requester, 'اعتماد علامة طالب', 'Student grade approval', '/grades');
        }
        $decision = $approvals->approve('grade_sheet', 'grade_entry', $gradeEntry->id, auth()->user());
        if (! $decision['completed']) return ApiResponse::success($decision['request'], app()->getLocale() === 'ar' ? 'تم اعتماد مرحلتك.' : 'Your approval step is complete.');
        $workflow->transition($gradeEntry, 'approved');
        $gradeEntry->newQuery()->whereKey($gradeEntry->id)->update(['approved_by_user_id' => auth()->id(), 'approved_at' => now()]);
        return ApiResponse::success($gradeEntry->fresh(), 'Grade approved.');
    }

    private function authorizeGradeEntryAccess(GradeEntry $gradeEntry): void
    {
        $gradeEntry->loadMissing('enrollment.student', 'enrollment.course');
        $this->authorizeStudentAccess($gradeEntry->enrollment->student);
        $this->authorizeCourseDepartmentAccess($gradeEntry->enrollment->course);
    }

    private function authorizeCourseDepartmentAccess(Course $course): void
    {
        $user = auth()->user();
        if (! $user || (! $user->hasRole('RTA') && ! $user->hasRole('DEPARTMENT_HEAD'))) {
            return;
        }

        $allowedLevels = $this->getUserScopedLevels();
        if (! in_array((string) $course->academic_level, $allowedLevels, true)) {
            throw new \Illuminate\Auth\Access\AuthorizationException('This action is unauthorized.');
        }
    }

    private function resolveAcademicYearId(array $data): int
    {
        if (!empty($data['academic_year_id'])) {
            return (int) $data['academic_year_id'];
        }

        return AcademicYear::where('code', $data['academic_year'])->firstOrFail()->id;
    }

    private function clinicalScores(array $studentIds, ?int $courseId = null, ?int $academicYearId = null, bool $withMetadata = false)
    {
        return ClinicalAssessment::query()
            // A supervisor's submitted weekly assessment is the official
            // clinical input. Administrative approval applies to the final
            // grade sheet, not to each weekly clinical assessment.
            ->whereIn('status', ['submitted', 'approved'])->where('max_score', '>', 0)->whereIn('student_id', $studentIds)
            ->when($courseId, fn ($query) => $query->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $courseId)))
            ->when($academicYearId, fn ($query) => $query->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $academicYearId)))
            ->selectRaw('student_id, ROUND(AVG((score * 20.0) / max_score), 2) as clinical_score, COUNT(*) as assessments_count')
            ->groupBy('student_id')->get()->keyBy('student_id')->map(fn ($item) => $withMetadata
                ? ['clinical_score' => (float) $item->clinical_score, 'assessments_count' => (int) $item->assessments_count]
                : (float) $item->clinical_score);
    }

    private function totalScore(mixed $clinical, mixed $osce, mixed $written): ?float
    {
        if ($clinical === null || $osce === null || $written === null) {
            return null;
        }
        return round((float) $clinical + (float) $osce + (float) $written, 2);
    }

    private function incompleteGradeSheetMessage(int $clinical, int $osce, int $written): string
    {
        $parts = [];
        if ($clinical > 0) {
            $parts[] = $this->tr(
                "التقييم السريري غير مكتمل لـ {$clinical} طالب؛ يجب أن يستكمل المشرفون السريريون تقييماتهم أولاً",
                "the clinical assessment is missing for {$clinical} student(s); supervisors must complete their assessments first",
            );
        }
        if ($osce > 0) {
            $parts[] = $this->tr("علامة OSCE ناقصة لـ {$osce} طالب", "the OSCE score is missing for {$osce} student(s)");
        }
        if ($written > 0) {
            $parts[] = $this->tr("علامة الامتحان النظري ناقصة لـ {$written} طالب", "the written score is missing for {$written} student(s)");
        }

        $separator = app()->getLocale() === 'ar' ? '؛ ' : '; ';
        return $this->tr('لا يمكن إرسال كشف العلامات: ', 'The grade sheet cannot be submitted: ').implode($separator, $parts).'.';
    }

    private function tr(string $ar, string $en): string
    {
        return app()->getLocale() === 'ar' ? $ar : $en;
    }
}
