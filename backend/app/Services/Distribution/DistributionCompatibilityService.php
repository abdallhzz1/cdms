<?php

namespace App\Services\Distribution;

use App\DTOs\CandidateAssignmentDTO;
use App\Models\Person;

class DistributionCompatibilityService
{
    /**
     * @param CandidateAssignmentDTO[] $assignments
     */
    public function validate(DistributionValidationContext $context, array $assignments): array
    {
        $violations = [];
        $workSchedules = app(\App\Services\SupervisorWorkScheduleService::class);
        $supervisors = Person::query()->with(['trainingSites:id', 'availabilities'])
            ->whereIn('id', collect($assignments)->pluck('supervisor_id')->filter()->unique())
            ->get()->keyBy('id');

        foreach ($assignments as $assignment) {
            // Rule: RotationBlock must belong to the Rotation
            if (!$context->blocks->has($assignment->rotation_block_id)) {
                $violations[] = [
                    'code' => 'INVALID_BLOCK',
                    'message' => "Block {$assignment->rotation_block_id} does not belong to the specified rotation.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }

            // Legacy rotations use explicit capacity rules. Course-linked weekly
            // schedules derive the site from the selected doctor's hospital.
            if (!$context->rotation->course_id && !$context->capacityRules->has($assignment->site_id)) {
                $violations[] = [
                    'code' => 'INVALID_SITE',
                    'message' => "Site {$assignment->site_id} is not configured for this rotation.",
                    'subgroup_id' => $assignment->subgroup_id,
                ];
            }

            // Use the same workplace links as the row picker, including dated
            // work schedules imported before the site pivot was synchronized.
            if ($assignment->supervisor_id) {
                $supervisor = $supervisors->get($assignment->supervisor_id);
                $isSupervisorAtSite = $supervisor && $workSchedules->isLinkedToSite($supervisor, (int) $assignment->site_id);

                if (!$isSupervisorAtSite) {
                    $violations[] = [
                        'code' => 'INVALID_SUPERVISOR',
                        'message' => $supervisor
                            ? "المشرف {$supervisor->full_name_ar} غير مرتبط بالمستشفى المحدد. حدّث أماكن وأيام عمله أولاً."
                            : 'المشرف المحدد غير موجود أو غير فعال.',
                        'subgroup_id' => $assignment->subgroup_id,
                    ];
                }
            }
        }

        return $violations;
    }
}
