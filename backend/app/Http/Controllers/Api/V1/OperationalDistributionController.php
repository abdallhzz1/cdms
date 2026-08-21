<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\ClinicalDistributionPayload;
use App\Models\Role;
use App\Models\User;
use App\Services\Distribution\CurrentDistributionResolver;
use App\Services\Distribution\DistributionApprovalService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

class OperationalDistributionController extends Controller
{
    public function __construct(
        private CurrentDistributionResolver $currentResolver,
        private DistributionApprovalService $approvalService,
        private \App\Services\Distribution\ClinicalScheduleQueryService $scheduleQueryService
    ) {}

    /**
     * GET /api/v1/operational/clinical-schedule
     * Master administrative schedule endpoint for current published distribution assignments.
     */
    public function administrativeSchedule(Request $request): JsonResponse
    {
        $paginator = $this->scheduleQueryService->getAdministrativeSchedule($request);

        return response()->json([
            'success' => true,
            'message' => 'Administrative clinical schedule retrieved successfully.',
            'data' => $paginator
        ]);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution
     */
    public function currentDistribution(Rotation $rotation): JsonResponse
    {
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $currentVersion->load(['rotation.academicYear', 'rotation.blocks']);

        return response()->json([
            'success' => true,
            'message' => 'Current published distribution retrieved successfully.',
            'data' => $currentVersion
        ]);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution/summary
     */
    public function currentDistributionSummary(Rotation $rotation): JsonResponse
    {
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $assignments = StudentClinicalAssignment::where('distribution_version_id', $currentVersion->id)->get();
        $assignedStudentIds = $assignments->pluck('student_id')->unique()->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($currentVersion, $assignedStudentIds);

        $summary = [
            'current_version_id' => $currentVersion->id,
            'rotation_id' => $rotation->id,
            'status' => $currentVersion->status,
            'is_current' => $currentVersion->is_current,
            'published_at' => $currentVersion->updated_at->toIso8601String(),
            'total_active_students' => count($assignedStudentIds) + count($unassignedIds),
            'assigned_students' => count($assignedStudentIds),
            'unassigned_students' => count($unassignedIds),
            'total_assignments' => $assignments->count(),
            'training_sites_used' => $assignments->pluck('training_site_id')->unique()->count(),
            'rotation_blocks_used' => $assignments->pluck('rotation_block_id')->unique()->count(),
            'supervisors_assigned' => $assignments->pluck('supervisor_id')->filter()->unique()->count(),
        ];

        return response()->json([
            'success' => true,
            'message' => 'Current published distribution summary retrieved successfully.',
            'data' => $summary
        ]);
    }

    /**
     * GET /api/v1/students/{student}/current-clinical-schedule
     */
    public function studentSchedule(Student $student): JsonResponse
    {
        $assignments = StudentClinicalAssignment::where('student_id', $student->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'rotationBlock',
                'trainingSite',
                'department',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Student current clinical schedule retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/supervisors/{person}/current-clinical-schedule
     */
    public function supervisorSchedule(Person $person): JsonResponse
    {
        $assignments = StudentClinicalAssignment::where('supervisor_id', $person->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'trainingSite',
                'department',
                'distributionVersion.rotation.academicYear'
            ])
            ->get();

        return response()->json([
            'success' => true,
            'message' => 'Supervisor current clinical schedule retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/departments/{department}/current-distribution
     */
    public function departmentDistribution(Department $department, Request $request): JsonResponse
    {
        $assignments = StudentClinicalAssignment::where('department_id', $department->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'trainingSite',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->orderBy('id', 'asc')
            ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Department current distribution retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/training-sites/{trainingSite}/current-distribution
     */
    public function trainingSiteDistribution(TrainingSite $trainingSite, Request $request): JsonResponse
    {
        $assignments = StudentClinicalAssignment::where('training_site_id', $trainingSite->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock',
                'department',
                'supervisor',
                'distributionVersion.rotation.academicYear'
            ])
            ->orderBy('id', 'asc')
            ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Training site current distribution retrieved successfully.',
            'data' => $assignments
        ]);
    }

    /**
     * GET /api/v1/rotations/{rotation}/current-distribution/unassigned
     */
    public function unassignedStudents(Rotation $rotation, Request $request): JsonResponse
    {
        $currentVersion = $this->currentResolver->resolveForRotation($rotation->id);

        if (!$currentVersion) {
            return response()->json([
                'success' => false,
                'message' => 'No current published distribution version exists for this rotation.',
                'data' => null,
                'errors' => ['version' => ['No current published distribution found.']]
            ], 404);
        }

        $assignedStudentIds = StudentClinicalAssignment::where('distribution_version_id', $currentVersion->id)
            ->pluck('student_id')
            ->unique()
            ->toArray();

        $unassignedIds = $this->approvalService->getUnassignedStudentIds($currentVersion, $assignedStudentIds);

        $students = Student::with(['groupAssignments' => function ($q) use ($rotation) {
            $q->where('academic_year_id', $rotation->academic_year_id)
              ->with('subgroup.group');
        }])
        ->whereIn('id', $unassignedIds)
        ->where('registration_status', 'active')
        ->orderBy('id', 'asc')
        ->paginate($request->input('per_page', 15));

        return response()->json([
            'success' => true,
            'message' => 'Current distribution unassigned students retrieved successfully.',
            'data' => $students
        ]);
    }

    /**
     * GET /api/v1/operational/distribution-payload/{key?}
     */
    public function getDistributionPayload(Request $request, ?string $key = null): JsonResponse
    {
        $targetKey = $key ?: $request->query('key');
        $payloadRecord = ClinicalDistributionPayload::where('key', $targetKey)->first();

        return response()->json([
            'success' => true,
            'data' => $payloadRecord ? $payloadRecord->payload : null,
        ]);
    }

    /**
     * POST /api/v1/operational/distribution-payload
     */
    public function saveDistributionPayload(Request $request): JsonResponse
    {
        $request->validate([
            'key' => 'required|string',
            'payload' => 'present',
        ]);

        $key = $request->input('key');
        $payload = $request->input('payload');

        $record = ClinicalDistributionPayload::updateOrCreate(
            ['key' => $key],
            ['payload' => $payload]
        );

        // If key is cdms_hospital_doctors, auto sync doctors to training_sites, people, and users tables!
        if ($key === 'cdms_hospital_doctors' && is_array($payload)) {
            $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->first();

            foreach ($payload as $hospGroup) {
                $siteNameAr = $hospGroup['name'] ?? $hospGroup['name_ar'] ?? 'مستشفى التدريب';
                $siteNameEn = $hospGroup['name_en'] ?? 'Training Site';

                try {
                    TrainingSite::firstOrCreate(
                        ['name_ar' => $siteNameAr],
                        [
                            'site_code' => 'SITE_' . rand(1000, 9999),
                            'name_en' => $siteNameEn,
                            'site_type' => 'hospital_public',
                            'city' => 'الخليل',
                            'agreement_status' => 'active',
                            'is_active' => true,
                        ]
                    );
                } catch (\Throwable $e) {
                    \Illuminate\Support\Facades\Log::error('TrainingSite creation error: ' . $e->getMessage());
                }

                if (isset($hospGroup['doctors']) && is_array($hospGroup['doctors'])) {
                    foreach ($hospGroup['doctors'] as $docData) {
                        $docNameAr = $docData['name'] ?? $docData['doctorName'] ?? $docData['name_ar'] ?? null;
                        if (!$docNameAr) continue;

                        $docNameEn = $docData['name_en'] ?? $docData['doctorName_en'] ?? $docNameAr;

                        $email = $docData['email'] ?? null;
                        if (!$email) {
                            $clean = preg_replace('/[^\w]/', '', strtolower($docNameEn));
                            $email = ($clean ?: 'doc' . rand(100, 999)) . '@hebron.edu';
                        }

                        $person = Person::firstOrCreate(
                            ['full_name_ar' => $docNameAr],
                            [
                                'full_name_en' => $docNameEn,
                                'email' => $email,
                                'person_type' => 'staff',
                                'primary_phone' => '0590000000',
                            ]
                        );

                        $user = User::where('email', $email)->orWhere('name', $docNameAr)->first();
                        if (!$user) {
                            $user = User::create([
                                'name' => $docNameAr,
                                'email' => $email,
                                'password' => Hash::make($docData['password'] ?? 'password123'),
                                'person_id' => $person->id,
                                'is_active' => true,
                            ]);
                        } else {
                            $user->update([
                                'person_id' => $person->id,
                                'is_active' => true,
                            ]);
                        }

                        if ($supervisorRole && !$user->roles->contains($supervisorRole->id)) {
                            $user->roles()->syncWithoutDetaching([$supervisorRole->id]);
                        }
                    }
                }
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'Distribution payload saved and synced to MySQL database successfully.',
            'data' => $record,
        ]);
    }
}
