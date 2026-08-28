<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\QualityImprovementPlan;
use App\Models\QualityKpi;
use App\Models\QualityKpiMeasurement;
use App\Models\QualitySurvey;
use App\Models\QualitySurveyResponse;
use App\Services\WorkflowTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class QualityImprovementController extends Controller
{
    public function overview(): JsonResponse
    {
        $open = ['open', 'in_progress', 'under_review'];
        return ApiResponse::success([
            'counts' => [
                'surveys' => QualitySurvey::count(),
                'survey_responses' => QualitySurveyResponse::count(),
                'kpis' => QualityKpi::count(),
                'kpis_achieved' => QualityKpi::whereHas('latestMeasurement', fn ($q) => $q->where('achievement_status', 'achieved'))->count(),
                'plans_open' => QualityImprovementPlan::whereIn('status', $open)->count(),
                'plans_overdue' => QualityImprovementPlan::whereIn('status', $open)->whereDate('due_date', '<', today())->count(),
                'plans_closed' => QualityImprovementPlan::where('status', 'closed')->count(),
            ],
            'recent_surveys' => QualitySurvey::withCount(['questions', 'responses'])->latest('updated_at')->limit(5)->get(),
            'recent_plans' => QualityImprovementPlan::latest('updated_at')->limit(6)->get(),
            'recent_kpis' => QualityKpi::with('latestMeasurement')->orderBy('code')->limit(6)->get(),
        ]);
    }

    public function plans(Request $request): JsonResponse
    {
        $items = QualityImprovementPlan::query()
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('priority'), fn ($q) => $q->where('priority', $request->string('priority')))
            ->when($request->filled('search'), fn ($q) => $q->where(fn ($inner) => $inner
                ->where('observation', 'like', '%'.$request->string('search').'%')
                ->orWhere('improvement_action', 'like', '%'.$request->string('search').'%')
                ->orWhere('responsible', 'like', '%'.$request->string('search').'%')))
            ->orderByRaw("CASE WHEN status = 'closed' THEN 1 ELSE 0 END")->orderBy('due_date')
            ->paginate(min(100, max(1, $request->integer('per_page', 25))));
        return ApiResponse::success($items->items(), null, ['total' => $items->total()]);
    }

    public function storePlan(Request $request): JsonResponse
    {
        $data = $this->validatePlan($request); $data['status'] = 'open';
        return ApiResponse::success(QualityImprovementPlan::create($data), 'تم إنشاء خطة التحسين.', [], 201);
    }

    public function updatePlan(Request $request, QualityImprovementPlan $plan): JsonResponse
    {
        $plan->update($this->validatePlan($request));
        return ApiResponse::success($plan->fresh(), 'تم تحديث خطة التحسين.');
    }

    public function kpis(Request $request): JsonResponse
    {
        $items = QualityKpi::with(['latestMeasurement', 'measurements' => fn ($q) => $q->limit(8)])
            ->when($request->filled('category'), fn ($q) => $q->where('category', $request->string('category')))
            ->orderBy('code')->paginate(min(100, max(1, $request->integer('per_page', 25))));
        return ApiResponse::success($items->items(), null, ['total' => $items->total()]);
    }

    public function storeKpi(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:100', 'unique:quality_kpis,code'], 'name' => ['required', 'string', 'max:500'],
            'category' => ['nullable', 'string', 'max:255'], 'measurement_method' => ['nullable', 'string', 'max:3000'],
            'data_source' => ['nullable', 'string', 'max:255'], 'weight' => ['nullable', 'numeric', 'min:0'],
            'target_value' => ['nullable', 'string', 'max:255'], 'measurement_frequency' => ['nullable', 'string', 'max:100'],
            'responsible' => ['nullable', 'string', 'max:255'],
        ]);
        return ApiResponse::success(QualityKpi::create($data), 'تم إنشاء مؤشر الجودة.', [], 201);
    }

    public function storeMeasurement(Request $request, QualityKpi $kpi): JsonResponse
    {
        $data = $request->validate([
            'academic_year' => ['nullable', 'string', 'max:100'], 'measured_at' => ['required', 'date'],
            'numeric_value' => ['nullable', 'numeric'], 'display_value' => ['required', 'string', 'max:255'],
            'achievement_status' => ['required', Rule::in(['achieved', 'partially_achieved', 'not_achieved', 'not_assessed'])],
            'evidence' => ['nullable', 'string', 'max:5000'], 'notes' => ['nullable', 'string', 'max:5000'],
        ]);
        $data['quality_kpi_id'] = $kpi->id; $data['recorded_by'] = $request->user()?->id;
        return ApiResponse::success(QualityKpiMeasurement::create($data), 'تم تسجيل قياس المؤشر.', [], 201);
    }

    public function transition(Request $request, QualityImprovementPlan $plan, WorkflowTransitionService $workflow): JsonResponse
    {
        $data = $request->validate([
            'status' => ['required', Rule::in(['in_progress', 'under_review', 'closed'])], 'reason' => ['nullable', 'string', 'max:3000'],
            'closure_evidence' => ['nullable', 'string', 'max:5000'], 'verification_result' => ['nullable', 'string', 'max:5000'],
        ]);
        if ($data['status'] === 'closed' && blank($data['closure_evidence'] ?? null)) {
            throw ValidationException::withMessages(['closure_evidence' => ['دليل الإغلاق مطلوب قبل إغلاق خطة التحسين.']]);
        }
        return DB::transaction(function () use ($data, $plan, $workflow) {
            if ($data['status'] === 'closed') $plan->update(['closure_evidence' => $data['closure_evidence'], 'verification_result' => $data['verification_result'] ?? null, 'closed_date' => today()]);
            $updated = $workflow->transition($plan->fresh(), $data['status'], $data['reason'] ?? null);
            return ApiResponse::success($updated, 'تم تحديث حالة خطة التحسين.');
        });
    }

    private function validatePlan(Request $request): array
    {
        return $request->validate([
            'academic_year' => ['nullable', 'string', 'max:100'], 'source' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'], 'observation' => ['required', 'string', 'max:5000'],
            'improvement_action' => ['required', 'string', 'max:5000'], 'responsible' => ['required', 'string', 'max:255'],
            'start_date' => ['nullable', 'date'], 'due_date' => ['required', 'date'],
            'priority' => ['required', Rule::in(['low', 'normal', 'high'])], 'data_source' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
