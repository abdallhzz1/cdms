<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DepartmentHeadProfile;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ClinicalSupervisorController
 *
 * Manages clinical supervisor profiles by filtering users with
 * CLINICAL_SUPERVISOR role and reusing the department_head_profiles table.
 */
class ClinicalSupervisorController extends Controller
{
    /**
     * GET /api/v1/clinical-supervisors
     * List all Clinical Supervisors with their database profile and KPI calculations.
     */
    public function index(Request $request): JsonResponse
    {
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->first();

        $query = User::with(['roles', 'person.department', 'departmentHeadProfile']);

        if ($supervisorRole) {
            $query->whereHas('roles', function ($q) use ($supervisorRole) {
                $q->where('roles.id', $supervisorRole->id);
            });
        }

        $users = $query->where('is_active', true)->get();

        // Deduplicate by email
        $uniqueUsers = $users->unique(function ($u) {
            return strtolower($u->email);
        })->values();

        $data = $uniqueUsers->map(function ($u) {
            $profile = $u->departmentHeadProfile ?: DepartmentHeadProfile::firstOrCreate(
                ['user_id' => $u->id],
                [
                    'academic_title'   => '???? ?????',
                    'specialty'        => $u->person && $u->person->department ? '??????? ' . $u->person->department->name_ar : '???? ?????',
                    'contract_type'    => '??? ?????',
                    'appointment_date' => '2024-09-01',
                    'phone'            => $u->person ? $u->person->primary_phone : null,
                ]
            );

            $deptName = $this->resolveDeptName($u, $profile);
            $kpi      = $this->calculateKpi($profile);

            return [
                'id'               => (string) $u->id,
                'user_id'          => $u->id,
                'name'             => $u->person ? $u->person->full_name_ar : $u->name,
                'name_en'          => $u->person ? $u->person->full_name_en : $u->name,
                'email'            => $u->email,
                'title'            => $profile->academic_title ?: '???? ?????',
                'department_name'  => $deptName,
                'contract_type'    => $profile->contract_type ?: '??? ?????',
                'appointment_date' => $profile->appointment_date ?: '2024-09-01',
                'specialty'        => $profile->specialty ?: ('???? ' . $deptName),
                'phone'            => $profile->phone ?: ($u->person ? $u->person->primary_phone : null),
                'avatar_url'       => $profile->avatar_url ?: $u->avatar_url,
                'cv_summary'       => $profile->cv_summary ?: '',
                'publications'     => $profile->publications ?: [],
                'conferences'      => $profile->conferences ?: [],
                'documents'        => $profile->documents ?: [],
                'kpi_weights'      => $profile->kpi_weights ?: $this->defaultWeights(),
                'kpi_overrides'    => $profile->kpi_overrides ?: [],
                'evaluation'       => $profile->evaluation,
                'kpi_score'        => $kpi['totalScore'],
                'kpi_rating'       => $kpi['rating'],
            ];
        });

        return response()->json([
            'success' => true,
            'data'    => $data,
        ]);
    }

    /**
     * GET /api/v1/clinical-supervisors/{id}
     */
    public function show(Request $request, string $id): JsonResponse
    {
        $userId = $this->resolveUserId($request, $id);

        $u = User::with(['roles', 'person.department', 'departmentHeadProfile'])->find($userId);

        if (!$u) {
            return response()->json([
                'success' => false,
                'message' => 'Clinical supervisor user not found.',
            ], 404);
        }

        $profile = DepartmentHeadProfile::firstOrCreate(
            ['user_id' => $u->id],
            [
                'academic_title'   => '???? ?????',
                'specialty'        => $u->person && $u->person->department ? '??????? ' . $u->person->department->name_ar : '???? ?????',
                'contract_type'    => '??? ?????',
                'appointment_date' => '2024-09-01',
                'phone'            => $u->person ? $u->person->primary_phone : null,
            ]
        );

        $deptName = $this->resolveDeptName($u, $profile);
        $kpi      = $this->calculateKpi($profile);

        return response()->json([
            'success' => true,
            'data'    => [
                'id'               => (string) $u->id,
                'user_id'          => $u->id,
                'name'             => $u->person ? $u->person->full_name_ar : $u->name,
                'name_en'          => $u->person ? $u->person->full_name_en : $u->name,
                'email'            => $u->email,
                'title'            => $profile->academic_title ?: '???? ?????',
                'department_name'  => $deptName,
                'contract_type'    => $profile->contract_type ?: '??? ?????',
                'appointment_date' => $profile->appointment_date ?: '2024-09-01',
                'specialty'        => $profile->specialty ?: ('???? ' . $deptName),
                'phone'            => $profile->phone ?: ($u->person ? $u->person->primary_phone : null),
                'avatar_url'       => $profile->avatar_url ?: $u->avatar_url,
                'cv_summary'       => $profile->cv_summary ?: '',
                'publications'     => $profile->publications ?: [],
                'conferences'      => $profile->conferences ?: [],
                'documents'        => $profile->documents ?: [],
                'kpi_weights'      => $profile->kpi_weights ?: $this->defaultWeights(),
                'kpi_overrides'    => $profile->kpi_overrides ?: [],
                'evaluation'       => $profile->evaluation,
                'kpi_score'        => $kpi['totalScore'],
                'kpi_rating'       => $kpi['rating'],
                'kpi_breakdown'    => $kpi,
            ],
        ]);
    }

