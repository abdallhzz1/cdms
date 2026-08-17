<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\GradeEntry;
use App\Services\WorkflowTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
class GradeEntryController extends Controller {
 public function index(Request $request): JsonResponse { $items=GradeEntry::with('enrollment.course')->paginate($request->integer('per_page',25)); return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); }
 public function store(Request $request): JsonResponse { $data=$request->validate(['student_course_enrollment_id'=>['required','exists:student_course_enrollments,id'],'score'=>['nullable','numeric','min:0'],'max_score'=>['required','numeric','gt:0'],'notes'=>['nullable','string','max:2000']]); if(isset($data['score']) && $data['score']>$data['max_score']) return ApiResponse::error('Score cannot exceed maximum score.', ['score'=>['Score cannot exceed maximum score.']], [], 422); $grade=GradeEntry::updateOrCreate(['student_course_enrollment_id'=>$data['student_course_enrollment_id']],$data+['status'=>'draft']); return ApiResponse::success($grade,'Grade saved.'); }
 public function submit(GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse {
     $workflow->transition($gradeEntry, 'submitted');
     return ApiResponse::success($gradeEntry->fresh(), 'Grade submitted.');
 }
 public function returnGrade(Request $r, GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse {
     $data = $r->validate(['reason' => ['nullable', 'string']]);
     $workflow->transition($gradeEntry, 'returned', $data['reason'] ?? null);
     return ApiResponse::success($gradeEntry->fresh(), 'Grade returned.');
 }
 public function approve(GradeEntry $gradeEntry, WorkflowTransitionService $workflow): JsonResponse {
     $workflow->transition($gradeEntry, 'approved');
     return ApiResponse::success($gradeEntry->fresh(), 'Grade approved.');
 }
}
