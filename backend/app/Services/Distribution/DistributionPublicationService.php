<?php

namespace App\Services\Distribution;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;
use Exception;

class DistributionPublicationService
{
    public function __construct(
        private DistributionStateValidator $stateValidator,
        private DistributionApprovalService $approvalService
    ) {}

    /**
     * Publishes an approved distribution version transactionally.
     * 
     * @param DistributionVersion $version
     * @param mixed $user
     * @param string $lastUpdatedAt
     * @param bool $force
     * @param string|null $overrideReason
     * @return DistributionVersion
     * @throws ValidationException|Exception
     */
    public function publish(
        DistributionVersion $version,
        $user,
        string $lastUpdatedAt,
        bool $force = false,
        ?string $overrideReason = null
    ): DistributionVersion {
        // Idempotency check: if already published and current, return without error or duplicate audit
        if ($version->status === 'published' && $version->is_current) {
            return $version;
        }

        if (!in_array($version->status, ['suggested', 'manual'])) {
            throw ValidationException::withMessages([
                'version' => ['Only suggested or manual versions can be published.']
            ]);
        }

        if (!Gate::allows('permission', 'distribution.publish')) {
            throw ValidationException::withMessages([
                'authorization' => ['You do not have permission to publish distributions.']
            ]);
        }

        // Concurrency Check (ISO 8601 string or equivalent representation)
        if ($version->updated_at->toIso8601String() !== $lastUpdatedAt && $version->updated_at->toDateTimeString() !== $lastUpdatedAt) {
            throw ValidationException::withMessages([
                'concurrency' => ['The version has been modified by another user. Please reload and try again.']
            ]);
        }

        $result = DB::transaction(function () use ($version, $user, $force, $overrideReason) {
            // Lock all version rows for this rotation to prevent concurrent publication races
            DistributionVersion::where('rotation_id', $version->rotation_id)->lockForUpdate()->get();

            // Re-fetch target version
            $version = DistributionVersion::where('id', $version->id)->firstOrFail();

            // 1. Verify approval validity
            $approvalLog = $this->approvalService->getValidApproval($version);
            if (!$approvalLog) {
                throw ValidationException::withMessages([
                    'approval' => ['This version requires a valid approval before it can be published. Approval may have been revoked due to recent modifications.']
                ]);
            }

            // 2. Load assignments and run final validation
            $assignments = StudentClinicalAssignment::where('distribution_version_id', $version->id)->get()->toArray();
            
            $unassignedIds = $this->approvalService->getUnassignedStudentIds($version, array_column($assignments, 'student_id'));

            if (!empty($unassignedIds)) {
                if (!$force) {
                    throw ValidationException::withMessages([
                        'unassigned' => ['There are unassigned students in this rotation.']
                    ]);
                }
                if (empty($overrideReason)) {
                    throw ValidationException::withMessages([
                        'override_reason' => ['An override reason is required to publish with unassigned students.']
                    ]);
                }
                if (!Gate::allows('permission', 'distribution.override')) {
                    throw ValidationException::withMessages([
                        'authorization' => ['You do not have permission to override unassigned students.']
                    ]);
                }
            }

            // Final state validation to ensure no last-second integrity breaches
            $this->stateValidator->validateState($version, $assignments, $force, $overrideReason);

            // 3. Supersede previous published versions for the rotation
            $previousPublished = DistributionVersion::where('rotation_id', $version->rotation_id)
                ->where('status', 'published')
                ->where('id', '!=', $version->id)
                ->get();

            foreach ($previousPublished as $oldVersion) {
                // Remove current designation while retaining status = published
                if ($oldVersion->is_current) {
                    $oldVersion->update(['is_current' => false]);
                }

                // Log supersession if not already logged
                $alreadySuperseded = AuditLog::where('action', 'version.superseded')
                    ->where('entity_id', $oldVersion->id)
                    ->where('changes->superseded_by', $version->id)
                    ->exists();

                if (!$alreadySuperseded) {
                    AuditLog::create([
                        'user_id' => $user->id,
                        'action' => 'version.superseded',
                        'entity_type' => DistributionVersion::class,
                        'entity_id' => $oldVersion->id,
                        'distribution_version_id' => $oldVersion->id,
                        'changes' => ['superseded_by' => $version->id],
                        'is_override' => false,
                        'override_reason' => null
                    ]);
                }
            }

            // 4. Update target version status and set is_current = true
            $version->update([
                'status' => 'published',
                'is_current' => true,
            ]);

            // 5. Audit
            $publishedAudit = AuditLog::create([
                'user_id' => $user->id,
                'action' => 'version.published',
                'entity_type' => DistributionVersion::class,
                'entity_id' => $version->id,
                'distribution_version_id' => $version->id,
                'changes' => [
                    'approval_id' => $approvalLog->id,
                    'superseded_versions' => $previousPublished->pluck('id')->toArray()
                ],
                'is_override' => $force,
                'override_reason' => $overrideReason
            ]);

            return [
                'version' => $version,
                'approval_id' => $approvalLog->id,
                'superseded_ids' => $previousPublished->pluck('id')->toArray(),
            ];
        });

        $publishedVersion = $result['version'];

        // Dispatch domain event (implements ShouldDispatchAfterCommit)
        \App\Events\DistributionPublishedEvent::dispatch(
            eventId: (string) \Illuminate\Support\Str::uuid(),
            distributionVersionId: $publishedVersion->id,
            rotationId: $publishedVersion->rotation_id,
            publishedByUserId: $user->id,
            supersededVersionIds: $result['superseded_ids'],
            approvalAuditId: $result['approval_id'],
            isOverride: $force,
            overrideReason: $overrideReason,
            timestamp: now()->toIso8601String()
        );

        return $publishedVersion;
    }
}
