<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\RotationBlock;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\ValidationException;

class DistributionSubgroupAssignmentService
{
    public function __construct(
        private DistributionValidationContextBuilder $contextBuilder,
        private DistributionValidationService $validationService,
        private DistributionApprovalService $approvalService,
    ) {}

    public function create(
        DistributionVersion $version,
        StudentSubgroup $subgroup,
        array $data,
        $user,
        bool $force = false,
        ?string $overrideReason = null,
    ): array {
        return $this->save($version, $subgroup, $data, $user, false, $force, $overrideReason);
    }

    public function update(
        DistributionVersion $version,
        StudentSubgroup $subgroup,
        array $data,
        $user,
        bool $force = false,
        ?string $overrideReason = null,
    ): array {
        return $this->save($version, $subgroup, $data, $user, true, $force, $overrideReason);
    }

    public function delete(DistributionVersion $version, StudentSubgroup $subgroup, $user): void
    {
        $this->ensureEditable($version);
        $this->ensureEligible($version, $subgroup);

        DB::transaction(function () use ($version, $subgroup, $user) {
            $lockedVersion = DistributionVersion::whereKey($version->id)->lockForUpdate()->firstOrFail();
            $this->ensureEditable($lockedVersion);

            $assignments = StudentClinicalAssignment::query()
                ->where('distribution_version_id', $lockedVersion->id)
                ->where('student_subgroup_id', $subgroup->id)
                ->lockForUpdate()
                ->get();

            if ($assignments->isEmpty()) {
                throw ValidationException::withMessages([
                    'subgroup' => ['This subgroup has no assignment in this version.'],
                ]);
            }

            $old = $this->allocationSnapshot($assignments);
            StudentClinicalAssignment::whereKey($assignments->pluck('id'))->delete();
            $lockedVersion->update(['status' => 'manual']);

            $this->audit($user->id, 'subgroup_assignment.deleted', $lockedVersion->id, $subgroup->id, $old, null);
            $this->approvalService->invalidateApproval($lockedVersion, $user);
        });
    }

    private function save(
        DistributionVersion $version,
        StudentSubgroup $subgroup,
        array $data,
        $user,
        bool $replace,
        bool $force,
        ?string $overrideReason,
    ): array {
        $this->ensureEditable($version);
        $this->ensureEligible($version, $subgroup);

        return DB::transaction(function () use ($version, $subgroup, $data, $user, $replace, $force, $overrideReason) {
            $lockedVersion = DistributionVersion::with('rotation')->whereKey($version->id)->lockForUpdate()->firstOrFail();
            $this->ensureEditable($lockedVersion);
            StudentSubgroup::whereKey($subgroup->id)->lockForUpdate()->firstOrFail();

            $existing = StudentClinicalAssignment::query()
                ->where('distribution_version_id', $lockedVersion->id)
                ->where('student_subgroup_id', $subgroup->id)
                ->lockForUpdate()
                ->get();

            if (!$replace && $existing->isNotEmpty()) {
                throw ValidationException::withMessages([
                    'subgroup' => ['This subgroup is already assigned in this version.'],
                ]);
            }
            if ($replace && $existing->isEmpty()) {
                throw ValidationException::withMessages([
                    'subgroup' => ['This subgroup has no assignment to update in this version.'],
                ]);
            }

            $block = RotationBlock::where('rotation_id', $lockedVersion->rotation_id)
                ->findOrFail($data['rotation_block_id']);

            $memberships = StudentGroupAssignment::query()
                ->where('student_subgroup_id', $subgroup->id)
                ->where('academic_year_id', $lockedVersion->rotation->academic_year_id)
                ->current()
                ->whereHas('student', fn ($query) => $query->where('registration_status', 'active'))
                ->lockForUpdate()
                ->get();

            if ($memberships->isEmpty()) {
                throw ValidationException::withMessages([
                    'subgroup' => ['The subgroup has no currently registered students.'],
                ]);
            }

            $proposed = $this->currentAllocationDtos($lockedVersion, $subgroup->id);
            $proposed[] = new CandidateAssignmentDTO(
                subgroup_id: $subgroup->id,
                rotation_block_id: (int) $data['rotation_block_id'],
                site_id: (int) $data['training_site_id'],
                supervisor_id: isset($data['supervisor_id']) ? (int) $data['supervisor_id'] : null,
            );

            $context = $this->contextBuilder->buildForValidation($lockedVersion->rotation, $proposed);
            $validation = $this->validationService->validate($context, $proposed);
            $this->guardValidation($validation['violations'], $force, $overrideReason);

            $old = $existing->isEmpty() ? null : $this->allocationSnapshot($existing);
            if ($existing->isNotEmpty()) {
                StudentClinicalAssignment::whereKey($existing->pluck('id'))->delete();
            }

            $now = now();
            $rows = $memberships->map(fn (StudentGroupAssignment $membership) => [
                'distribution_version_id' => $lockedVersion->id,
                'student_id' => $membership->student_id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => (int) $data['rotation_block_id'],
                'training_site_id' => (int) $data['training_site_id'],
                'department_id' => $block->department_id,
                'supervisor_id' => $data['supervisor_id'] ?? null,
                'created_at' => $now,
                'updated_at' => $now,
            ])->all();

            StudentClinicalAssignment::insert($rows);
            $lockedVersion->update(['status' => 'manual']);

            $new = [
                'subgroup_id' => $subgroup->id,
                'rotation_block_id' => (int) $data['rotation_block_id'],
                'training_site_id' => (int) $data['training_site_id'],
                'department_id' => $block->department_id,
                'supervisor_id' => $data['supervisor_id'] ?? null,
                'student_count' => count($rows),
            ];

            $this->audit(
                $user->id,
                $replace ? 'subgroup_assignment.updated' : 'subgroup_assignment.created',
                $lockedVersion->id,
                $subgroup->id,
                $old,
                $new,
                $force,
                $overrideReason,
            );
            $this->approvalService->invalidateApproval($lockedVersion, $user);

            return $new;
        });
    }

