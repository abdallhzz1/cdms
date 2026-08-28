<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\DepartmentHeadAssignment;
use App\Models\DepartmentHeadEvaluation;
use App\Models\AcademicYear;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class DepartmentHeadEvaluationController extends Controller
{
    /** @var array<int, array{code:string,name_ar:string,name_en:string,weight:float}> */
    private const DOMAINS = [
        ['code' => 'leadership_administration', 'name_ar' => 'القيادة والإدارة', 'name_en' => 'Leadership and Administration', 'weight' => 15],
        ['code' => 'curriculum_planning', 'name_ar' => 'إدارة المنهاج والتخطيط التعليمي', 'name_en' => 'Curriculum Management and Educational Planning', 'weight' => 15],
        ['code' => 'teaching_activities', 'name_ar' => 'التدريس والأنشطة التعليمية', 'name_en' => 'Teaching and Educational Activities', 'weight' => 15],
        ['code' => 'assessment_management', 'name_ar' => 'إدارة التقييمات والامتحانات', 'name_en' => 'Assessment and Examination Management', 'weight' => 15],
        ['code' => 'faculty_management', 'name_ar' => 'إدارة الهيئة التدريسية والموارد البشرية', 'name_en' => 'Faculty Management and Human Resources', 'weight' => 10],
        ['code' => 'quality_assurance', 'name_ar' => 'ضمان الجودة والاعتماد', 'name_en' => 'Quality Assurance and Accreditation', 'weight' => 10],
        ['code' => 'research_scholarly', 'name_ar' => 'البحث والنشاط العلمي', 'name_en' => 'Research and Scholarly Activities', 'weight' => 5],
        ['code' => 'student_affairs', 'name_ar' => 'شؤون الطلبة والالتزام المهني', 'name_en' => 'Student Affairs and Professionalism', 'weight' => 5],
        ['code' => 'strategic_development', 'name_ar' => 'التطوير الاستراتيجي للقسم', 'name_en' => 'Strategic Development of the Department', 'weight' => 5],
        ['code' => 'program_contributions', 'name_ar' => 'إسهامات خاصة في تطوير برنامج الطب', 'name_en' => 'Special Contributions to Medical Program Development', 'weight' => 5],
    ];

    public function index(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.view');

        $items = DepartmentHeadEvaluation::query()
            ->with(['departmentHead.person', 'department:id,name_ar,name_en', 'academicYear:id,code'])
            ->when($request->filled('department_head_user_id'), fn ($query) => $query->where('department_head_user_id', $request->integer('department_head_user_id')))
            ->when($request->filled('academic_year_id'), fn ($query) => $query->where('academic_year_id', $request->integer('academic_year_id')))
            ->latest('updated_at')
            ->get()
            ->map(fn (DepartmentHeadEvaluation $evaluation) => $this->present($evaluation, false));

        return ApiResponse::success($items);
    }

    public function options(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.view');
        $heads = DepartmentHeadAssignment::query()->current()->heads()
            ->with(['person.user', 'department:id,name_ar,name_en'])
            ->get()
            ->map(fn (DepartmentHeadAssignment $assignment) => [
                'user_id' => $assignment->person?->user_id,
                'name' => $assignment->person?->full_name_ar ?: $assignment->person?->user?->name,
                'department_id' => $assignment->department_id,
                'department_name' => $assignment->department?->name_ar,
            ])
            ->filter(fn (array $head) => filled($head['user_id']))
            ->values();
        $years = AcademicYear::query()->orderByDesc('start_date')->get(['id', 'code', 'is_current']);

        return ApiResponse::success(['heads' => $heads, 'academic_years' => $years]);
    }

    public function show(Request $request, DepartmentHeadEvaluation $departmentHeadEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.view');
        return ApiResponse::success($this->present($departmentHeadEvaluation, true));
    }

    public function store(Request $request): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.create');
        $payload = $this->validatedPayload($request);
        $assignment = $this->currentAssignment($payload['department_head_user_id']);
        $calculated = $this->calculate($payload['domains']);

        $evaluation = DepartmentHeadEvaluation::create([
            ...$payload,
            'department_id' => $assignment->department_id,
            'domains' => $calculated['domains'],
            'overall_score' => $calculated['score'],
            'overall_rating' => $calculated['rating_ar'],
            'status' => 'draft',
            'major_achievements' => $this->cleanList($payload['major_achievements'] ?? []),
            'development_areas' => $this->cleanList($payload['development_areas'] ?? []),
            'activity_log' => [$this->event('draft_created', $request->user())],
        ]);

        return ApiResponse::success($this->present($evaluation, true), 'تم إنشاء مسودة التقييم.', [], 201);
    }

    public function update(Request $request, DepartmentHeadEvaluation $departmentHeadEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.create');
        $this->ensureDraft($departmentHeadEvaluation);
        $payload = $this->validatedPayload($request, false);
        unset($payload['department_head_user_id']);
        $domains = $payload['domains'] ?? $departmentHeadEvaluation->domains;
        $calculated = $this->calculate($domains);
        $activity = $departmentHeadEvaluation->activity_log ?: [];
        $activity[] = $this->event('draft_updated', $request->user());

        $departmentHeadEvaluation->update([
            ...$payload,
            'domains' => $calculated['domains'],
            'overall_score' => $calculated['score'],
            'overall_rating' => $calculated['rating_ar'],
            'major_achievements' => array_key_exists('major_achievements', $payload) ? $this->cleanList($payload['major_achievements']) : $departmentHeadEvaluation->major_achievements,
            'development_areas' => array_key_exists('development_areas', $payload) ? $this->cleanList($payload['development_areas']) : $departmentHeadEvaluation->development_areas,
            'activity_log' => $activity,
        ]);

        return ApiResponse::success($this->present($departmentHeadEvaluation->fresh(), true), 'تم حفظ مسودة التقييم.');
    }

    public function submit(Request $request, DepartmentHeadEvaluation $departmentHeadEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.create');
        $this->ensureDraft($departmentHeadEvaluation);
        $this->ensureComplete($departmentHeadEvaluation);
        $user = $request->user();
        $activity = $departmentHeadEvaluation->activity_log ?: [];
        $activity[] = $this->event('submitted_and_signed', $user);
        $departmentHeadEvaluation->update([
            'status' => 'submitted',
            'evaluator_user_id' => $user->id,
            'evaluator_name' => $user->name,
            'evaluator_role' => $this->roleLabel($user),
            'evaluator_signed_at' => now(),
            'submitted_at' => now(),
            'activity_log' => $activity,
        ]);

        return ApiResponse::success($this->present($departmentHeadEvaluation->fresh(), true), 'تم توقيع التقييم وإرساله للاعتماد.');
    }

    public function approve(Request $request, DepartmentHeadEvaluation $departmentHeadEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.approve');
        if ($departmentHeadEvaluation->status !== 'submitted') {
            throw ValidationException::withMessages(['status' => ['لا يمكن اعتماد تقييم غير موقّع من المقيّم.']]);
        }
        $user = $request->user();
        $activity = $departmentHeadEvaluation->activity_log ?: [];
        $activity[] = $this->event('approved_by_dean', $user);
        $departmentHeadEvaluation->update([
            'status' => 'approved',
            'dean_user_id' => $user->id,
            'dean_name' => $user->name,
            'dean_role' => $this->roleLabel($user),
            'dean_signed_at' => now(),
            'approved_at' => now(),
            'activity_log' => $activity,
        ]);

        return ApiResponse::success($this->present($departmentHeadEvaluation->fresh(), true), 'تم اعتماد التقييم رسميًا.');
    }

    public function reopen(Request $request, DepartmentHeadEvaluation $departmentHeadEvaluation): JsonResponse
    {
        $this->ensurePermission($request->user(), 'department_head_evaluations.approve');
        if ($departmentHeadEvaluation->status === 'draft') {
            throw ValidationException::withMessages(['status' => ['التقييم مسودة بالفعل.']]);
        }
        $activity = $departmentHeadEvaluation->activity_log ?: [];
        $activity[] = $this->event('reopened_for_revision', $request->user());
        $departmentHeadEvaluation->update([
            'status' => 'draft', 'evaluator_user_id' => null, 'evaluator_name' => null,
            'evaluator_role' => null, 'evaluator_signed_at' => null, 'submitted_at' => null,
            'dean_user_id' => null, 'dean_name' => null, 'dean_role' => null,
            'dean_signed_at' => null, 'approved_at' => null, 'activity_log' => $activity,
        ]);

        return ApiResponse::success($this->present($departmentHeadEvaluation->fresh(), true), 'أعيد التقييم إلى مسودة للمراجعة.');
    }

    /** @return array<string, mixed> */
    private function validatedPayload(Request $request, bool $creating = true): array
    {
        $rules = [
            'department_head_user_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:users,id'],
            'academic_year_id' => [$creating ? 'required' : 'sometimes', 'integer', 'exists:academic_years,id'],
            'evaluation_purpose' => [$creating ? 'required' : 'sometimes', Rule::in(['annual_performance', 'renewal', 'reappointment'])],
            'domains' => [$creating ? 'required' : 'sometimes', 'array'],
            // A draft can be saved progressively. A signed evaluation still
            // requires every domain to receive a score from 1 to 5.
            'domains.*.score' => ['required_with:domains', 'numeric', 'min:0', 'max:5'],
            'domains.*.comment' => ['nullable', 'string', 'max:3000'],
            'major_achievements' => ['nullable', 'array', 'max:20'],
            'major_achievements.*' => ['nullable', 'string', 'max:1000'],
            'development_areas' => ['nullable', 'array', 'max:20'],
            'development_areas.*' => ['nullable', 'string', 'max:1000'],
            'recommendation' => ['nullable', Rule::in(['renew', 'renew_with_conditions', 'not_recommend'])],
            'recommendation_notes' => ['nullable', 'string', 'max:5000'],
        ];
        $payload = $request->validate($rules);
        if (isset($payload['domains'])) {
            foreach ($payload['domains'] as $code => $domain) {
                if (! $this->domainByCode($code)) {
                    throw ValidationException::withMessages(['domains' => ['توجد محاور تقييم غير معتمدة.']]);
                }
                if (fmod((float) $domain['score'] * 10, 5.0) !== 0.0) {
                    throw ValidationException::withMessages(["domains.$code.score" => ['يجب أن تكون الدرجة بنصف نقطة (مثل 4 أو 4.5).']]);
                }
            }
            if (count($payload['domains']) !== count(self::DOMAINS)) {
                throw ValidationException::withMessages(['domains' => ['يجب استكمال جميع محاور التقييم العشرة.']]);
            }
        }
        return $payload;
    }

    /** @param array<string, array{score: mixed, comment?: string}> $input @return array{domains: array<int, array<string, mixed>>, score: float, rating_ar: string, rating_en: string} */
    private function calculate(array $input): array
    {
        $score = 0.0;
        $domains = [];
        foreach (self::DOMAINS as $domain) {
            $item = $input[$domain['code']] ?? null;
            if (! $item) throw ValidationException::withMessages(['domains' => ['يجب استكمال جميع محاور التقييم.']]);
            $raw = (float) $item['score'];
            $weighted = round(($raw / 5) * $domain['weight'], 1);
            $score += $weighted;
            $domains[] = [...$domain, 'score' => $raw, 'weighted_score' => $weighted, 'comment' => trim((string) ($item['comment'] ?? ''))];
        }
        $score = round($score, 1);
        [$ratingAr, $ratingEn] = match (true) {
            $score >= 90 => ['ممتاز', 'Excellent'],
            $score >= 80 => ['جيد جدًا', 'Very Good'],
            $score >= 70 => ['جيد', 'Good'],
            $score >= 60 => ['مقبول', 'Fair'],
            default => ['غير مرضٍ', 'Unsatisfactory'],
        };
        return ['domains' => $domains, 'score' => $score, 'rating_ar' => $ratingAr, 'rating_en' => $ratingEn];
    }

    private function currentAssignment(int $userId): DepartmentHeadAssignment
    {
        return DepartmentHeadAssignment::query()->current()->heads()
            ->whereHas('person', fn ($query) => $query->where('user_id', $userId))
            ->with('department')
            ->firstOr(fn () => throw ValidationException::withMessages(['department_head_user_id' => ['المستخدم المحدد ليس رئيس قسم مكلّفًا حاليًا.']]));
    }

    private function ensureDraft(DepartmentHeadEvaluation $evaluation): void
    {
        if ($evaluation->status !== 'draft') {
            throw ValidationException::withMessages(['status' => ['التقييم الموقّع أو المعتمد لا يعدّل مباشرة. استخدم خيار إعادة الفتح للاعتماد.']]);
        }
    }

    private function ensureComplete(DepartmentHeadEvaluation $evaluation): void
    {
        $incomplete = collect($evaluation->domains ?: [])
            ->contains(fn (array $domain) => (float) ($domain['score'] ?? 0) < 1);
        if ($incomplete || count($evaluation->domains ?: []) !== count(self::DOMAINS)) {
            throw ValidationException::withMessages(['domains' => ['أكمل درجات محاور التقييم العشرة قبل التوقيع والإرسال للاعتماد.']]);
        }
    }

    private function ensurePermission(?User $user, string $permission): void
    {
        abort_unless($user && Gate::forUser($user)->allows('permission', [$permission]), 403, 'This action is unauthorized.');
    }

    private function domainByCode(string $code): ?array
    {
        foreach (self::DOMAINS as $domain) if ($domain['code'] === $code) return $domain;
        return null;
    }

    /** @param array<int, mixed> $items @return array<int, string> */
    private function cleanList(array $items): array
    {
        return array_values(array_filter(array_map(fn ($item) => trim((string) $item), $items)));
    }

    /** @return array<string, string> */
    private function event(string $action, User $user): array
    {
        return ['action' => $action, 'user_id' => $user->id, 'user_name' => $user->name, 'at' => now()->toIso8601String()];
    }

    private function roleLabel(User $user): string
    {
        $roles = $user->roles()->pluck('code')->all();
        if (in_array('DEAN', $roles, true)) return 'عميد كلية الطب';
        if (in_array('CLINICAL_DIRECTOR', $roles, true)) return 'مدير الدائرة السريرية';
        if (in_array('VICE_DEAN', $roles, true)) return 'نائب عميد كلية الطب';
        return 'إدارة النظام';
    }

    /** @return array<string, mixed> */
    private function present(DepartmentHeadEvaluation $evaluation, bool $full): array
    {
        $evaluation->loadMissing(['departmentHead.person', 'department', 'academicYear']);
        $head = $evaluation->departmentHead;
        $person = $head?->person;
        $base = [
            'id' => $evaluation->id,
            'department_head_user_id' => $evaluation->department_head_user_id,
            'department_head_name' => $person?->full_name_ar ?: $head?->name,
            'department_name' => $evaluation->department?->name_ar,
            'academic_year_id' => $evaluation->academic_year_id,
            'academic_year_name' => $evaluation->academicYear?->code,
            'evaluation_purpose' => $evaluation->evaluation_purpose,
            'status' => $evaluation->status,
            'overall_score' => (float) $evaluation->overall_score,
            'overall_rating' => $evaluation->overall_rating,
            'recommendation' => $evaluation->recommendation,
            'updated_at' => $evaluation->updated_at?->toIso8601String(),
        ];
        if (! $full) return $base;
        return [...$base,
            'domains' => $evaluation->domains ?: [],
            'major_achievements' => $evaluation->major_achievements ?: [],
            'development_areas' => $evaluation->development_areas ?: [],
            'recommendation_notes' => $evaluation->recommendation_notes,
            'evaluator_name' => $evaluation->evaluator_name,
            'evaluator_role' => $evaluation->evaluator_role,
            'evaluator_signed_at' => $evaluation->evaluator_signed_at?->toIso8601String(),
            'dean_name' => $evaluation->dean_name,
            'dean_role' => $evaluation->dean_role,
            'dean_signed_at' => $evaluation->dean_signed_at?->toIso8601String(),
            'submitted_at' => $evaluation->submitted_at?->toIso8601String(),
            'approved_at' => $evaluation->approved_at?->toIso8601String(),
            'activity_log' => $evaluation->activity_log ?: [],
        ];
    }
}
