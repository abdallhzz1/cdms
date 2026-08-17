<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller; use App\Http\Responses\ApiResponse; use App\Models\QualityImprovementPlan; use App\Models\QualityKpi; use App\Services\WorkflowTransitionService; use Illuminate\Http\JsonResponse; use Illuminate\Http\Request; use Illuminate\Validation\Rule;
class QualityImprovementController extends Controller {
 public function plans(Request $request): JsonResponse { $items=QualityImprovementPlan::latest('due_date')->paginate($request->integer('per_page',25)); return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); }
 public function storePlan(Request $request): JsonResponse { $data=$request->validate(['academic_year'=>['nullable','string','max:100'],'source'=>['nullable','string','max:255'],'reference'=>['nullable','string','max:255'],'observation'=>['required','string','max:5000'],'improvement_action'=>['required','string','max:5000'],'responsible'=>['nullable','string','max:255'],'start_date'=>['nullable','date'],'due_date'=>['nullable','date'],'priority'=>['required',Rule::in(['low','normal','high'])],'data_source'=>['nullable','string','max:255']]); return ApiResponse::success(QualityImprovementPlan::create($data),'Improvement plan created.',[],201); }
 public function kpis(Request $request): JsonResponse { $items=QualityKpi::orderBy('code')->paginate($request->integer('per_page',25)); return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); }
 public function storeKpi(Request $request): JsonResponse { $data=$request->validate(['code'=>['required','string','max:100','unique:quality_kpis,code'],'name'=>['required','string','max:500'],'category'=>['nullable','string','max:255'],'measurement_method'=>['nullable','string','max:3000'],'data_source'=>['nullable','string','max:255'],'weight'=>['nullable','numeric','min:0'],'target_value'=>['nullable','string','max:255'],'measurement_frequency'=>['nullable','string','max:100'],'responsible'=>['nullable','string','max:255']]); return ApiResponse::success(QualityKpi::create($data),'KPI created.',[],201); }
 public function transition(Request $r, QualityImprovementPlan $plan, WorkflowTransitionService $workflow): JsonResponse {
     $data = $r->validate([
         'status' => ['required', 'string'],
         'reason' => ['nullable', 'string']
     ]);
     $workflow->transition($plan, $data['status'], $data['reason'] ?? null);
     return ApiResponse::success($plan->fresh(), 'Plan transitioned.');
 }
}
