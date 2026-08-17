<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use App\Models\RotationBlock;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Exception;

class DistributionManualAssignmentService
{
    public function __construct(
        private DistributionValidationContextBuilder $contextBuilder,
        private DistributionValidationService $validationService,
        private DistributionStateValidator $stateValidator,
        private DistributionApprovalService $approvalService
    ) {}

    public function createAssignment(
        DistributionVersion $version,
        array $data,
        $user,
        bool $force = false,
        ?string $overrideReason = null
    ): StudentClinicalAssignment {
        $this->ensureEditable($version);

        return DB::transaction(function () use ($version, $data, $user, $force, $overrideReason) {
            // Duplicate check
            $exists = StudentClinicalAssignment::where('distribution_version_id', $version->id)
                ->where('student_id', $data['student_id'])
                ->where('rotation_block_id', $data['rotation_block_id'])
                ->exists();

            if ($exists) {
                throw ValidationException::withMessages([
                    'assignment' => ['This student is already assigned to this block in this version.']
                ]);
            }

            // Derive department from block
            $block = RotationBlock::findOrFail($data['rotation_block_id']);
            $data['department_id'] = $block->department_id;

            // Build DTO for the new assignment
            $newAssignmentDTO = new CandidateAssignmentDTO(
                subgroup_id: $data['student_subgroup_id'] ?? 0, // Using 0 or actual if present
                rotation_block_id: $data['rotation_block_id'],
                site_id: $data['training_site_id'],
                supervisor_id: $data['supervisor_id'] ?? null
            );

            // Fetch all current assignments for the version
            $currentAssignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get()->toArray();

            // Append new assignment to evaluate full state
            $currentAssignments[] = array_merge($data, ['student_id' => $data['student_id'], 'rotation_block_id' => $data['rotation_block_id'], 'training_site_id' => $data['training_site_id']]);

            $this->stateValidator->validateState($version, $currentAssignments, $force, $overrideReason);

            // Create assignment
            $assignmentData = array_merge($data, [
                'distribution_version_id' => $version->id
            ]);
            unset($assignmentData['force'], $assignmentData['override_reason']);
            
            $assignment = StudentClinicalAssignment::create($assignmentData);

            $version->update(['status' => 'manual']);

            $this->audit(
                $user, 'assignment.created', $assignment->id, $version->id, $data['student_id'],
                null, $assignment->toArray(), $force, $overrideReason
            );

            $this->approvalService->invalidateApproval($version, $user);

            return $assignment;
        });
    }

    public function updateAssignment(
        DistributionVersion $version,
        StudentClinicalAssignment $assignment,
        array $data,
        $user,
        bool $force = false,
        ?string $overrideReason = null
    ): StudentClinicalAssignment {
        $this->ensureEditable($version);

        if ($assignment->distribution_version_id !== $version->id) {
            throw new Exception("Assignment does not belong to this version.");
        }

        return DB::transaction(function () use ($version, $assignment, $data, $user, $force, $overrideReason) {
            $oldValues = $assignment->toArray();

            if (isset($data['rotation_block_id'])) {
                $block = RotationBlock::findOrFail($data['rotation_block_id']);
                $data['department_id'] = $block->department_id;
            }

            // Fill but don't save yet
            $updateData = $data;
            unset($updateData['force'], $updateData['override_reason']);
            $assignment->fill($updateData);

            // Duplicate check if block changed
            if ($assignment->isDirty('rotation_block_id')) {
                $exists = StudentClinicalAssignment::where('distribution_version_id', $version->id)
                    ->where('student_id', $assignment->student_id)
                    ->where('rotation_block_id', $assignment->rotation_block_id)
                    ->where('id', '!=', $assignment->id)
                    ->exists();

                if ($exists) {
                    throw ValidationException::withMessages([
                        'assignment' => ['This student is already assigned to this block in this version.']
                    ]);
                }
            }

            // Fetch all current assignments
            $currentAssignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)
                ->where('id', '!=', $assignment->id)
                ->get()->toArray();
                
            $modifiedAssignmentData = array_merge($assignment->toArray(), $updateData);
            $currentAssignments[] = $modifiedAssignmentData;

            $this->stateValidator->validateState($version, $currentAssignments, $force, $overrideReason);

            $assignment->save();
            $version->update(['status' => 'manual']);

            $this->audit(
                $user, 'assignment.updated', $assignment->id, $version->id, $assignment->student_id,
                $oldValues, $assignment->toArray(), $force, $overrideReason
            );

            $this->approvalService->invalidateApproval($version, $user);

            return $assignment;
        });
    }

    public function deleteAssignment(
        DistributionVersion $version,
        StudentClinicalAssignment $assignment,
        $user
    ): void {
        $this->ensureEditable($version);

        if ($assignment->distribution_version_id !== $version->id) {
            throw new Exception("Assignment does not belong to this version.");
        }

        DB::transaction(function () use ($version, $assignment, $user) {
            $oldValues = $assignment->toArray();
            
            $assignment->delete();
            $version->update(['status' => 'manual']);

            $this->audit(
                $user, 'assignment.deleted', $assignment->id, $version->id, $assignment->student_id,
                $oldValues, null, false, null
            );

            $this->approvalService->invalidateApproval($version, $user);
        });
    }

    private function ensureEditable(DistributionVersion $version): void
    {
        if ($version->status === 'published') {
            throw ValidationException::withMessages([
                'version' => ['Cannot modify a published distribution version.']
            ]);
        }
    }



    private function audit(
        $user, string $action, int $entityId, int $versionId, int $studentId, 
        ?array $old, ?array $new, bool $isOverride, ?string $reason
    ): void {
        AuditLog::create([
            'user_id' => $user->id,
            'action' => $action,
            'entity_type' => StudentClinicalAssignment::class,
            'entity_id' => $entityId,
            'distribution_version_id' => $versionId,
            'student_id' => $studentId,
            'changes' => ['old' => $old, 'new' => $new],
            'is_override' => $isOverride,
            'override_reason' => $reason
        ]);
    }
}
