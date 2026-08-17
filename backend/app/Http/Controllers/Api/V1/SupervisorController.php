<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use App\Services\Distribution\SupervisorReassignmentService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * SupervisorController — Phase 5C
 *
 * Exposes two groups of endpoints:
 *
 * 1. POST-PUBLICATION SUPERVISOR MANAGEMENT
 *    PUT /api/v1/operational/assignments/{assignment}/supervisor
 *      - Requires permission:distribution.update
 *      - ONLY modifies supervisor_id on a published assignment.
 *
 * 2. SUPERVISOR PORTAL VIEW
 *    GET /api/v1/operational/my-supervisor-assignments
 *      - Resolves authenticated User -> Person -> supervisor assignments
 *        in the current published distribution.
 *      - Requires permission:distribution.view
 */
class SupervisorController extends Controller
{
    public function __construct(
        private SupervisorReassignmentService $reassignmentService
    ) {}

    /**
     * PUT /api/v1/operational/assignments/{assignment}/supervisor
     *
     * Post-publication supervisor reassignment.
     * Only supervisor_id may be modified on a published assignment.
     */
    public function reassign(Request $request, StudentClinicalAssignment $assignment): JsonResponse
    {
        $validated = $request->validate([
            'supervisor_id' => ['nullable', 'integer'],
        ]);

        // Resolve the version for this published assignment
        $version = $assignment->distributionVersion;

        if (!$version) {
            return response()->json([
                'success' => false,
                'message' => 'Distribution version not found for this assignment.',
                'errors'  => ['assignment' => ['Assignment does not belong to any distribution version.']],
            ], 404);
        }

        try {
            $updated = $this->reassignmentService->reassign(
                $version,
                $assignment,
                $validated['supervisor_id'] ?? null,
                $request->user()
            );
        } catch (ValidationException $e) {
            return response()->json([
                'success' => false,
                'message' => 'Supervisor reassignment failed.',
                'errors'  => $e->errors(),
            ], 422);
        }

        $response = [
            'success' => true,
            'message' => 'Supervisor reassigned successfully.',
            'data'    => $updated,
        ];

        // Surface soft workload warning if present
        $warning = $updated->getAttribute('workload_warning');
        if ($warning) {
            $response['warning'] = $warning;
        }

        return response()->json($response);
    }

    /**
     * GET /api/v1/operational/my-supervisor-assignments
     *
     * Returns the authenticated user's supervisor portal view —
     * all assignments from the current published distribution where
     * the user is the assigned supervisor.
     *
     * Resolves: User -> Person (via people.user_id) -> assigned assignments.
     */
    public function myAssignments(Request $request): JsonResponse
    {
        $user = $request->user();

        // Resolve Person record for the authenticated user
        $person = Person::where('user_id', $user->id)->where('is_active', true)->first();

        if (!$person) {
            return response()->json([
                'success' => true,
                'message' => 'No supervisor profile found for this user.',
                'data'    => [],
                'meta'    => [
                    'person_id'    => null,
                    'total'        => 0,
                    'is_supervisor' => false,
                ],
            ]);
        }

        $assignments = $this->reassignmentService->getSupervisorAssignments($person);

        return response()->json([
            'success' => true,
            'message' => 'Supervisor clinical assignments retrieved successfully.',
            'data'    => $assignments,
            'meta'    => [
                'person_id'    => $person->id,
                'full_name_ar' => $person->full_name_ar,
                'full_name_en' => $person->full_name_en,
                'total'        => $assignments->count(),
                'is_supervisor' => true,
            ],
        ]);
    }

    /**
     * GET /api/v1/operational/supervisors/{person}/assignments
     *
     * Administrative view — view any supervisor's current assignments.
     * Requires permission:distribution.view (broader admin permission).
     */
    public function supervisorAssignments(Person $person): JsonResponse
    {
        $assignments = $this->reassignmentService->getSupervisorAssignments($person);

        return response()->json([
            'success' => true,
            'message' => 'Supervisor assignments retrieved successfully.',
            'data'    => $assignments,
            'meta'    => [
                'person_id'    => $person->id,
                'full_name_ar' => $person->full_name_ar,
                'full_name_en' => $person->full_name_en,
                'total'        => $assignments->count(),
                'is_active'    => $person->is_active,
            ],
        ]);
    }
}
