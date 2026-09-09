<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\QualityImprovementPlan;
use App\Models\QualityKpi;
use App\Models\QualityKpiMeasurement;
use App\Models\QualitySurvey;
use App\Models\QualitySurveyResponse;
use App\Models\QualityFinding;
use App\Models\QualityEvidence;
use App\Models\User;
use App\Models\AcademicYear;
use App\Services\WorkflowTransitionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class QualityImprovementController extends Controller
{
    public function overview(Request $request): JsonResponse
    {
        $open = ['open', 'in_progress', 'under_review'];
        $year = $request->string('academic_year')->toString();
        $plans = QualityImprovementPlan::query()->when($year, fn ($q) => $q->where('academic_year', $year));
        $surveys = QualitySurvey::query()->when($year, fn ($q) => $q->where('academic_year', $year));
        $measurements = QualityKpiMeasurement::query()->when($year, fn ($q) => $q->where('academic_year', $year));
        return ApiResponse::success([
            'counts' => [
                'surveys' => (clone $surveys)->count(),
                'survey_responses' => QualitySurveyResponse::when($year, fn ($q) => $q->whereHas('survey', fn ($s) => $s->where('academic_year', $year)))->count(),
                'kpis' => QualityKpi::where('is_active', true)->count(),
                'kpis_achieved' => (clone $measurements)->where('review_status', 'approved')->where('achievement_status', 'achieved')->distinct('quality_kpi_id')->count('quality_kpi_id'),
                'kpis_pending_review' => (clone $measurements)->where('review_status', 'submitted')->count(),
                'plans_open' => (clone $plans)->whereIn('status', $open)->count(),
                'plans_overdue' => (clone $plans)->whereIn('status', $open)->whereDate('due_date', '<', today())->count(),
                'plans_closed' => (clone $plans)->where('status', 'closed')->count(),
                'findings_open' => QualityFinding::where('status', '!=', 'closed')->when($year, fn ($q) => $q->where('academic_year', $year))->count(),
                'evidence_expiring' => QualityEvidence::where('status', 'approved')->whereBetween('expires_at', [today(), today()->addDays(60)])->count(),
            ],
            'recent_surveys' => (clone $surveys)->withCount(['questions', 'responses'])->latest('updated_at')->limit(5)->get(),
            'recent_plans' => (clone $plans)->with('owner:id,name')->latest('updated_at')->limit(6)->get(),
            'recent_kpis' => QualityKpi::with('latestMeasurement')->orderBy('code')->limit(6)->get(),
            'attention' => [
                'overdue_plans' => (clone $plans)->whereIn('status', $open)->whereDate('due_date', '<', today())->orderBy('due_date')->limit(8)->get(),
                'pending_measurements' => (clone $measurements)->with('kpi:id,code,name')->where('review_status', 'submitted')->oldest('measured_at')->limit(8)->get(),
            ],
        ]);
    }

    public function options(): JsonResponse
    {
        return ApiResponse::success([
            'academic_years' => AcademicYear::query()->orderByDesc('start_date')->get(['id', 'code', 'is_current', 'status']),
            'owners' => User::query()->where('is_active', true)->orderBy('name')->get(['id', 'name', 'email']),
            'kpis' => QualityKpi::where('is_active', true)->orderBy('code')->get(['id', 'code', 'name']),
            'surveys' => QualitySurvey::orderBy('code')->get(['id', 'code', 'title']),
        ]);
    }

    public function plans(Request $request): JsonResponse
    {
        $items = QualityImprovementPlan::query()->with(['owner:id,name,email', 'kpi:id,code,name', 'survey:id,code,title'])
            ->when($request->filled('academic_year'), fn ($q) => $q->where('academic_year', $request->string('academic_year')))
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
        $data = $this->validatePlan($request); $data['status'] = 'open'; $data['created_by'] = $request->user()?->id;
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
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('code')->paginate(min(100, max(1, $request->integer('per_page', 25))));
        return ApiResponse::success($items->items(), null, ['total' => $items->total()]);
    }

    public function storeKpi(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['nullable', 'string', 'max:100', 'unique:quality_kpis,code'], 'name' => ['required', 'string', 'max:500'],
            'category' => ['nullable', 'string', 'max:255'], 'measurement_method' => ['nullable', 'string', 'max:3000'],
            'data_source' => ['nullable', 'string', 'max:255'], 'weight' => ['nullable', 'numeric', 'min:0'],
            'target_value' => ['nullable', 'string', 'max:255'], 'measurement_frequency' => ['nullable', 'string', 'max:100'],
            'responsible' => ['nullable', 'string', 'max:255'], 'value_type' => ['sometimes', Rule::in(['percentage','number','score','days'])],
            'target_numeric' => ['nullable', 'numeric'], 'comparison_operator' => ['sometimes', Rule::in(['gte','lte'])],
            'warning_numeric' => ['nullable', 'numeric'], 'is_active' => ['boolean'],
        ]);
        $data['value_type'] ??= 'percentage';
        $data['comparison_operator'] ??= 'gte';
        $data['code'] = filled($data['code'] ?? null) ? $data['code'] : 'KPI-'.str_pad((string) ((QualityKpi::max('id') ?? 0) + 1), 4, '0', STR_PAD_LEFT);
        return ApiResponse::success(QualityKpi::create($data), 'تم إنشاء مؤشر الجودة.', [], 201);
    }

    public function storeMeasurement(Request $request, QualityKpi $kpi): JsonResponse
    {
        $data = $request->validate([
            'academic_year' => ['nullable', 'string', 'max:100'], 'measured_at' => ['required', 'date'],
            'numeric_value' => ['nullable', 'numeric'], 'display_value' => ['required', 'string', 'max:255'],
            'achievement_status' => ['nullable', Rule::in(['achieved', 'partially_achieved', 'not_achieved', 'not_assessed'])],
            'evidence' => ['nullable', 'string', 'max:5000'], 'notes' => ['nullable', 'string', 'max:5000'],
            'submit_for_review' => ['boolean'],
        ]);
        $numeric = $data['numeric_value'] ?? null;
        if ($numeric !== null && $kpi->target_numeric !== null) {
            $achieved = $kpi->comparison_operator === 'lte' ? $numeric <= (float) $kpi->target_numeric : $numeric >= (float) $kpi->target_numeric;
            $warning = $kpi->warning_numeric === null ? false : ($kpi->comparison_operator === 'lte' ? $numeric <= (float) $kpi->warning_numeric : $numeric >= (float) $kpi->warning_numeric);
            $data['achievement_status'] = $achieved ? 'achieved' : ($warning ? 'partially_achieved' : 'not_achieved');
        } else {
            $data['achievement_status'] ??= 'not_assessed';
        }
        $data['review_status'] = ($data['submit_for_review'] ?? false) ? 'submitted' : 'draft';
        unset($data['submit_for_review']);
        $data['quality_kpi_id'] = $kpi->id; $data['recorded_by'] = $request->user()?->id;
        return ApiResponse::success(QualityKpiMeasurement::create($data), 'تم تسجيل قياس المؤشر.', [], 201);
    }

    public function reviewMeasurement(Request $request, QualityKpiMeasurement $measurement): JsonResponse
    {
        $data = $request->validate(['decision' => ['required', Rule::in(['approved', 'returned'])], 'review_notes' => ['nullable', 'string', 'max:5000']]);
        abort_unless($measurement->review_status === 'submitted', 409, 'Only submitted measurements can be reviewed.');
        $measurement->update(['review_status' => $data['decision'], 'review_notes' => $data['review_notes'] ?? null, 'reviewed_by' => $request->user()?->id, 'reviewed_at' => now()]);
        return ApiResponse::success($measurement->fresh()->load(['kpi:id,code,name', 'reviewer:id,name']), 'تم اعتماد قرار مراجعة القياس.');
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
            if ($data['status'] === 'closed') $plan->update(['closure_evidence' => $data['closure_evidence'], 'verification_result' => $data['verification_result'] ?? null, 'closed_date' => today(), 'progress_percent' => 100, 'verified_by' => request()->user()?->id, 'verified_at' => now()]);
            $updated = $workflow->transition($plan->fresh(), $data['status'], $data['reason'] ?? null);
            return ApiResponse::success($updated, 'تم تحديث حالة خطة التحسين.');
        });
    }

    private function validatePlan(Request $request): array
    {
        return $request->validate([
            'academic_year' => ['nullable', 'string', 'max:100'], 'source' => ['required', 'string', 'max:255'],
            'reference' => ['nullable', 'string', 'max:255'], 'quality_kpi_id' => ['nullable', 'exists:quality_kpis,id'], 'quality_survey_id' => ['nullable', 'exists:quality_surveys,id'], 'observation' => ['required', 'string', 'max:5000'],
            'root_cause' => ['nullable', 'string', 'max:5000'], 'improvement_action' => ['required', 'string', 'max:5000'], 'desired_outcome' => ['nullable', 'string', 'max:5000'], 'responsible' => ['required', 'string', 'max:255'], 'owner_user_id' => ['nullable', 'exists:users,id'],
            'start_date' => ['nullable', 'date'], 'due_date' => ['required', 'date'],
            'priority' => ['required', Rule::in(['low', 'normal', 'high'])], 'progress_percent' => ['nullable', 'integer', 'min:0', 'max:100'], 'data_source' => ['nullable', 'string', 'max:255'],
        ]);
    }
}
