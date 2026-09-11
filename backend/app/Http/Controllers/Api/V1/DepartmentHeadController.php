<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepartmentHeadAssignment;
use App\Models\DepartmentHeadEvaluation;
use App\Models\DepartmentHeadProfile;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\ProfileAuthorizationService;
use App\Services\SecureFileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class DepartmentHeadController extends Controller
{
    public function __construct(private readonly ProfileAuthorizationService $profileAuthorization) {}

    /**
     * GET /api/v1/dept-heads
     * List all current Department Heads with their latest approved official evaluation.
     */
    public function index(Request $request): JsonResponse
    {
        $canViewEvaluation = Gate::forUser($request->user())->allows('permission', ['department_head_evaluations.view']);
        $assignments = DepartmentHeadAssignment::query()->current()->heads()
            ->whereHas('person.user', fn ($query) => $query->where('is_active', true))
            ->with(['department:id,name_ar,name_en', 'person.user.departmentHeadProfile', 'person.user.userProfile', 'person.user.roles'])
            ->orderBy('department_id')->get();
        $officialByHead = $canViewEvaluation
            ? DepartmentHeadEvaluation::query()->where('status', 'approved')
                ->whereIn('department_head_user_id', $assignments->pluck('person.user_id')->filter())
                ->with('academicYear:id,code')->orderByDesc('approved_at')->get()
                ->unique('department_head_user_id')->keyBy('department_head_user_id')
            : collect();

        $data = $assignments->map(function (DepartmentHeadAssignment $assignment) use ($canViewEvaluation, $officialByHead) {
            $person = $assignment->person;
            $user = $person->user;
            $profile = $user->departmentHeadProfile ?: new DepartmentHeadProfile(['user_id' => $user->id]);
            $shared = $user->userProfile;
            $officialEvaluation = $officialByHead->get($user->id);
            $deptName = preg_replace('/^قسم\s+/', '', $assignment->department?->name_ar ?: 'غير محدد');

            return [
                'id' => (string) $user->id,
                'user_id' => $user->id,
                'assignment_id' => $assignment->id,
                'name' => $person->full_name_ar ?: $user->name,
                'email' => $user->email,
                'title' => $profile->academic_title ?: 'غير محدد',
                'department_id' => $assignment->department_id,
                'department_name' => $deptName,
                'contract_type' => $profile->contract_type ?: 'غير محدد',
                'appointment_date' => $profile->appointment_date,
                'specialty' => $profile->specialty,
                'phone' => $profile->phone ?: $person->phone,
                'avatar_url' => $user->userProfile?->avatar_url ?: $person->photo_url ?: $profile->avatar_url,
                'cv_summary' => $shared?->bio ?: $profile->cv_summary ?: '',
                'publications' => $shared?->publications ?: $profile->publications ?: [],
                'conferences' => $shared?->conferences ?: $profile->conferences ?: [],
                'documents' => [],
                'official_evaluation' => $canViewEvaluation ? $this->officialEvaluationSummary($officialEvaluation) : null,
                // Compatibility fields now intentionally mirror the official
                // approved form; the legacy automatic KPI is no longer used.
                'kpi_score' => $canViewEvaluation ? (float) ($officialEvaluation?->overall_score ?? 0) : null,
                'kpi_rating' => $canViewEvaluation ? $officialEvaluation?->overall_rating : null,
                'kpi_complete' => $canViewEvaluation && $officialEvaluation !== null,
            ];
        })->values();

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    /**
     * GET /api/v1/dept-heads/{id}
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeView($request->user(), $userId);

        $u = User::with(['roles', 'person.department', 'person.headAssignments' => fn ($query) => $query->current()->heads()->with('department'), 'departmentHeadProfile.department', 'userProfile'])->find($userId);

        if (! $u) {
            return response()->json([
                'success' => false,
                'message' => 'Department head user not found.',
            ], 404);
        }

        $profile = $u->departmentHeadProfile ?: new DepartmentHeadProfile(['user_id' => $u->id]);
        $shared = $u->userProfile;
        $currentAssignment = $u->person?->headAssignments?->first();
        $deptName = $currentAssignment?->department?->name_ar
            ?: ($profile->department?->name_ar ?: ($u->person?->department?->name_ar ?: 'غير محدد'));

        if (str_starts_with($deptName, 'قسم ')) {
            $deptName = preg_replace('/^قسم\s+/', '', $deptName);
        }

        $canViewEvaluation = Gate::forUser($request->user())->allows('permission', ['department_head_evaluations.view']);
        $officialEvaluation = $canViewEvaluation
            ? DepartmentHeadEvaluation::query()->where('department_head_user_id', $u->id)
                ->where('status', 'approved')->with('academicYear:id,code')
                ->orderByDesc('approved_at')->first()
            : null;

        return response()->json([
            'success' => true,
            'data' => [
                'id' => (string) $u->id,
                'user_id' => $u->id,
                'name' => $u->person ? $u->person->full_name_ar : $u->name,
                'email' => $u->email,
                'title' => $profile->academic_title ?: 'غير محدد',
                'department_id' => $currentAssignment?->department_id,
                'department_name' => $deptName,
                'contract_type' => $profile->contract_type ?: 'غير محدد',
                'appointment_date' => $profile->appointment_date,
                'specialty' => $profile->specialty,
                'phone' => $profile->phone ?: $u->person?->phone,
                'avatar_url' => $u->userProfile?->avatar_url ?: $u->person?->photo_url ?: $profile->avatar_url,
                'cv_summary' => $shared?->bio ?: $profile->cv_summary ?: '',
                'publications' => $shared?->publications ?: $profile->publications ?: [],
                'conferences' => $shared?->conferences ?: $profile->conferences ?: [],
                'documents' => $request->user()?->id === $userId || Gate::forUser($request->user())->allows('permission', ['people.manage'])
                    ? ($shared?->documents ?: $profile->documents ?: []) : [],
                'official_evaluation' => $canViewEvaluation ? $this->officialEvaluationSummary($officialEvaluation) : null,
                'kpi_score' => $canViewEvaluation ? (float) ($officialEvaluation?->overall_score ?? 0) : null,
                'kpi_rating' => $canViewEvaluation ? $officialEvaluation?->overall_rating : null,
                'kpi_complete' => $canViewEvaluation && $officialEvaluation !== null,
                'kpi_breakdown' => null,
            ],
        ]);
    }

    /**
     * PUT /api/v1/dept-heads/{id}
     * Update Department Head Profile (CV, publications, conferences, etc.)
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $payload = $request->validate([
            'title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'academic_title' => ['sometimes', 'nullable', 'string', 'max:255'],
            'specialty' => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone' => ['sometimes', 'nullable', 'string', 'max:40'],
            'cv_summary' => ['sometimes', 'nullable', 'string', 'max:3000'],
            'contract_type' => ['sometimes', 'nullable', 'string', 'max:255'],
            'appointment_date' => ['sometimes', 'nullable', 'date'],
            'publications' => ['sometimes', 'array', 'max:100'],
            'conferences' => ['sometimes', 'array', 'max:100'],
        ]);
        $canManagePeople = Gate::forUser($request->user())->allows('permission', ['people.manage']);

        $profile->update([
            'academic_title' => $canManagePeople ? ($payload['title'] ?? $payload['academic_title'] ?? $profile->academic_title) : $profile->academic_title,
            'specialty' => $canManagePeople ? ($payload['specialty'] ?? $profile->specialty) : $profile->specialty,
            'contract_type' => $canManagePeople ? ($payload['contract_type'] ?? $profile->contract_type) : $profile->contract_type,
            'appointment_date' => $canManagePeople ? ($payload['appointment_date'] ?? $profile->appointment_date) : $profile->appointment_date,
            'phone' => $payload['phone'] ?? $profile->phone,
            'cv_summary' => $payload['cv_summary'] ?? $profile->cv_summary,
            'publications' => isset($payload['publications']) ? $payload['publications'] : $profile->publications,
            'conferences' => isset($payload['conferences']) ? $payload['conferences'] : $profile->conferences,
        ]);

        $user = User::with('person')->find($userId);
        if ($user?->person) {
            $user->person->update([
                'phone' => $payload['phone'] ?? $user->person->phone,
                'specialty' => $canManagePeople ? ($payload['specialty'] ?? $user->person->specialty) : $user->person->specialty,
                'academic_degree' => $canManagePeople ? ($payload['title'] ?? $payload['academic_title'] ?? $user->person->academic_degree) : $user->person->academic_degree,
            ]);
        }
        $shared = UserProfile::firstOrCreate(['user_id' => $userId]);
        $sharedUpdates = [];
        if (array_key_exists('phone', $payload)) {
            $sharedUpdates['phone'] = $payload['phone'];
        }
        if ($canManagePeople && array_key_exists('specialty', $payload)) {
            $sharedUpdates['specialty'] = $payload['specialty'];
        }
        if ($canManagePeople && (array_key_exists('title', $payload) || array_key_exists('academic_title', $payload))) {
            $sharedUpdates['academic_degree'] = $payload['title'] ?? $payload['academic_title'];
        }
        if (array_key_exists('cv_summary', $payload)) {
            $sharedUpdates['bio'] = $payload['cv_summary'];
        }
        if (array_key_exists('publications', $payload)) {
            $sharedUpdates['publications'] = array_values($payload['publications']);
        }
        if (array_key_exists('conferences', $payload)) {
            $sharedUpdates['conferences'] = array_values($payload['conferences']);
        }
        if ($sharedUpdates !== []) {
            $shared->update($sharedUpdates);
        }

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/evaluation
     * Save official Dean / Clinical Director Evaluation
     */
    public function saveEvaluation(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->authorizeEvaluationManager($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $eval = $request->input('evaluation', $request->all());

        $profile->update([
            'evaluation' => [
                'evaluator_name' => $eval['evaluator_name'] ?? ($request->user() ? $request->user()->name : 'د. معتز التميمي'),
                'evaluator_role' => $eval['evaluator_role'] ?? 'مدير الدائرة السريرية',
                'leadership_score' => (float) ($eval['leadership_score'] ?? 7.5),
                'clinical_score' => (float) ($eval['clinical_score'] ?? 7.5),
                'comments' => $eval['comments'] ?? 'تم التقييم والاعتماد الرسمي.',
                'evaluation_date' => $eval['evaluation_date'] ?? now()->format('Y/m/d'),
            ],
        ]);

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/weights
     */
    public function saveWeights(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->authorizeEvaluationManager($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $weights = $request->input('kpi_weights', $request->all());

        $profile->update([
            'kpi_weights' => $weights,
        ]);

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/overrides
     */
    public function saveOverrides(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->authorizeEvaluationManager($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $overrides = $request->input('kpi_overrides', $request->all());

        $profile->update([
            'kpi_overrides' => $overrides,
        ]);

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/avatar
     * Upload profile avatar photo directly to server storage.
     */
    public function uploadAvatar(Request $request, string $id, SecureFileUploadService $files): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $source = $request->file('avatar') ?: $request->input('avatar_base64');
        if (! $source) {
            return response()->json(['success' => false, 'message' => 'No image file provided.'], 400);
        }

        $stored = $files->storeAvatar($source, 'avatars/department-heads/'.$userId);
        $oldPath = $profile->avatar_storage_path;
        $profile->update([
            'avatar_url' => $stored['url'],
            'avatar_storage_path' => $stored['path'],
        ]);
        $sharedProfile = UserProfile::firstOrCreate(['user_id' => $userId]);
        $sharedProfile->update(['avatar_url' => $stored['url'], 'avatar_storage_path' => $stored['path']]);
        User::with('person')->find($userId)?->person?->update(['photo_url' => $stored['url']]);
        if ($oldPath && $oldPath !== $stored['path']) {
            Storage::disk('public')->delete($oldPath);
        }

        return response()->json(['success' => true, 'avatar_url' => $stored['url']]);
    }

    /**
     * POST /api/v1/dept-heads/{id}/documents
     * Upload profile document file or base64 data to server storage and update profile.
     */
    public function uploadDocument(Request $request, string $id, SecureFileUploadService $files): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $docName = $request->input('name', 'وثيقة رسمية');
        $docCategory = $request->input('category', 'أخرى');
        $source = $request->file('file') ?: $request->input('file_base64');
        if (! $source) {
            return response()->json([
                'success' => false,
                'message' => 'No file provided for upload.',
            ], 400);
        }

        $stored = $files->storeDocument($source, 'profile-documents/department-heads/'.$userId);
        $docId = 'doc_'.Str::uuid();

        $newDoc = [
            'id' => $docId,
            'name' => $docName,
            'category' => $docCategory,
            'file_url' => url("/api/v1/dept-heads/{$userId}/documents/{$docId}/download"),
            'storage_path' => $stored['storage_path'],
            'mime_type' => $stored['mime_type'],
            'file_type' => $stored['file_type'],
            'file_size' => round($stored['size_bytes'] / (1024 * 1024), 2).' MB',
            'created_at' => date('Y-m-d'),
        ];

        $currentDocs = is_array($profile->documents) ? $profile->documents : [];
        $currentDocs[] = $newDoc;

        $profile->update(['documents' => $currentDocs]);
        UserProfile::updateOrCreate(['user_id' => $userId], ['documents' => $currentDocs]);

        return response()->json([
            'success' => true,
            'data' => $newDoc,
            'documents' => $currentDocs,
            'message' => 'Document uploaded and saved successfully.',
        ]);
    }

    /**
     * DELETE /api/v1/dept-heads/{id}/documents/{docId}
     */
    public function deleteDocument(Request $request, string $id, string $docId): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $currentDocs = is_array($profile->documents) ? $profile->documents : [];
        $deleted = collect($currentDocs)->first(fn ($doc) => (string) ($doc['id'] ?? '') === (string) $docId);
        if (! empty($deleted['storage_path'])) {
            Storage::disk('local')->delete($deleted['storage_path']);
        }

        $filtered = array_values(array_filter($currentDocs, function ($doc) use ($docId) {
            return isset($doc['id']) ? (string) $doc['id'] !== (string) $docId : true;
        }));

        $profile->update(['documents' => $filtered]);
        UserProfile::updateOrCreate(['user_id' => $userId], ['documents' => $filtered]);

        return response()->json([
            'success' => true,
            'documents' => $filtered,
            'message' => 'Document deleted successfully.',
        ]);
    }

    public function downloadDocument(Request $request, string $id, string $docId)
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureCurrentDepartmentHead($userId);
        $this->profileAuthorization->authorizeView($request->user(), $userId);
        $profile = DepartmentHeadProfile::where('user_id', $userId)->firstOrFail();
        $document = collect($profile->documents ?: [])->first(
            fn ($doc) => (string) ($doc['id'] ?? '') === (string) $docId
        );

        if (! $document || empty($document['storage_path']) || ! Storage::disk('local')->exists($document['storage_path'])) {
            abort(404);
        }

        $filename = preg_replace('/[^\pL\pN._-]+/u', '_', (string) ($document['name'] ?? 'document'))
            .'.'.($document['file_type'] ?? 'bin');

        return Storage::disk('local')->download($document['storage_path'], $filename, [
            'Content-Type' => $document['mime_type'] ?? 'application/octet-stream',
            'X-Content-Type-Options' => 'nosniff',
        ]);
    }

    private function defaultWeights(): array
    {
        return [
            'gradeTimelinessWeight' => 25,
            'rotationMgmtWeight' => 25,
            'researchWeight' => 20,
            'confWeight' => 15,
            'evaluationWeight' => 15,
        ];
    }

    private function calculateKpi(DepartmentHeadProfile $profile): array
    {
        $w = $profile->kpi_weights ?: $this->defaultWeights();
        $ov = $profile->kpi_overrides ?: [];
        $eval = $profile->evaluation;

        $wGrades = (float) ($w['gradeTimelinessWeight'] ?? 25);
        $wRotations = (float) ($w['rotationMgmtWeight'] ?? 25);
        $wResearch = (float) ($w['researchWeight'] ?? 20);
        $wConf = (float) ($w['confWeight'] ?? 15);
        $wEval = (float) ($w['evaluationWeight'] ?? 15);

        $gScore = isset($ov['gradeTimelinessScore']) ? (float) $ov['gradeTimelinessScore'] : 0.0;
        $rScore = isset($ov['rotationMgmtScore']) ? (float) $ov['rotationMgmtScore'] : 0.0;

        $pubCount = is_array($profile->publications) ? count($profile->publications) : 0;
        $resScore = isset($ov['researchScore']) ? (float) $ov['researchScore'] : min($wResearch, $pubCount * 5);

        $confCount = is_array($profile->conferences) ? count($profile->conferences) : 0;
        $cScore = isset($ov['confScore']) ? (float) $ov['confScore'] : min($wConf, $confCount * 5);

        $rawEvalSum = $eval ? ((float) ($eval['leadership_score'] ?? 0) + (float) ($eval['clinical_score'] ?? 0)) : 0.0;
        $eScore = $eval ? round(($rawEvalSum / 15.0) * $wEval, 1) : 0.0;

        $totalScore = min(100.0, round($gScore + $rScore + $resScore + $cScore + $eScore, 1));
        $isComplete = isset($ov['gradeTimelinessScore'], $ov['rotationMgmtScore']) && is_array($eval);
        $rating = 'غير مكتمل';
        if ($isComplete) {
            $rating = 'مقبول';
            if ($totalScore >= 90) {
                $rating = 'ممتاز';
            } elseif ($totalScore >= 80) {
                $rating = 'جيد جداً';
            } elseif ($totalScore >= 70) {
                $rating = 'جيد';
            }
        }

        return [
            'gradeTimelinessScore' => $gScore,
            'rotationMgmtScore' => $rScore,
            'researchScore' => $resScore,
            'confScore' => $cScore,
            'directorDeanEvalScore' => $eScore,
            'totalScore' => $isComplete ? $totalScore : null,
            'rating' => $rating,
            'isComplete' => $isComplete,
            'weights' => $w,
            'overrides' => $ov,
        ];
    }

    private function resolveUserId(Request $request, string $id): int
    {
        if ($id === 'me') {
            return $request->user() ? $request->user()->id : 0;
        }

        $val = (int) $id;
        if ($val > 0) {
            return $val;
        }

        return 0;
    }

    /** @return array<string, mixed>|null */
    private function officialEvaluationSummary(?DepartmentHeadEvaluation $evaluation): ?array
    {
        if (! $evaluation) {
            return null;
        }

        return [
            'id' => $evaluation->id,
            'overall_score' => (float) $evaluation->overall_score,
            'overall_rating' => $evaluation->overall_rating,
            'academic_year_name' => $evaluation->academicYear?->code,
            'evaluation_purpose' => $evaluation->evaluation_purpose,
            'approved_at' => $evaluation->approved_at?->toIso8601String(),
        ];
    }

    private function ensureCurrentDepartmentHead(int $userId): void
    {
        $assigned = DepartmentHeadAssignment::query()
            ->current()
            ->heads()
            ->whereHas('person', fn ($query) => $query->where('user_id', $userId))
            ->exists();

        abort_unless($assigned, 404, 'Department head profile not found.');
    }

    private function authorizeEvaluationManager(?User $user): void
    {
        if ($user && Gate::forUser($user)->allows('permission', ['department_head_evaluations.create'])) {
            return;
        }

        abort(403, 'This action is unauthorized.');
    }
}
