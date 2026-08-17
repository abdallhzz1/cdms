<?php

namespace App\Services\Distribution;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * SupervisorReassignmentService — Phase 5C
 *
 * Handles post-publication supervisor reassignment on a published
 * StudentClinicalAssignment. Per the approved business rules:
 *
 * - ONLY supervisor_id may be changed on a published assignment.
 * - The target Person MUST have is_active = true.
 * - A soft warning (non-blocking) is emitted if the assignment
 *   would exceed the supervisor's max_students capacity.
 * - An AuditLog entry with action = 'supervisor.reassigned' is
 *   generated for every successful reassignment.
 * - The assignment MUST belong to the supplied version.
 * - The version MUST have status = 'published' (this service only
 *   applies post-publication; pre-publication edits use
 *   DistributionManualAssignmentService).
 */
class SupervisorReassignmentService
{
    /**
     * Reassign the supervisor of a published clinical assignment.
     *
     * @param  DistributionVersion         $version    Must be published.
     * @param  StudentClinicalAssignment   $assignment Must belong to $version.
     * @param  int|null                    $newSupervisorId  NULL to unassign.
     * @param  mixed                       $user       Authenticated user performing the action.
     * @return StudentClinicalAssignment
     * @throws ValidationException
     */
    public function reassign(
        DistributionVersion $version,
        StudentClinicalAssignment $assignment,
        ?int $newSupervisorId,
        $user
    ): StudentClinicalAssignment {
        // Guard: version must be published
        if ($version->status !== 'published') {
            throw ValidationException::withMessages([
                'version' => ['Post-publication supervisor reassignment requires a published distribution version.'],
            ]);
        }

        // Guard: assignment must belong to the specified version
        if ($assignment->distribution_version_id !== $version->id) {
            throw ValidationException::withMessages([
                'assignment' => ['The assignment does not belong to the specified distribution version.'],
            ]);
        }

        // Validate new supervisor if provided
        $newSupervisor = null;
        $workloadWarning = null;

        if ($newSupervisorId !== null) {
            $newSupervisor = Person::find($newSupervisorId);

            if (!$newSupervisor) {
                throw ValidationException::withMessages([
                    'supervisor_id' => ['The selected supervisor does not exist.'],
                ]);
            }

            if (!$newSupervisor->is_active) {
                throw ValidationException::withMessages([
                    'supervisor_id' => ['The selected supervisor is inactive and cannot be assigned.'],
                ]);
            }

            // Soft workload warning (non-blocking per Phase 5 BRS Section 24)
            if ($newSupervisor->max_students !== null) {
                $currentLoad = StudentClinicalAssignment::whereHas('distributionVersion', function ($q) {
                    $q->where('status', 'published')->where('is_current', true);
                })->where('supervisor_id', $newSupervisorId)->count();

                if ($currentLoad >= $newSupervisor->max_students) {
                    $workloadWarning = "Supervisor {$newSupervisor->full_name_en} has reached their maximum student capacity ({$newSupervisor->max_students}).";
                }
            }
        }

        // Capture warning before the transaction so it survives the fresh() reload
        $capturedWarning = $workloadWarning;

        // Capture old supervisor ID before transaction
        $oldSupervisorId = $assignment->supervisor_id;

        $updated = DB::transaction(function () use ($version, $assignment, $newSupervisorId, $user, $oldSupervisorId) {
            $assignment->supervisor_id = $newSupervisorId;
            $assignment->save();

            // Audit log
            AuditLog::create([
                'user_id'                 => $user->id,
                'action'                  => 'supervisor.reassigned',
                'entity_type'             => StudentClinicalAssignment::class,
                'entity_id'               => $assignment->id,
                'distribution_version_id' => $version->id,
                'student_id'              => $assignment->student_id,
                'changes'                 => [
                    'old_supervisor_id' => $oldSupervisorId,
                    'new_supervisor_id' => $newSupervisorId,
                ],
                'is_override'     => false,
                'override_reason' => null,
            ]);

            return $assignment->fresh(['student', 'rotationBlock', 'trainingSite', 'department', 'supervisor']);
        });

        // Dispatch domain event (implements ShouldDispatchAfterCommit)
        \App\Events\SupervisorReassignedEvent::dispatch(
            eventId: (string) \Illuminate\Support\Str::uuid(),
            assignmentId: $updated->id,
            distributionVersionId: $version->id,
            rotationId: $version->rotation_id,
            studentId: $updated->student_id,
            previousSupervisorId: $oldSupervisorId,
            newSupervisorId: $newSupervisorId,
            performedByUserId: $user->id,
            timestamp: now()->toIso8601String()
        );

        // Re-attach the transient workload warning after fresh() reload
        if ($capturedWarning) {
            $updated->setAttribute('workload_warning', $capturedWarning);
        }

        return $updated;
    }

    /**
     * Retrieve all assignments for a supervisor from the current published
     * distribution(s), with full eager-loaded relationships.
     *
     * @param  Person  $supervisor
     * @return \Illuminate\Database\Eloquent\Collection
     */
    public function getSupervisorAssignments(Person $supervisor): \Illuminate\Database\Eloquent\Collection
    {
        return StudentClinicalAssignment::where('supervisor_id', $supervisor->id)
            ->whereHas('distributionVersion', function ($q) {
                $q->where('status', 'published')->where('is_current', true);
            })
            ->with([
                'student',
                'rotationBlock.rotation.academicYear',
                'trainingSite',
                'department',
                'distributionVersion.rotation',
            ])
            ->orderBy('id', 'asc')
            ->get();
    }
}