    /**
     * PUT /api/v1/clinical-supervisors/{id}
     */
    public function update(Request $request, string $id): JsonResponse
    {
        $userId  = $this->resolveUserId($request, $id);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);
        $payload = $request->all();

        $profile->update([
            'academic_title'   => $payload['title'] ?? $payload['academic_title'] ?? $profile->academic_title,
            'specialty'        => $payload['specialty'] ?? $profile->specialty,
            'contract_type'    => $payload['contract_type'] ?? $profile->contract_type,
            'appointment_date' => $payload['appointment_date'] ?? $profile->appointment_date,
            'phone'            => $payload['phone'] ?? $profile->phone,
            'avatar_url'       => $payload['avatar_url'] ?? $profile->avatar_url,
            'cv_summary'       => $payload['cv_summary'] ?? $profile->cv_summary,
            'publications'     => isset($payload['publications']) ? $payload['publications'] : $profile->publications,
            'conferences'      => isset($payload['conferences']) ? $payload['conferences'] : $profile->conferences,
            'documents'        => isset($payload['documents']) ? $payload['documents'] : $profile->documents,
        ]);

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/clinical-supervisors/{id}/evaluation
     */
    public function saveEvaluation(Request $request, string $id): JsonResponse
    {
        $userId  = $this->resolveUserId($request, $id);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);
        $eval    = $request->input('evaluation', $request->all());

        $profile->update([
            'evaluation' => [
                'evaluator_name'   => $eval['evaluator_name'] ?? ($request->user() ? $request->user()->name : '?????? ???????'),
                'evaluator_role'   => $eval['evaluator_role'] ?? '???? ??????? ????????',
                'leadership_score' => (float) ($eval['leadership_score'] ?? 7.5),
                'clinical_score'   => (float) ($eval['clinical_score'] ?? 7.5),
                'comments'         => $eval['comments'] ?? '?? ??????? ????????? ??????.',
                'evaluation_date'  => $eval['evaluation_date'] ?? now()->format('Y/m/d'),
            ],
        ]);

