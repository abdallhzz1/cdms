<?php

namespace App\Services\Distribution;

use App\Models\DistributionVersion;
use Illuminate\Validation\ValidationException;

class DistributionVersionComparisonService
{
    /**
     * Compares two distribution versions of the same rotation.
     * 
     * @param DistributionVersion $baseVersion
     * @param DistributionVersion $compareVersion
     * @return array
     * @throws ValidationException
     */
    public function compare(DistributionVersion $baseVersion, DistributionVersion $compareVersion): array
    {
        if ($baseVersion->rotation_id !== $compareVersion->rotation_id) {
            throw ValidationException::withMessages([
                'version' => ['Cannot compare distribution versions from different rotations.']
            ]);
        }

        // Fetch assignments for both versions
        $baseAssignments = $baseVersion->assignments()->get()->keyBy('student_id');
        $compareAssignments = $compareVersion->assignments()->get()->keyBy('student_id');

        $baseStudentIds = $baseAssignments->keys()->toArray();
        $compareStudentIds = $compareAssignments->keys()->toArray();

        $allStudentIds = array_unique(array_merge($baseStudentIds, $compareStudentIds));

        $added = [];
        $removed = [];
        $movedBlock = [];
        $movedSite = [];
        $supervisorChanged = [];
        $newlyUnassigned = [];
        $newlyAssigned = [];

        foreach ($allStudentIds as $studentId) {
            $base = $baseAssignments->get($studentId);
            $compare = $compareAssignments->get($studentId);

            if (!$base && $compare) {
                $added[] = $studentId;
                $newlyAssigned[] = $studentId;
                continue;
            }

            if ($base && !$compare) {
                $removed[] = $studentId;
                $newlyUnassigned[] = $studentId;
                continue;
            }

            // Both have assignments
            if ($base->rotation_block_id !== $compare->rotation_block_id) {
                $movedBlock[] = [
                    'student_id' => $studentId,
                    'from' => $base->rotation_block_id,
                    'to' => $compare->rotation_block_id
                ];
            }

            if ($base->training_site_id !== $compare->training_site_id) {
                $movedSite[] = [
                    'student_id' => $studentId,
                    'from' => $base->training_site_id,
                    'to' => $compare->training_site_id
                ];
            }

            if ($base->supervisor_id !== $compare->supervisor_id) {
                $supervisorChanged[] = [
                    'student_id' => $studentId,
                    'from' => $base->supervisor_id,
                    'to' => $compare->supervisor_id
                ];
            }
        }

        return [
            'version_base' => $baseVersion->id,
            'version_compare' => $compareVersion->id,
            'summary' => [
                'added' => count($added),
                'removed' => count($removed),
                'moved_block' => count($movedBlock),
                'moved_site' => count($movedSite),
                'supervisor_changed' => count($supervisorChanged),
                'newly_unassigned' => count($newlyUnassigned),
                'newly_assigned' => count($newlyAssigned)
            ],
            'changes' => [
                'added_students' => $added,
                'removed_students' => $removed,
                'moved_block' => $movedBlock,
                'moved_site' => $movedSite,
                'supervisor_changed' => $supervisorChanged,
                'newly_unassigned' => $newlyUnassigned,
                'newly_assigned' => $newlyAssigned
            ]
        ];
    }
}
