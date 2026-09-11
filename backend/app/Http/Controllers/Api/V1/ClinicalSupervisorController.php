<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\ClinicalSupervisorProfile;
use App\Models\Role;
use App\Models\User;
use App\Models\UserProfile;
use App\Services\ProfileAuthorizationService;
use App\Services\SecureFileUploadService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ClinicalSupervisorController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(private readonly ProfileAuthorizationService $profileAuthorization) {}

    public function index(Request $request): JsonResponse
    {
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->first();

        $query = User::with(['roles', 'person.department', 'clinicalSupervisorProfile.department', 'userProfile']);

        if ($supervisorRole) {
            $query->whereHas('roles', function ($q) use ($supervisorRole) {
                $q->where('roles.id', $supervisorRole->id);
            });
        }

        $userDeptId = $this->getUserDepartmentId();
        if ($userDeptId) {
            $query->whereHas('person', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }

        $users = $query->where('is_active', true)->get();

        $uniqueUsers = $users->unique(function ($u) {
            return strtolower($u->email);
        })->values();

        $data = $uniqueUsers->map(function ($u) {
            $profile = $u->clinicalSupervisorProfile ?: new ClinicalSupervisorProfile(['user_id' => $u->id]);
            $shared = $u->userProfile;

            // Present a safe fallback without mutating data during a GET request.
            if (is_string($profile->academic_title) && str_contains($profile->academic_title, '??')) {
                $profile->academic_title = null;
            }

            $deptName = $this->resolveDeptName($u, $profile);

            return [
                'id' => (string) $u->id,
                'user_id' => $u->id,
                'name' => $u->person ? $u->person->full_name_ar : $u->name,
                'name_en' => $u->person ? $u->person->full_name_en : $u->name,
                'email' => $u->email,
                'title' => $u->person?->academic_degree ?: ($profile->academic_title ?: 'غير محدد'),
                'department_name' => $deptName,
                'contract_type' => $u->person?->contract_type ?: $profile->contract_type,
                'appointment_date' => $profile->appointment_date,
                'specialty' => $u->person?->specialty ?: $profile->specialty,
                'phone' => $u->userProfile?->phone ?: ($u->person?->phone ?: $profile->phone),
                'avatar_url' => $u->userProfile?->avatar_url ?: ($u->person?->photo_url ?: $profile->avatar_url),
                'cv_summary' => $shared?->bio ?: $profile->cv_summary ?: '',
                'publications' => $shared?->publications ?: $profile->publications ?: [],
                'conferences' => $shared?->conferences ?: $profile->conferences ?: [],
                'documents' => [],
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data,
        ]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeView($request->user(), $userId);

        $u = User::with(['roles', 'person.department', 'clinicalSupervisorProfile.department', 'userProfile'])->find($userId);

        if (! $u) {
            return response()->json([
                'success' => false,
                'message' => 'Clinical supervisor user not found.',
            ], 404);
        }

        $profile = $u->clinicalSupervisorProfile ?: new ClinicalSupervisorProfile(['user_id' => $u->id]);
        $shared = $u->userProfile;

        if (is_string($profile->academic_title) && str_contains($profile->academic_title, '??')) {
            $profile->academic_title = null;
        }

        $deptName = $this->resolveDeptName($u, $profile);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => (string) $u->id,
                'user_id' => $u->id,
                'name' => $u->person ? $u->person->full_name_ar : $u->name,
                'name_en' => $u->person ? $u->person->full_name_en : $u->name,
                'email' => $u->email,
                'title' => $u->person?->academic_degree ?: ($profile->academic_title ?: 'غير محدد'),
                'department_name' => $deptName,
                'contract_type' => $u->person?->contract_type ?: $profile->contract_type,
                'appointment_date' => $profile->appointment_date,
                'specialty' => $u->person?->specialty ?: $profile->specialty,
                'phone' => $u->userProfile?->phone ?: ($u->person?->phone ?: $profile->phone),
                'avatar_url' => $u->userProfile?->avatar_url ?: ($u->person?->photo_url ?: $profile->avatar_url),
                'cv_summary' => $shared?->bio ?: $profile->cv_summary ?: '',
                'publications' => $shared?->publications ?: $profile->publications ?: [],
                'conferences' => $shared?->conferences ?: $profile->conferences ?: [],
                'documents' => $request->user()?->id === $userId || Gate::forUser($request->user())->allows('permission', ['people.manage'])
                    ? ($shared?->documents ?: $profile->documents ?: []) : [],
            ],
        ]);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $userId]);
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

    public function saveEvaluation(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeEvaluation($request->user());
        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $userId]);
        $eval = $request->input('evaluation', $request->all());

        $profile->update([
            'evaluation' => [
                'evaluator_name' => $eval['evaluator_name'] ?? ($request->user() ? $request->user()->name : 'المدير السريري'),
                'evaluator_role' => $eval['evaluator_role'] ?? 'مدير الدائرة السريرية',
                'leadership_score' => (float) ($eval['leadership_score'] ?? 7.5),
                'clinical_score' => (float) ($eval['clinical_score'] ?? 7.5),
                'comments' => $eval['comments'] ?? 'تم التقييم والاعتماد الرسمي.',
                'evaluation_date' => $eval['evaluation_date'] ?? now()->format('Y/m/d'),
            ],
        ]);

        return $this->show($request, (string) $userId);
    }

    public function uploadAvatar(Request $request, string $id, SecureFileUploadService $files): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $userId]);

        $source = $request->file('avatar') ?: $request->input('avatar_base64');
        if (! $source) {
            return response()->json(['success' => false, 'message' => 'No file provided.'], 400);
        }

        $stored = $files->storeAvatar($source, 'avatars/clinical-supervisors/'.$userId);
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

    public function uploadDocument(Request $request, string $id, SecureFileUploadService $files): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $userId]);
        $docName = $request->input('name', 'وثيقة رسمية');
        $docCategory = $request->input('category', 'أخرى');
        $source = $request->file('file') ?: $request->input('file_base64');
        if (! $source) {
            return response()->json(['success' => false], 400);
        }

        $stored = $files->storeDocument($source, 'profile-documents/clinical-supervisors/'.$userId);
        $docId = 'doc_'.Str::uuid();

        $newDoc = [
            'id' => $docId,
            'name' => $docName,
            'category' => $docCategory,
            'file_url' => url("/api/v1/clinical-supervisors/{$userId}/documents/{$docId}/download"),
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

        return response()->json(['success' => true, 'data' => $newDoc, 'documents' => $currentDocs]);
    }

    public function deleteDocument(Request $request, string $id, string $docId): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = ClinicalSupervisorProfile::firstOrCreate(['user_id' => $userId]);
        $currentDocs = is_array($profile->documents) ? $profile->documents : [];

        $deleted = collect($currentDocs)->first(fn ($doc) => (string) ($doc['id'] ?? '') === (string) $docId);
        if (! empty($deleted['storage_path'])) {
            Storage::disk('local')->delete($deleted['storage_path']);
        }

        $filtered = array_values(array_filter($currentDocs, fn ($doc) => isset($doc['id']) ? (string) $doc['id'] !== (string) $docId : true
        ));

        $profile->update(['documents' => $filtered]);
        UserProfile::updateOrCreate(['user_id' => $userId], ['documents' => $filtered]);

        return response()->json(['success' => true, 'documents' => $filtered]);
    }

    public function downloadDocument(Request $request, string $id, string $docId)
    {
        $userId = $this->resolveUserId($request, $id);
        $this->ensureClinicalSupervisor($userId);
        $this->profileAuthorization->authorizeView($request->user(), $userId);
        $profile = ClinicalSupervisorProfile::where('user_id', $userId)->firstOrFail();
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

    private function resolveDeptName(User $u, ClinicalSupervisorProfile $profile): string
    {
        $deptName = $u->person && $u->person->department
            ? $u->person->department->name_ar
            : ($profile->department ? $profile->department->name_ar : 'القسم السريري');

        if (str_starts_with($deptName, 'قسم ')) {
            $deptName = preg_replace('/^قسم\s+/', '', $deptName);
        }

        return $deptName;
    }

    private function defaultWeights(): array
    {
        return [
            'sessionAttendanceWeight' => 30,
            'researchWeight' => 20,
            'confWeight' => 15,
            'evaluationWeight' => 20,
            'studentFeedbackWeight' => 15,
        ];
    }

    private function calculateKpi(ClinicalSupervisorProfile $profile): array
    {
        $w = $profile->kpi_weights ?: $this->defaultWeights();
        $ov = $profile->kpi_overrides ?: [];
        $eval = $profile->evaluation;

        $wSession = (float) ($w['sessionAttendanceWeight'] ?? 30);
        $wResearch = (float) ($w['researchWeight'] ?? 20);
        $wConf = (float) ($w['confWeight'] ?? 15);
        $wEval = (float) ($w['evaluationWeight'] ?? 20);
        $wFeedback = (float) ($w['studentFeedbackWeight'] ?? 15);

        $sessionScore = isset($ov['sessionAttendanceScore']) ? (float) $ov['sessionAttendanceScore'] : 0.0;

        $pubCount = is_array($profile->publications) ? count($profile->publications) : 0;
        $resScore = isset($ov['researchScore'])
            ? (float) $ov['researchScore']
            : min($wResearch, $pubCount * 5);

        $confCount = is_array($profile->conferences) ? count($profile->conferences) : 0;
        $cScore = isset($ov['confScore'])
            ? (float) $ov['confScore']
            : min($wConf, $confCount * 5);

        $rawEvalSum = $eval ? ((float) ($eval['leadership_score'] ?? 0) + (float) ($eval['clinical_score'] ?? 0)) : 0.0;
        $eScore = $eval ? round(($rawEvalSum / 15.0) * $wEval, 1) : 0.0;

        $feedbackScore = isset($ov['studentFeedbackScore']) ? (float) $ov['studentFeedbackScore'] : 0.0;

        $totalScore = min(100.0, round($sessionScore + $resScore + $cScore + $eScore + $feedbackScore, 1));

        $isComplete = isset($ov['sessionAttendanceScore'], $ov['studentFeedbackScore']) && is_array($eval);
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
            'sessionAttendanceScore' => $sessionScore,
            'researchScore' => $resScore,
            'confScore' => $cScore,
            'directorEvalScore' => $eScore,
            'studentFeedbackScore' => $feedbackScore,
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

        return $val > 0 ? $val : 0;
    }

    private function ensureClinicalSupervisor(int $userId): void
    {
        abort_unless(User::whereKey($userId)->whereHas('roles', fn ($query) => $query->where('code', 'CLINICAL_SUPERVISOR'))->exists(), 404);
    }
}
