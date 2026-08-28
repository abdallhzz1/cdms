<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Models\ClinicalSupervisorEvaluation;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class ClinicalSupervisorEvaluationController extends Controller
{
    private const DOMAINS = [
        ['code' => 'clinical_commitment', 'name_ar' => 'الالتزام بالحضور وتغطية التدريب السريري', 'name_en' => 'Clinical Attendance and Training Coverage', 'weight' => 20],
        ['code' => 'student_supervision', 'name_ar' => 'الإشراف المباشر والتوجيه السريري للطلبة', 'name_en' => 'Direct Clinical Supervision and Student Guidance', 'weight' => 25],
        ['code' => 'assessment_feedback', 'name_ar' => 'جودة التقييم والتغذية الراجعة في الوقت المناسب', 'name_en' => 'Assessment Quality and Timely Feedback', 'weight' => 20],
        ['code' => 'professionalism_communication', 'name_ar' => 'المهنية والتواصل مع الطلبة والفريق العلاجي', 'name_en' => 'Professionalism and Communication', 'weight' => 15],
        ['code' => 'patient_safety_student_welfare', 'name_ar' => 'سلامة المرضى وبيئة تدريب الطلبة', 'name_en' => 'Patient Safety and Student Learning Environment', 'weight' => 10],
        ['code' => 'development_contribution', 'name_ar' => 'التطوير المهني والإسهام في تطوير التدريب', 'name_en' => 'Professional Development and Training Contribution', 'weight' => 10],
    ];

    public function index(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.view');
        $items = ClinicalSupervisorEvaluation::query()->with(['clinicalSupervisor.person', 'academicYear:id,code'])
            ->when($request->filled('clinical_supervisor_user_id'), fn ($query) => $query->where('clinical_supervisor_user_id', $request->integer('clinical_supervisor_user_id')))
            ->latest('updated_at')->get()->map(fn (ClinicalSupervisorEvaluation $item) => $this->present($item, false));
        return ApiResponse::success($items);
    }

    public function options(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.view');
        $role = Role::where('code', 'CLINICAL_SUPERVISOR')->first();
        $supervisors = $role ? User::query()->where('is_active', true)->whereHas('roles', fn ($query) => $query->where('roles.id', $role->id))
            ->with(['person.department'])->orderBy('name')->get()->map(fn (User $user) => [
                'user_id' => $user->id,
                'name' => $user->person?->full_name_ar ?: $user->name,
                'department_name' => $user->person?->department?->name_ar,
            ])->values() : collect();
        return ApiResponse::success(['supervisors' => $supervisors, 'academic_years' => AcademicYear::query()->orderByDesc('start_date')->get(['id', 'code', 'is_current'])]);
    }

    public function show(Request $request, ClinicalSupervisorEvaluation $clinicalSupervisorEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.view');
        return ApiResponse::success($this->present($clinicalSupervisorEvaluation, true));
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.create');
        $payload = $this->validatedPayload($request);
        $this->ensureSupervisor((int) $payload['clinical_supervisor_user_id']);
        $calculated = $this->calculate($payload['domains']);
        $evaluation = ClinicalSupervisorEvaluation::create([
            ...$payload, 'domains' => $calculated['domains'], 'overall_score' => $calculated['score'], 'overall_rating' => $calculated['rating'],
            'status' => 'draft', 'strengths' => $this->cleanList($payload['strengths'] ?? []), 'development_areas' => $this->cleanList($payload['development_areas'] ?? []),
            'activity_log' => [$this->event('draft_created', $request->user())],
        ]);
        return ApiResponse::success($this->present($evaluation, true), 'تم إنشاء مسودة تقييم المشرف.', [], 201);
    }

    public function update(Request $request, ClinicalSupervisorEvaluation $clinicalSupervisorEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.create');
        $this->ensureDraft($clinicalSupervisorEvaluation);
        $payload = $this->validatedPayload($request, false);
        unset($payload['clinical_supervisor_user_id']);
        $calculated = $this->calculate($payload['domains'] ?? $clinicalSupervisorEvaluation->domains);
        $activity = $clinicalSupervisorEvaluation->activity_log ?: [];
        $activity[] = $this->event('draft_updated', $request->user());
        $clinicalSupervisorEvaluation->update([
            ...$payload, 'domains' => $calculated['domains'], 'overall_score' => $calculated['score'], 'overall_rating' => $calculated['rating'],
            'strengths' => array_key_exists('strengths', $payload) ? $this->cleanList($payload['strengths']) : $clinicalSupervisorEvaluation->strengths,
            'development_areas' => array_key_exists('development_areas', $payload) ? $this->cleanList($payload['development_areas']) : $clinicalSupervisorEvaluation->development_areas,
            'activity_log' => $activity,
        ]);
        return ApiResponse::success($this->present($clinicalSupervisorEvaluation->fresh(), true), 'تم حفظ مسودة تقييم المشرف.');
    }

    public function submit(Request $request, ClinicalSupervisorEvaluation $clinicalSupervisorEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.create');
        $this->ensureDraft($clinicalSupervisorEvaluation); $this->ensureComplete($clinicalSupervisorEvaluation);
        $user = $request->user(); $activity = $clinicalSupervisorEvaluation->activity_log ?: []; $activity[] = $this->event('submitted_and_signed', $user);
        $clinicalSupervisorEvaluation->update(['status' => 'submitted', 'evaluator_user_id' => $user->id, 'evaluator_name' => $user->name, 'evaluator_role' => $this->roleLabel($user), 'evaluator_signed_at' => now(), 'submitted_at' => now(), 'activity_log' => $activity]);
        return ApiResponse::success($this->present($clinicalSupervisorEvaluation->fresh(), true), 'تم توقيع التقييم وإرساله للاعتماد.');
    }

    public function approve(Request $request, ClinicalSupervisorEvaluation $clinicalSupervisorEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.approve');
        if ($clinicalSupervisorEvaluation->status !== 'submitted') throw ValidationException::withMessages(['status' => ['لا يمكن اعتماد تقييم غير موقّع من المقيّم.']]);
        $user = $request->user(); $activity = $clinicalSupervisorEvaluation->activity_log ?: []; $activity[] = $this->event('approved_by_dean', $user);
        $clinicalSupervisorEvaluation->update(['status' => 'approved', 'dean_user_id' => $user->id, 'dean_name' => $user->name, 'dean_role' => $this->roleLabel($user), 'dean_signed_at' => now(), 'approved_at' => now(), 'activity_log' => $activity]);
        return ApiResponse::success($this->present($clinicalSupervisorEvaluation->fresh(), true), 'تم اعتماد تقييم المشرف رسميًا.');
    }

    public function reopen(Request $request, ClinicalSupervisorEvaluation $clinicalSupervisorEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'clinical_supervisor_evaluations.approve');
        if ($clinicalSupervisorEvaluation->status === 'draft') throw ValidationException::withMessages(['status' => ['التقييم مسودة بالفعل.']]);
        $activity = $clinicalSupervisorEvaluation->activity_log ?: []; $activity[] = $this->event('reopened_for_revision', $request->user());
        $clinicalSupervisorEvaluation->update(['status' => 'draft', 'evaluator_user_id' => null, 'evaluator_name' => null, 'evaluator_role' => null, 'evaluator_signed_at' => null, 'submitted_at' => null, 'dean_user_id' => null, 'dean_name' => null, 'dean_role' => null, 'dean_signed_at' => null, 'approved_at' => null, 'activity_log' => $activity]);
        return ApiResponse::success($this->present($clinicalSupervisorEvaluation->fresh(), true), 'أعيد التقييم إلى مسودة للمراجعة.');
    }

    private function validatedPayload(Request $request, bool $creating = true): array
    {
        $payload = $request->validate([
            'clinical_supervisor_user_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:users,id'],
            'academic_year_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:academic_years,id'],
            'evaluation_purpose' => [$creating ? 'required' : 'sometimes', Rule::in(['annual_performance', 'renewal'])],
            'domains' => [$creating ? 'required' : 'sometimes', 'array'], 'domains.*.score' => ['required_with:domains', 'numeric', 'min:0', 'max:5'], 'domains.*.comment' => ['nullable', 'string', 'max:3000'],
            'strengths' => ['nullable', 'array', 'max:20'], 'strengths.*' => ['nullable', 'string', 'max:1000'],
            'development_areas' => ['nullable', 'array', 'max:20'], 'development_areas.*' => ['nullable', 'string', 'max:1000'],
            'recommendation' => ['nullable', Rule::in(['continue', 'continue_with_development_plan', 'not_recommend'])], 'recommendation_notes' => ['nullable', 'string', 'max:5000'],
        ]);
        if (isset($payload['domains'])) {
            if (count($payload['domains']) !== count(self::DOMAINS)) throw ValidationException::withMessages(['domains' => ['يجب استكمال محاور التقييم الستة.']]);
            foreach ($payload['domains'] as $code => $domain) {
                if (! collect(self::DOMAINS)->contains(fn ($item) => $item['code'] === $code)) throw ValidationException::withMessages(['domains' => ['توجد محاور غير معتمدة.']]);
                if (fmod((float) $domain['score'] * 10, 5.0) !== 0.0) throw ValidationException::withMessages(["domains.$code.score" => ['يجب أن تكون الدرجة بنصف نقطة.']]);
            }
        }
        return $payload;
    }

    private function calculate(array $input): array
    {
        $score = 0.0; $domains = [];
        foreach (self::DOMAINS as $domain) {
            $item = $input[$domain['code']] ?? null;
            if (! $item) throw ValidationException::withMessages(['domains' => ['يجب استكمال محاور التقييم.']]);
            $raw = (float) $item['score']; $weighted = round(($raw / 5) * $domain['weight'], 1); $score += $weighted;
            $domains[] = [...$domain, 'score' => $raw, 'weighted_score' => $weighted, 'comment' => trim((string) ($item['comment'] ?? ''))];
        }
        $score = round($score, 1); $rating = $score >= 90 ? 'ممتاز' : ($score >= 80 ? 'جيد جدًا' : ($score >= 70 ? 'جيد' : ($score >= 60 ? 'مقبول' : 'غير مرضٍ')));
        return ['domains' => $domains, 'score' => $score, 'rating' => $rating];
    }

    private function ensureSupervisor(int $userId): void
    {
        $role = Role::where('code', 'CLINICAL_SUPERVISOR')->first();
        $valid = $role && User::whereKey($userId)->whereHas('roles', fn ($query) => $query->where('roles.id', $role->id))->exists();
        if (! $valid) throw ValidationException::withMessages(['clinical_supervisor_user_id' => ['المستخدم المحدد ليس مشرفًا سريريًا نشطًا.']]);
    }
    private function ensureDraft(ClinicalSupervisorEvaluation $item): void { if ($item->status !== 'draft') throw ValidationException::withMessages(['status' => ['التقييم الموقّع أو المعتمد لا يعدّل مباشرة.']]); }
    private function ensureComplete(ClinicalSupervisorEvaluation $item): void { if (count($item->domains ?: []) !== count(self::DOMAINS) || collect($item->domains)->contains(fn ($domain) => (float) ($domain['score'] ?? 0) < 1)) throw ValidationException::withMessages(['domains' => ['أكمل محاور التقييم قبل التوقيع.']]); }
    private function ensurePermission(?User $user, string $permission): void { abort_unless($user && Gate::forUser($user)->allows('permission', [$permission]), 403, 'This action is unauthorized.'); }
    private function cleanList(array $items): array { return array_values(array_filter(array_map(fn ($item) => trim((string) $item), $items))); }
    private function event(string $action, User $user): array { return ['action' => $action, 'user_id' => $user->id, 'user_name' => $user->name, 'at' => now()->toIso8601String()]; }
    private function roleLabel(User $user): string { $roles = $user->roles()->pluck('code')->all(); return in_array('DEAN', $roles, true) ? 'عميد كلية الطب' : (in_array('CLINICAL_DIRECTOR', $roles, true) ? 'مدير الدائرة السريرية' : 'إدارة النظام'); }
    private function present(ClinicalSupervisorEvaluation $item, bool $full): array
    {
        $item->loadMissing(['clinicalSupervisor.person', 'academicYear']); $user = $item->clinicalSupervisor;
        $base = ['id' => $item->id, 'clinical_supervisor_user_id' => $item->clinical_supervisor_user_id, 'clinical_supervisor_name' => $user?->person?->full_name_ar ?: $user?->name, 'academic_year_id' => $item->academic_year_id, 'academic_year_name' => $item->academicYear?->code, 'evaluation_purpose' => $item->evaluation_purpose, 'status' => $item->status, 'overall_score' => (float) $item->overall_score, 'overall_rating' => $item->overall_rating, 'recommendation' => $item->recommendation, 'updated_at' => $item->updated_at?->toIso8601String()];
        return $full ? [...$base, 'domains' => $item->domains ?: [], 'strengths' => $item->strengths ?: [], 'development_areas' => $item->development_areas ?: [], 'recommendation_notes' => $item->recommendation_notes, 'evaluator_name' => $item->evaluator_name, 'evaluator_role' => $item->evaluator_role, 'evaluator_signed_at' => $item->evaluator_signed_at?->toIso8601String(), 'dean_name' => $item->dean_name, 'dean_role' => $item->dean_role, 'dean_signed_at' => $item->dean_signed_at?->toIso8601String(), 'activity_log' => $item->activity_log ?: []] : $base;
    }
}
