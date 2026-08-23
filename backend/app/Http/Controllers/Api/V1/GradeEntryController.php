<?php
namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GradeEntry;
use App\Services\WorkflowTransitionService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class GradeEntryController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = GradeEntry::with('enrollment.course');

        $userDeptId = $this->getUserDepartmentId();
        if ($userDeptId) {
            $query->whereHas('enrollment.course', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }

        $items = $query->paginate($request->integer('per_page', 25));

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
        
        $student = $gradeEntry->enrollment?->student;
        if ($student) {
            $student->recalculateGpa();
        }

        return ApiResponse::success($gradeEntry->fresh(), 'Grade approved.');
    }
}
