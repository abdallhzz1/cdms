<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller; use App\Http\Responses\ApiResponse; use App\Models\Correspondence; use App\Services\WorkflowTransitionService; use Illuminate\Http\JsonResponse; use Illuminate\Http\Request; use Illuminate\Validation\Rule;
class CorrespondenceController extends Controller {
 public function index(Request $request): JsonResponse { 
     $query = Correspondence::with(['sender.person', 'assignee.person'])
        ->when($request->filled('search'), fn($q)=>$q->where(fn($x)=>$x->where('reference_number','like','%'.$request->string('search').'%')->orWhere('subject','like','%'.$request->string('search').'%')));
        
     if ($request->query('filter') === 'inbox') {
         $query->where('assigned_to', $request->user()->id)->whereNotIn('status', ['closed', 'draft']);
     } elseif ($request->query('filter') === 'outbox') {
         $query->where('sender_id', $request->user()->id);
     }

     $items = $query->latest('correspondence_date')->paginate($request->integer('per_page',25)); 
     return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); 
 }

 public function show(Correspondence $correspondence): JsonResponse {
     return ApiResponse::success($correspondence->load(['sender.person', 'assignee.person']));
 }

 public function store(Request $request, \App\Services\WorkflowTransitionService $workflow): JsonResponse { 
     try {
         $data=$request->validate([
             'reference_number'=>['nullable','string','max:100','unique:correspondence,reference_number'],
             'direction'=>['required',Rule::in(['incoming','outgoing', 'internal'])],
             'subject'=>['required','string','max:500'],
             'counterparty'=>['nullable','string','max:255'],
             'correspondence_date'=>['required','date'],
             'summary'=>['nullable','string','max:5000'],
             'priority'=>['nullable', Rule::in(['low', 'normal', 'urgent', 'critical'])],
             'assigned_to'=>['nullable', 'exists:users,id']
         ]); 
     } catch (\Illuminate\Validation\ValidationException $e) {
         \Log::error('Validation failed: ' . json_encode($e->errors()));
         throw $e;
     }
     
     if (empty($data['reference_number'])) {
         $data['reference_number'] = 'REQ-' . date('Ymd') . '-' . rand(1000, 9999);
     }
     
     $data['sender_id'] = $request->user()->id;
     $assignedTo = $data['assigned_to'] ?? null;
     unset($data['assigned_to']);
     
     $corr = Correspondence::create($data);
     $corr->refresh();

     if ($assignedTo) {
         $corr->update(['assigned_to' => $assignedTo]);
         $workflow->transition($corr, 'submitted', 'Directly sent');
     }
     
     return ApiResponse::success($corr->fresh(),'Correspondence created.',[],201); 
 }

 public function forward(Request $request, Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse {
     $data = $request->validate([
         'assigned_to' => ['required', 'exists:users,id'],
         'notes' => ['nullable', 'string', 'max:1000']
     ]);
     $correspondence->update(['assigned_to' => $data['assigned_to']]);
     $workflow->transition($correspondence, 'submitted', $data['notes'] ?? null); // Reuse submitted to indicate it's active
     return ApiResponse::success($correspondence->fresh(), 'Correspondence forwarded successfully.');
 }

 public function approve(Correspondence $correspondence, WorkflowTransitionService $workflow): JsonResponse {
     $workflow->transition($correspondence, 'approved');
     return ApiResponse::success($correspondence->fresh(), 'Correspondence approved.');
 }
}
