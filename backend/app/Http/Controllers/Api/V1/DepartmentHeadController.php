<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepartmentHeadProfile;
use App\Models\Role;
use App\Models\User;
use App\Services\ProfileAuthorizationService;
use App\Services\SecureFileUploadService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class DepartmentHeadController extends Controller
{
    public function __construct(private readonly ProfileAuthorizationService $profileAuthorization) {}

    /**
     * GET /api/v1/dept-heads
     * List all Department Heads with their database profile and KPI calculations.
     */
    public function index(Request $request): JsonResponse
    {
        $headRole = Role::where('code', 'DEPARTMENT_HEAD')->first();

        $query = User::with(['roles', 'person.department', 'departmentHeadProfile.department']);

        if ($headRole) {
            $query->whereHas('roles', function ($q) use ($headRole) {
                $q->where('roles.id', $headRole->id);
            });
        }

        $users = $query->get();

        // Deduplicate by email
        $uniqueUsers = $users->unique(function ($u) {
            return strtolower($u->email);
        })->values();

        $data = $uniqueUsers->map(function ($u) {
            $profile = $u->departmentHeadProfile ?: new DepartmentHeadProfile([
                'user_id' => $u->id,
                'academic_title' => 'أستاذ مشارك — استشاري سريري',
                'specialty' => $u->person && $u->person->department ? 'استشاري ' . $u->person->department->name_ar : 'استشاري سريري',
                'contract_type' => 'عقد دائم — متفرغ',
                'appointment_date' => '2024-09-01',
                'phone' => $u->person ? $u->person->primary_phone : '+970 599 000000',
            ]);

            $deptName = $u->person && $u->person->department 
                ? $u->person->department->name_ar 
                : ($profile->department ? $profile->department->name_ar : 'القسم السريري');

            if (str_starts_with($deptName, 'قسم ')) {
                $deptName = preg_replace('/^قسم\s+/', '', $deptName);
            }

            // Calculate KPI score
            $kpi = $this->calculateKpi($profile);

            return [
                'id' => (string)$u->id,
                'user_id' => $u->id,
                'name' => $u->person ? $u->person->full_name_ar : $u->name,
                'email' => $u->email,
                'title' => $profile->academic_title ?: 'أستاذ مشارك — استشاري سريري',
                'department_name' => $deptName,
                'contract_type' => $profile->contract_type ?: 'عقد دائم — متفرغ',
                'appointment_date' => $profile->appointment_date ?: '2024-09-01',
                'specialty' => $profile->specialty ?: ('استشاري ' . $deptName),
                'phone' => $profile->phone ?: ($u->person ? $u->person->primary_phone : '+970 599 000000'),
                'avatar_url' => $profile->avatar_url ?: $u->avatar_url,
                'cv_summary' => $profile->cv_summary ?: '',
                'publications' => $profile->publications ?: [],
                'conferences' => $profile->conferences ?: [],
                'documents' => $profile->documents ?: [],
                'kpi_weights' => $profile->kpi_weights ?: $this->defaultWeights(),
                'kpi_overrides' => $profile->kpi_overrides ?: [],
                'evaluation' => $profile->evaluation,
                'kpi_score' => $kpi['totalScore'],
                'kpi_rating' => $kpi['rating'],
            ];
        });

        return response()->json([
            'success' => true,
            'data' => $data
        ]);
    }

    /**
     * GET /api/v1/dept-heads/{id}
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeView($request->user(), $userId);

        $u = User::with(['roles', 'person.department', 'departmentHeadProfile.department'])->find($userId);

        if (!$u) {
            return response()->json([
                'success' => false,
                'message' => 'Department head user not found.'
            ], 404);
        }

        $profile = $u->departmentHeadProfile ?: new DepartmentHeadProfile([
            'user_id' => $u->id,
            'academic_title' => 'أستاذ مشارك — استشاري سريري',
            'specialty' => $u->person && $u->person->department ? 'استشاري ' . $u->person->department->name_ar : 'استشاري سريري',
            'contract_type' => 'عقد دائم — متفرغ',
            'appointment_date' => '2024-09-01',
            'phone' => $u->person ? $u->person->primary_phone : '+970 599 000000',
        ]);

        $deptName = $u->person && $u->person->department 
            ? $u->person->department->name_ar 
            : ($profile->department ? $profile->department->name_ar : 'القسم السريري');

        if (str_starts_with($deptName, 'قسم ')) {
            $deptName = preg_replace('/^قسم\s+/', '', $deptName);
        }

        $kpi = $this->calculateKpi($profile);

        return response()->json([
            'success' => true,
            'data' => [
                'id' => (string)$u->id,
                'user_id' => $u->id,
                'name' => $u->person ? $u->person->full_name_ar : $u->name,
                'email' => $u->email,
                'title' => $profile->academic_title ?: 'أستاذ مشارك — استشاري سريري',
                'department_name' => $deptName,
                'contract_type' => $profile->contract_type ?: 'عقد دائم — متفرغ',
                'appointment_date' => $profile->appointment_date ?: '2024-09-01',
                'specialty' => $profile->specialty ?: ('استشاري ' . $deptName),
                'phone' => $profile->phone ?: ($u->person ? $u->person->primary_phone : '+970 599 000000'),
                'avatar_url' => $profile->avatar_url ?: $u->avatar_url,
                'cv_summary' => $profile->cv_summary ?: '',
                'publications' => $profile->publications ?: [],
                'conferences' => $profile->conferences ?: [],
                'documents' => $profile->documents ?: [],
                'kpi_weights' => $profile->kpi_weights ?: $this->defaultWeights(),
                'kpi_overrides' => $profile->kpi_overrides ?: [],
                'evaluation' => $profile->evaluation,
                'kpi_score' => $kpi['totalScore'],
                'kpi_rating' => $kpi['rating'],
                'kpi_breakdown' => $kpi,
            ]
        ]);
    }

    /**
     * PUT /api/v1/dept-heads/{id}
     * Update Department Head Profile (CV, publications, conferences, etc.)
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $payload = $request->all();

        $profile->update([
            'academic_title' => $payload['title'] ?? $payload['academic_title'] ?? $profile->academic_title,
            'specialty' => $payload['specialty'] ?? $profile->specialty,
            'contract_type' => $payload['contract_type'] ?? $profile->contract_type,
            'appointment_date' => $payload['appointment_date'] ?? $profile->appointment_date,
            'phone' => $payload['phone'] ?? $profile->phone,
            'cv_summary' => $payload['cv_summary'] ?? $profile->cv_summary,
            'publications' => isset($payload['publications']) ? $payload['publications'] : $profile->publications,
            'conferences' => isset($payload['conferences']) ? $payload['conferences'] : $profile->conferences,
        ]);

        return $this->show($request, (string)$userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/evaluation
     * Save official Dean / Clinical Director Evaluation
     */
    public function saveEvaluation(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEvaluation($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $eval = $request->input('evaluation', $request->all());

        $profile->update([
            'evaluation' => [
                'evaluator_name' => $eval['evaluator_name'] ?? ($request->user() ? $request->user()->name : 'د. معتز التميمي'),
                'evaluator_role' => $eval['evaluator_role'] ?? 'مدير الدائرة السريرية',
                'leadership_score' => (float)($eval['leadership_score'] ?? 7.5),
                'clinical_score' => (float)($eval['clinical_score'] ?? 7.5),
                'comments' => $eval['comments'] ?? 'تم التقييم والاعتماد الرسمي.',
                'evaluation_date' => $eval['evaluation_date'] ?? now()->format('Y/m/d'),
            ]
        ]);

        return $this->show($request, (string)$userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/weights
     */
    public function saveWeights(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEvaluation($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $weights = $request->input('kpi_weights', $request->all());

        $profile->update([
            'kpi_weights' => $weights
        ]);

        return $this->show($request, (string)$userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/overrides
     */
    public function saveOverrides(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEvaluation($request->user());

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $overrides = $request->input('kpi_overrides', $request->all());

        $profile->update([
            'kpi_overrides' => $overrides
        ]);

        return $this->show($request, (string)$userId);
    }

    /**
     * POST /api/v1/dept-heads/{id}/avatar
     * Upload profile avatar photo directly to server storage.
     */
    public function uploadAvatar(Request $request, string $id, SecureFileUploadService $files): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);

        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $source = $request->file('avatar') ?: $request->input('avatar_base64');
        if (!$source) {
            return response()->json(['success' => false, 'message' => 'No image file provided.'], 400);
        }

        $stored = $files->storeAvatar($source, 'avatars/department-heads/'.$userId);
        $oldPath = $profile->avatar_storage_path;
        $profile->update([
            'avatar_url' => $stored['url'],
            'avatar_storage_path' => $stored['path'],
        ]);
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
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $docName = $request->input('name', 'وثيقة رسمية');
        $docCategory = $request->input('category', 'أخرى');
        $source = $request->file('file') ?: $request->input('file_base64');
        if (!$source) {
            return response()->json([
                'success' => false,
                'message' => 'No file provided for upload.'
            ], 400);
        }

        $stored = $files->storeDocument($source, 'profile-documents/department-heads/'.$userId);
        $docId = 'doc_'.\Illuminate\Support\Str::uuid();

        $newDoc = [
            'id' => $docId,
            'name' => $docName,
            'category' => $docCategory,
            'file_url' => url("/api/v1/dept-heads/{$userId}/documents/{$docId}/download"),
            'storage_path' => $stored['storage_path'],
            'mime_type' => $stored['mime_type'],
            'file_type' => $stored['file_type'],
            'file_size' => round($stored['size_bytes'] / (1024 * 1024), 2) . ' MB',
            'created_at' => date('Y-m-d'),
        ];

        $currentDocs = is_array($profile->documents) ? $profile->documents : [];
        $currentDocs[] = $newDoc;

        $profile->update(['documents' => $currentDocs]);

        return response()->json([
            'success' => true,
            'data' => $newDoc,
            'documents' => $currentDocs,
            'message' => 'Document uploaded and saved successfully.'
        ]);
    }

    /**
     * DELETE /api/v1/dept-heads/{id}/documents/{docId}
     */
    public function deleteDocument(Request $request, string $id, string $docId): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeEdit($request->user(), $userId);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        $currentDocs = is_array($profile->documents) ? $profile->documents : [];
        $deleted = collect($currentDocs)->first(fn ($doc) => (string) ($doc['id'] ?? '') === (string) $docId);
        if (!empty($deleted['storage_path'])) {
            Storage::disk('local')->delete($deleted['storage_path']);
        }

        $filtered = array_values(array_filter($currentDocs, function ($doc) use ($docId) {
            return isset($doc['id']) ? (string)$doc['id'] !== (string)$docId : true;
        }));

        $profile->update(['documents' => $filtered]);

        return response()->json([
            'success' => true,
            'documents' => $filtered,
            'message' => 'Document deleted successfully.'
        ]);
    }

    public function downloadDocument(Request $request, string $id, string $docId)
    {
        $userId = $this->resolveUserId($request, $id);
        $this->profileAuthorization->authorizeView($request->user(), $userId);
        $profile = DepartmentHeadProfile::where('user_id', $userId)->firstOrFail();
        $document = collect($profile->documents ?: [])->first(
            fn ($doc) => (string) ($doc['id'] ?? '') === (string) $docId
        );

        if (!$document || empty($document['storage_path']) || !Storage::disk('local')->exists($document['storage_path'])) {
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

        $wGrades = (float)($w['gradeTimelinessWeight'] ?? 25);
        $wRotations = (float)($w['rotationMgmtWeight'] ?? 25);
        $wResearch = (float)($w['researchWeight'] ?? 20);
        $wConf = (float)($w['confWeight'] ?? 15);
        $wEval = (float)($w['evaluationWeight'] ?? 15);

        $gScore = isset($ov['gradeTimelinessScore']) ? (float)$ov['gradeTimelinessScore'] : $wGrades;
        $rScore = isset($ov['rotationMgmtScore']) ? (float)$ov['rotationMgmtScore'] : round(0.96 * $wRotations, 1);

        $pubCount = is_array($profile->publications) ? count($profile->publications) : 0;
        $resScore = isset($ov['researchScore']) ? (float)$ov['researchScore'] : min($wResearch, $pubCount * 5);

        $confCount = is_array($profile->conferences) ? count($profile->conferences) : 0;
        $cScore = isset($ov['confScore']) ? (float)$ov['confScore'] : min($wConf, $confCount * 5);

        $rawEvalSum = $eval ? ((float)($eval['leadership_score'] ?? 0) + (float)($eval['clinical_score'] ?? 0)) : 15.0;
        $eScore = round(($rawEvalSum / 15.0) * $wEval, 1);

        $totalScore = min(100.0, round($gScore + $rScore + $resScore + $cScore + $eScore, 1));

        $rating = 'مقبول';
        if ($totalScore >= 90) $rating = 'ممتاز';
        else if ($totalScore >= 80) $rating = 'جيد جداً';
        else if ($totalScore >= 70) $rating = 'جيد';

        return [
            'gradeTimelinessScore' => $gScore,
            'rotationMgmtScore' => $rScore,
            'researchScore' => $resScore,
            'confScore' => $cScore,
            'directorDeanEvalScore' => $eScore,
            'totalScore' => $totalScore,
            'rating' => $rating,
            'weights' => $w,
            'overrides' => $ov,
        ];
    }

    private function resolveUserId(Request $request, string $id): int
    {
        if ($id === 'me') {
            return $request->user() ? $request->user()->id : 0;
        }

        $val = (int)$id;
        if ($val > 0) {
            return $val;
        }

        return 0;
    }

}
