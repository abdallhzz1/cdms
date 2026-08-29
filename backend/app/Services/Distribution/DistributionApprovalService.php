<?php

namespace App\Services\Distribution;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class DistributionApprovalService
{
    public function __construct(
        private DistributionStateValidator $stateValidator
    ) {}

    /**
     * Approves a distribution version.
     * 
     * @param DistributionVersion $version
     * @param mixed $user
     * @param bool $force
     * @param string|null $overrideReason
     * @return AuditLog
     * @throws ValidationException
     */
    public function approve(
        DistributionVersion $version,
        $user,
        bool $force = false,
        ?string $overrideReason = null
    ): AuditLog {
        if (!in_array($version->status, ['suggested', 'manual'])) {
            throw ValidationException::withMessages([
                'version' => [__('distribution.approval.invalid_status')]
            ]);
        }

        if (!Gate::allows('permission', ['distribution.approve'])) {
            throw ValidationException::withMessages([
                'authorization' => [__('distribution.approval.forbidden')]
            ]);
        }

        return DB::transaction(function () use ($user, $version, $force, $overrideReason) {
            $version = DistributionVersion::whereKey($version->id)->lockForUpdate()->firstOrFail();
            if (!in_array($version->status, ['suggested', 'manual'], true)) {
                throw ValidationException::withMessages([
                    'version' => [__('distribution.approval.invalid_status')],
                ]);
            }

            $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)
                ->lockForUpdate()
                ->get()
                ->toArray();
            $unassignedIds = $this->getUnassignedStudentIds($version, array_column($assignments, 'student_id'));

            if (!empty($unassignedIds)) {
                if (!$force) {
                    throw ValidationException::withMessages([
                        'unassigned' => [__('distribution.approval.unassigned')],
                    ]);
                }
                if (empty($overrideReason)) {
                    throw ValidationException::withMessages([
                        'override_reason' => [__('distribution.approval.override_reason_required')],
                    ]);
                }
                if (!Gate::allows('permission', ['distribution.override'])) {
                    throw ValidationException::withMessages([
                        'authorization' => [__('distribution.approval.override_forbidden')],
                    ]);
                }
            }

            $this->stateValidator->validateState($version, $assignments, $force, $overrideReason);
            $fingerprint = $this->generateFingerprint($assignments);

            return AuditLog::create([
                'user_id' => $user->id,
                'action' => 'version.approved',
                'entity_type' => DistributionVersion::class,
                'entity_id' => $version->id,
                'distribution_version_id' => $version->id,
                'changes' => ['fingerprint' => $fingerprint],
                'is_override' => $force,
                'override_reason' => $overrideReason
            ]);
        });
    }

    /**
     * Invalidates any existing approval for the version.
     * 
     * @param DistributionVersion $version
     * @param mixed $user
     * @return void
     */
    public function invalidateApproval(DistributionVersion $version, $user): void
    {
        // Check if there is a valid approval active
        $latestApproval = AuditLog::where('action', 'version.approved')
            ->where('distribution_version_id', $version->id)
            ->latest('id')
            ->first();

        if ($latestApproval) {
            $latestRevocation = AuditLog::where('action', 'version.approval_revoked')
                ->where('distribution_version_id', $version->id)
                ->where('id', '>', $latestApproval->id)
                ->exists();

            if (!$latestRevocation) {
                AuditLog::create([
                    'user_id' => $user->id,
                    'action' => 'version.approval_revoked',
                    'entity_type' => DistributionVersion::class,
                    'entity_id' => $version->id,
                    'distribution_version_id' => $version->id,
                    'changes' => null,
                    'is_override' => false,
                    'override_reason' => null
                ]);

                // Dispatch domain event (implements ShouldDispatchAfterCommit)
                \App\Events\ApprovalRevokedEvent::dispatch(
                    eventId: (string) \Illuminate\Support\Str::uuid(),
                    distributionVersionId: $version->id,
                    rotationId: $version->rotation_id,
                    revokedByUserId: $user->id,
                    reason: 'Approval invalidated due to manual modification',
                    timestamp: now()->toIso8601String()
                );
            }
        }
    }

    /**
     * Retrieves a valid approval audit log if one exists and the fingerprint matches.
     * 
     * @param DistributionVersion $version
     * @return AuditLog|null
     */
    public function getValidApproval(DistributionVersion $version): ?AuditLog
    {
        $latestApproval = AuditLog::where('action', 'version.approved')
            ->where('distribution_version_id', $version->id)
            ->latest('id')
            ->first();

        if (!$latestApproval) {
            return null;
        }

        $latestRevocation = AuditLog::where('action', 'version.approval_revoked')
            ->where('distribution_version_id', $version->id)
            ->where('id', '>', $latestApproval->id)
            ->exists();

        if ($latestRevocation) {
            return null;
        }

        $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get()->toArray();
        $currentFingerprint = $this->generateFingerprint($assignments);

        $approvedFingerprint = $latestApproval->changes['fingerprint'] ?? null;

        if ($currentFingerprint !== $approvedFingerprint) {
            return null;
        }

        return $latestApproval;
    }

    /**
     * Return a UI-safe approval state so users know whether approval is
     * missing or was invalidated by a later schedule change.
     *
     * @return array{status:string, approved_at:?string, approved_by:?int}
     */
    public function getApprovalState(DistributionVersion $version): array
    {
        $validApproval = $this->getValidApproval($version);
        if ($validApproval) {
            return [
                'status' => 'approved',
                'approved_at' => $validApproval->created_at?->toIso8601String(),
                'approved_by' => $validApproval->user_id,
            ];
        }

        $latestApproval = AuditLog::where('action', 'version.approved')
            ->where('distribution_version_id', $version->id)
            ->latest('id')
            ->first();

        return [
            'status' => $latestApproval ? 'revoked' : 'required',
            'approved_at' => null,
            'approved_by' => null,
        ];
    }

    /**
     * Generates a deterministic SHA256 fingerprint for a given set of assignments.
     * 
     * @param array $assignments
     * @return string
     */
    public function generateFingerprint(array $assignments): string
    {
        // A student can appear in several weekly blocks. Sorting only by
        // student_id leaves equal items in database-dependent order and can
        // produce a different fingerprint during publication on MySQL.
        usort($assignments, fn (array $a, array $b) => [
            (int) ($a['student_id'] ?? 0),
            (int) ($a['student_subgroup_id'] ?? 0),
            (int) ($a['rotation_block_id'] ?? 0),
            (int) ($a['training_site_id'] ?? 0),
            (int) ($a['department_id'] ?? 0),
            (int) ($a['supervisor_id'] ?? 0),
        ] <=> [
            (int) ($b['student_id'] ?? 0),
            (int) ($b['student_subgroup_id'] ?? 0),
            (int) ($b['rotation_block_id'] ?? 0),
            (int) ($b['training_site_id'] ?? 0),
            (int) ($b['department_id'] ?? 0),
            (int) ($b['supervisor_id'] ?? 0),
        ]);

        $str = '';
        foreach ($assignments as $a) {
            $str .= $a['student_id'] . '|' . 
                    ($a['student_subgroup_id'] ?? '') . '|' . 
                    $a['rotation_block_id'] . '|' . 
                    $a['training_site_id'] . '|' . 
                    ($a['department_id'] ?? '') . '|' . 
                    ($a['supervisor_id'] ?? '') . ';;';
        }

        return hash('sha256', $str);
    }

    /**
     * Gets IDs of students who belong to the rotation's academic year but have no assignment.
     */
    public function getUnassignedStudentIds(DistributionVersion $version, array $assignedStudentIds): array
    {
        $rotation = $version->rotation;
        
        $eligibleStudents = \App\Models\Student::whereHas('groupAssignments', function ($q) use ($rotation) {
            $q->where('academic_year_id', $rotation->academic_year_id)
              ->current()
              ->whereHas('subgroup.group', fn ($group) => $group->where('academic_level', $rotation->academic_level));
        })
        ->where('registration_status', 'active')
        ->pluck('id')
        ->toArray();

        return array_diff($eligibleStudents, $assignedStudentIds);
    }
}
