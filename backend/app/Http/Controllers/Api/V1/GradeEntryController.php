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
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GradeEntryController extends Controller
{
    use HasSafePagination;

    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = GradeEntry::with('enrollment.course', 'enrollment.student');
        $studentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');
        $query->whereHas('enrollment', fn ($q) => $q->whereIn('student_id', $studentIds));

        $userDeptId = $this->getUserDepartmentId();
        if ($userDeptId) {
            $query->whereHas('enrollment.course', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }
        
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
        $summary = ClinicalAssessment::query()
            ->where('status', 'approved')
            ->where('max_score', '>', 0)
            ->whereIn('student_id', $studentIds)
            ->when(! empty($filters['course_id']), fn ($query) => $query->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $filters['course_id'])))
            ->when(! empty($filters['academic_year_id']), fn ($query) => $query->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $filters['academic_year_id'])))
            ->when(empty($filters['academic_year_id']) && ! empty($filters['academic_year']), fn ($query) => $query->whereHas('session.rotationBlock.rotation.academicYear', fn ($year) => $year->where('code', $filters['academic_year'])))
            ->selectRaw('student_id, ROUND(AVG((score / max_score) * 20), 2) as clinical_score, COUNT(*) as assessments_count')
            ->groupBy('student_id')
            ->get()
            ->keyBy('student_id')
            ->map(fn ($item) => [
                'clinical_score' => (float) $item->clinical_score,
                'assessments_count' => (int) $item->assessments_count,
            ]);

        return ApiResponse::success($summary);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_course_enrollment_id' => ['required', 'exists:student_course_enrollments,id'],
            'score' => ['nullable', 'numeric', 'min:0'],
            'clinical_score' => ['nullable', 'numeric', 'min:0'],
            'osce_score' => ['nullable', 'numeric', 'min:0'],
            'written_score' => ['nullable', 'numeric', 'min:0'],
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
                $data + ['status' => 'draft']
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
            'grades.*.clinical_score' => ['nullable', 'numeric', 'min:0'],
            'grades.*.osce_score' => ['nullable', 'numeric', 'min:0'],
            'grades.*.written_score' => ['nullable', 'numeric', 'min:0'],
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

        $savedGrades = DB::transaction(function () use ($data, $course, $academicYearId) {
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
                        'score' => $gradeData['score'] ?? null,
                        'clinical_score' => $gradeData['clinical_score'] ?? null,
                        'osce_score' => $gradeData['osce_score'] ?? null,
                        'written_score' => $gradeData['written_score'] ?? null,
                        'max_score' => $gradeData['max_score'] ?? 100,
                        'notes' => $gradeData['notes'] ?? null,
                        'status' => 'draft',
                    ]
                );
            }

            return $savedGrades;
        });

        return ApiResponse::success($savedGrades, 'Grades saved successfully.');
    }
    
    public function batchSubmit(Request $request): JsonResponse
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
        DB::transaction(function () use ($course, $academicYearId) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->pluck('id');

            GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
                ->where('status', 'draft')
                ->lockForUpdate()
                ->update(['status' => 'submitted']);
        });
        
        return ApiResponse::success(null, 'Grades submitted for approval.');
    }

    public function batchApprove(Request $request): JsonResponse
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
        DB::transaction(function () use ($course, $academicYearId) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->pluck('id');

            GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
                ->where('status', 'submitted')
                ->lockForUpdate()
                ->update(['status' => 'approved']);
        });
        
        return ApiResponse::success(null, 'Grades approved successfully.');
    }
    
    public function batchReturn(Request $request): JsonResponse
    {
        $user = auth()->user();
        if ($user && $user->hasRole('RTA') && !$user->hasRole('DEPARTMENT_HEAD') && !$user->hasRole('SYS_ADMIN') && !$user->hasRole('DEAN') && !$user->hasRole('CLINICAL_DIRECTOR')) {
            return ApiResponse::error('صلاحية إرجاع العلامات محصورة برئيس القسم الأكاديمي أو العمادة.', [], [], 403);
        }

        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id', 'required_without:academic_year'],
            'academic_year' => ['nullable', 'string', 'exists:academic_years,code', 'required_without:academic_year_id'],
            'reason' => ['nullable', 'string']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        $this->authorizeCourseDepartmentAccess($course);
        
        $academicYearId = $this->resolveAcademicYearId($data);
        DB::transaction(function () use ($course, $academicYearId, $data) {
            $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
                ->where('academic_year_id', $academicYearId)
                ->pluck('id');

            GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
                ->whereIn('status', ['submitted', 'approved'])
                ->lockForUpdate()
                ->update(['status' => 'returned', 'notes' => $data['reason'] ?? null]);
        });
        
        return ApiResponse::success(null, 'Grades returned for revision.');
    }

    public function submit(GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->authorizeGradeEntryAccess($gradeEntry);
        $workflow->transition($gradeEntry, 'submitted');
        return ApiResponse::success($gradeEntry->fresh(), 'Grade submitted.');
    }

    public function returnGrade(Request $r, GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse
    {
        $this->authorizeGradeEntryAccess($gradeEntry);
        $data = $r->validate(['reason' => ['nullable', 'string']]);
        $workflow->transition($gradeEntry, 'returned', $data['reason'] ?? null);
        return ApiResponse::success($gradeEntry->fresh(), 'Grade returned.');
    }

    public function approve(GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse
    {
        $user = auth()->user();
        if ($user && $user->hasRole('RTA') && !$user->hasRole('DEPARTMENT_HEAD') && !$user->hasRole('SYS_ADMIN') && !$user->hasRole('DEAN') && !$user->hasRole('CLINICAL_DIRECTOR')) {
            return ApiResponse::error('صلاحية اعتماد العلامات محصورة برئيس القسم الأكاديمي أو العمادة.', [], [], 403);
        }

        $this->authorizeGradeEntryAccess($gradeEntry);

        $workflow->transition($gradeEntry, 'approved');
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
        $departmentId = $this->getUserDepartmentId();
        if ($departmentId && (int) $course->department_id !== $departmentId) {
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
}
