<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GradeEntry;
use App\Models\StudentCourseEnrollment;
use App\Models\Course;
use App\Services\WorkflowTransitionService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class GradeEntryController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = GradeEntry::with('enrollment.course', 'enrollment.student');

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
        
        if ($request->has('academic_year')) {
            $query->whereHas('enrollment', function ($q) use ($request) {
                $q->where('academic_year', $request->academic_year);
            });
        }

        $items = $query->paginate($request->integer('per_page', 200));

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

        if (isset($data['score']) && $data['score'] > $data['max_score']) {
            return ApiResponse::error('Score cannot exceed maximum score.', ['score' => ['Score cannot exceed maximum score.']], [], 422);
        }

        $grade = GradeEntry::updateOrCreate(
            ['student_course_enrollment_id' => $data['student_course_enrollment_id']],
            $data + ['status' => 'draft']
        );

        return ApiResponse::success($grade, 'Grade saved.');
    }
    
    public function batchStore(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year' => ['required', 'string'],
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
        
        DB::beginTransaction();
        try {
            $savedGrades = [];
            foreach ($data['grades'] as $gradeData) {
                if (isset($gradeData['score']) && $gradeData['score'] > $gradeData['max_score']) {
                    throw new \Exception('Score cannot exceed maximum score.');
                }
                
                // Find or create enrollment
                $enrollment = StudentCourseEnrollment::firstOrCreate([
                    'student_id' => $gradeData['student_id'],
                    'course_id' => $course->id,
                    'academic_year' => $data['academic_year'],
                    'semester' => 'FIRST' // Defaulting for now
                ]);
                
                $savedGrades[] = GradeEntry::updateOrCreate(
                    ['student_course_enrollment_id' => $enrollment->id],
                    [
                        'score' => $gradeData['score'] ?? null,
                        'clinical_score' => $gradeData['clinical_score'] ?? null,
                        'osce_score' => $gradeData['osce_score'] ?? null,
                        'written_score' => $gradeData['written_score'] ?? null,
                        'max_score' => $gradeData['max_score'] ?? 100,
                        'notes' => $gradeData['notes'] ?? null,
                        'status' => 'draft' // Or whatever logic for status
                    ]
                );
            }
            DB::commit();
            return ApiResponse::success($savedGrades, 'Grades saved successfully.');
        } catch (\Exception $e) {
            DB::rollBack();
            return ApiResponse::error('Failed to save grades: ' . $e->getMessage(), [], [], 422);
        }
    }
    
    public function batchSubmit(Request $request): JsonResponse
    {
        $data = $request->validate([
            'course_code' => ['required', 'string'],
            'academic_year' => ['required', 'string']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        
        $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
            ->where('academic_year', $data['academic_year'])
            ->pluck('id');
            
        GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
            ->where('status', 'draft')
            ->update(['status' => 'submitted']);
        
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
            'academic_year' => ['required', 'string']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        
        $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
            ->where('academic_year', $data['academic_year'])
            ->pluck('id');
            
        GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
            ->where('status', 'submitted')
            ->update(['status' => 'approved']);
        
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
            'academic_year' => ['required', 'string'],
            'reason' => ['nullable', 'string']
        ]);
        
        $course = Course::where('code', $data['course_code'])->first();
        if (!$course) {
            return ApiResponse::error('Course not found.', [], [], 404);
        }
        
        $enrollments = StudentCourseEnrollment::where('course_id', $course->id)
            ->where('academic_year', $data['academic_year'])
            ->pluck('id');
            
        GradeEntry::whereIn('student_course_enrollment_id', $enrollments)
            ->whereIn('status', ['submitted', 'approved'])
            ->update(['status' => 'returned', 'notes' => $data['reason']]);
        
        return ApiResponse::success(null, 'Grades returned for revision.');
    }

    public function submit(GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse
    {
        $workflow->transition($gradeEntry, 'submitted');
        return ApiResponse::success($gradeEntry->fresh(), 'Grade submitted.');
    }

    public function returnGrade(Request $r, GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse
    {
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

        $workflow->transition($gradeEntry, 'approved');
        return ApiResponse::success($gradeEntry->fresh(), 'Grade approved.');
    }
}
