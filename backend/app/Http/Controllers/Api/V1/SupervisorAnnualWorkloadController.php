<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\SupervisorAnnualWorkload;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SupervisorAnnualWorkloadController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $items = SupervisorAnnualWorkload::with('department:id,name_ar,name_en')
            ->when(!$request->boolean('show_archived'), fn($q) => $q->whereNull('archived_at'))
            ->when($request->query('academic_year'), fn ($query, $year) => $query->where('academic_year', $year))
            ->orderByDesc('academic_year')->orderBy('supervisor_name')->paginate($request->integer('per_page', 50));
        return ApiResponse::success($items->items(), null, ['total' => $items->total()]);
    }
    public function store(Request $r): JsonResponse { $d = $r->validate(['academic_year'=>['required','string'], 'academic_level'=>['nullable','string'], 'department_id'=>['nullable','exists:departments,id'], 'person_id'=>['nullable','exists:people,id'], 'supervisor_name'=>['required','string'], 'supervisor_code'=>['nullable','string'], 'supervision_weeks'=>['nullable','integer','min:0'], 'notes'=>['nullable','string']]); return ApiResponse::success(SupervisorAnnualWorkload::create($d), 'Record created.', [], 201); }
    public function update(Request $r, SupervisorAnnualWorkload $supervisorAnnualWorkload): JsonResponse { $supervisorAnnualWorkload->update($r->validate(['academic_year'=>['sometimes','string'], 'academic_level'=>['nullable','string'], 'department_id'=>['nullable','exists:departments,id'], 'person_id'=>['nullable','exists:people,id'], 'supervisor_name'=>['sometimes','string'], 'supervisor_code'=>['nullable','string'], 'supervision_weeks'=>['nullable','integer','min:0'], 'notes'=>['nullable','string']])); return ApiResponse::success($supervisorAnnualWorkload->fresh()); }
    public function archive(SupervisorAnnualWorkload $supervisorAnnualWorkload): JsonResponse { $supervisorAnnualWorkload->update(['archived_at'=>now()]); return ApiResponse::success($supervisorAnnualWorkload->fresh(), 'Record archived.'); }
}