    /** @return CandidateAssignmentDTO[] */
    private function currentAllocationDtos(DistributionVersion $version, int $excludedSubgroupId): array
    {
        return StudentClinicalAssignment::query()
            ->where('distribution_version_id', $version->id)
            ->where('student_subgroup_id', '!=', $excludedSubgroupId)
            ->whereNotNull('student_subgroup_id')
            ->select(['student_subgroup_id', 'rotation_block_id', 'training_site_id', 'supervisor_id'])
            ->distinct()
            ->get()
            ->map(fn ($row) => new CandidateAssignmentDTO(
                subgroup_id: (int) $row->student_subgroup_id,
                rotation_block_id: (int) $row->rotation_block_id,
                site_id: (int) $row->training_site_id,
                supervisor_id: $row->supervisor_id ? (int) $row->supervisor_id : null,
            ))
            ->all();
    }

    private function ensureEligible(DistributionVersion $version, StudentSubgroup $subgroup): void
    {
        $version->loadMissing('rotation');
        $subgroup->loadMissing('group');

        if (!$subgroup->is_active
            || !$subgroup->group
            || (int) $subgroup->group->academic_year_id !== (int) $version->rotation->academic_year_id
            || $subgroup->group->academic_level !== $version->rotation->academic_level) {
            throw ValidationException::withMessages([
                'subgroup' => ['The subgroup is not eligible for this rotation.'],
            ]);
        }
    }

    private function ensureEditable(DistributionVersion $version): void
    {
        if ($version->status === 'published') {
            throw ValidationException::withMessages([
                'version' => ['Cannot modify a published distribution version.'],
            ]);
        }
    }

    private function guardValidation(array $violations, bool $force, ?string $reason): void
    {
        if (empty($violations)) {
            return;
        }
        if (!$force) {
            throw ValidationException::withMessages(['hard_constraints' => $violations]);
        }
        if (!$reason || !trim($reason)) {
            throw ValidationException::withMessages(['override_reason' => ['An override reason is required.']]);
        }
        if (!Gate::allows('permission', ['distribution.override'])) {
            throw ValidationException::withMessages(['authorization' => ['You do not have permission to override hard constraints.']]);
        }
    }

    private function allocationSnapshot($assignments): array
    {
        $first = $assignments->first();

        return [
            'subgroup_id' => $first->student_subgroup_id,
            'rotation_block_id' => $first->rotation_block_id,
            'training_site_id' => $first->training_site_id,
            'department_id' => $first->department_id,
            'supervisor_id' => $first->supervisor_id,
            'student_count' => $assignments->count(),
        ];
    }

    private function audit(
        int $userId,
        string $action,
        int $versionId,
        int $subgroupId,
        ?array $old,
        ?array $new,
        bool $isOverride = false,
        ?string $overrideReason = null,
    ): void {
        AuditLog::create([
            'user_id' => $userId,
            'action' => $action,
            'entity_type' => StudentSubgroup::class,
            'entity_id' => $subgroupId,
            'distribution_version_id' => $versionId,
            'student_id' => null,
            'changes' => ['old' => $old, 'new' => $new],
            'is_override' => $isOverride,
            'override_reason' => $overrideReason,
        ]);
    }
}