        return $this->show($request, (string) $userId);
    }

    /**
     * POST /api/v1/clinical-supervisors/{id}/avatar
     */
    public function uploadAvatar(Request $request, string $id): JsonResponse
    {
        $userId  = $this->resolveUserId($request, $id);
        $profile = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);

        if ($request->hasFile('avatar')) {
            $file      = $request->file('avatar');
            $filename  = 'supervisor_avatar_' . $userId . '_' . time() . '.' . $file->getClientOriginalExtension();
            $path      = $file->storeAs('avatars/supervisors', $filename, 'public');
            $avatarUrl = asset('storage/' . $path);
            $profile->update(['avatar_url' => $avatarUrl]);

            return response()->json(['success' => true, 'avatar_url' => $avatarUrl, 'message' => 'Avatar uploaded successfully.']);
        }

        if ($request->has('avatar_base64')) {
            $avatarUrl = $request->input('avatar_base64');
            $profile->update(['avatar_url' => $avatarUrl]);
            return response()->json(['success' => true, 'avatar_url' => $avatarUrl, 'message' => 'Avatar updated successfully.']);
        }

        return response()->json(['success' => false, 'message' => 'No image file provided.'], 400);
    }

    /**
     * POST /api/v1/clinical-supervisors/{id}/documents
     */
    public function uploadDocument(Request $request, string $id): JsonResponse
    {
        $userId      = $this->resolveUserId($request, $id);
        $profile     = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);
        $docName     = $request->input('name', '????? ?????');
        $docCategory = $request->input('category', '????');
        $fileUrl     = null;
        $fileType    = 'pdf';
        $fileSize    = '1 MB';

        if ($request->hasFile('file')) {
            $file     = $request->file('file');
            $ext      = strtolower($file->getClientOriginalExtension() ?: 'pdf');
            $filename = 'sup_doc_' . $userId . '_' . time() . '_' . rand(100, 999) . '.' . $ext;
            $path     = $file->storeAs('supervisor_documents', $filename, 'public');
            $fileUrl  = asset('storage/' . $path);
            $fileType = $ext;
            $fileSize = round($file->getSize() / (1024 * 1024), 2) . ' MB';
        } elseif ($request->has('file_base64')) {
            $fileUrl  = $request->input('file_base64');
            $fileType = $request->input('file_type', 'pdf');
            $fileSize = $request->input('file_size', '1 MB');
        }

        if (!$fileUrl) {
            return response()->json(['success' => false, 'message' => 'No file provided.'], 400);
        }

        $newDoc = [
            'id'         => 'doc_' . time() . '_' . rand(10, 99),
            'name'       => $docName,
            'category'   => $docCategory,
            'file_url'   => $fileUrl,
            'file_type'  => $fileType,
            'file_size'  => $fileSize,
            'created_at' => date('Y-m-d'),
        ];

        $currentDocs   = is_array($profile->documents) ? $profile->documents : [];
        $currentDocs[] = $newDoc;
        $profile->update(['documents' => $currentDocs]);

        return response()->json(['success' => true, 'data' => $newDoc, 'documents' => $currentDocs, 'message' => 'Document saved successfully.']);
    }

    /**
     * DELETE /api/v1/clinical-supervisors/{id}/documents/{docId}
     */
    public function deleteDocument(Request $request, string $id, string $docId): JsonResponse
    {
        $userId      = $this->resolveUserId($request, $id);
        $profile     = DepartmentHeadProfile::firstOrCreate(['user_id' => $userId]);
        $currentDocs = is_array($profile->documents) ? $profile->documents : [];

        $filtered = array_values(array_filter($currentDocs, fn($doc) =>
            isset($doc['id']) ? (string) $doc['id'] !== (string) $docId : true
        ));

        $profile->update(['documents' => $filtered]);

        return response()->json(['success' => true, 'documents' => $filtered, 'message' => 'Document deleted successfully.']);
    }

    // --- Private Helpers -----------------------------------------------------

    private function resolveDeptName(User $u, DepartmentHeadProfile $profile): string
    {
        $deptName = $u->person && $u->person->department
            ? $u->person->department->name_ar
            : ($profile->department ? $profile->department->name_ar : '????? ???????');

        if (str_starts_with($deptName, '??? ')) {
            $deptName = preg_replace('/^???\s+/', '', $deptName);
        }

        return $deptName;
    }

    private function defaultWeights(): array
    {
        return [
            'sessionAttendanceWeight' => 30,
            'researchWeight'          => 20,
            'confWeight'              => 15,
            'evaluationWeight'        => 20,
            'studentFeedbackWeight'   => 15,
        ];
    }

    private function calculateKpi(DepartmentHeadProfile $profile): array
    {
        $w    = $profile->kpi_weights ?: $this->defaultWeights();
        $ov   = $profile->kpi_overrides ?: [];
        $eval = $profile->evaluation;

        $wSession  = (float) ($w['sessionAttendanceWeight'] ?? 30);
        $wResearch = (float) ($w['researchWeight'] ?? 20);
        $wConf     = (float) ($w['confWeight'] ?? 15);
        $wEval     = (float) ($w['evaluationWeight'] ?? 20);
        $wFeedback = (float) ($w['studentFeedbackWeight'] ?? 15);

        $sessionScore = isset($ov['sessionAttendanceScore'])
            ? (float) $ov['sessionAttendanceScore']
            : round(0.9 * $wSession, 1);

        $pubCount = is_array($profile->publications) ? count($profile->publications) : 0;
        $resScore = isset($ov['researchScore'])
            ? (float) $ov['researchScore']
            : min($wResearch, $pubCount * 5);

        $confCount = is_array($profile->conferences) ? count($profile->conferences) : 0;
        $cScore    = isset($ov['confScore'])
            ? (float) $ov['confScore']
            : min($wConf, $confCount * 5);

        $rawEvalSum = $eval
            ? ((float) ($eval['leadership_score'] ?? 0) + (float) ($eval['clinical_score'] ?? 0))
            : 15.0;
        $eScore = round(($rawEvalSum / 15.0) * $wEval, 1);

        $feedbackScore = isset($ov['studentFeedbackScore'])
            ? (float) $ov['studentFeedbackScore']
            : round(0.85 * $wFeedback, 1);

        $totalScore = min(100.0, round($sessionScore + $resScore + $cScore + $eScore + $feedbackScore, 1));

        $rating = '?????';
        if ($totalScore >= 90)      $rating = '?????';
        elseif ($totalScore >= 80)  $rating = '??? ????';
        elseif ($totalScore >= 70)  $rating = '???';

        return [
            'sessionAttendanceScore' => $sessionScore,
            'researchScore'          => $resScore,
            'confScore'              => $cScore,
            'directorEvalScore'      => $eScore,
            'studentFeedbackScore'   => $feedbackScore,
            'totalScore'             => $totalScore,
            'rating'                 => $rating,
            'weights'                => $w,
            'overrides'              => $ov,
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
}
