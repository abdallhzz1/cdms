<?php

namespace App\Services;

use App\Models\StudentClinicalAssignment;
use Illuminate\Support\Collection;

/** Groups consecutive one-week distribution blocks into a single training period. */
class ClinicalAssessmentPeriods
{
    public function groups(Collection $assignments, bool $respectStaff = true): Collection
    {
        return $assignments->filter(fn (StudentClinicalAssignment $item) => $item->rotationBlock)
            ->groupBy(function (StudentClinicalAssignment $item) use ($respectStaff) {
                $parts = [$item->distribution_version_id, $item->rotationBlock->rotation_id, $item->student_subgroup_id];
                if ($respectStaff) {
                    array_push($parts, $item->supervisor_id, $item->training_site_id, $item->student?->batch_year);
                }
                return implode(':', $parts);
            })->flatMap(function (Collection $scope) {
                $blocks = $scope->groupBy('rotation_block_id')->sortBy(fn (Collection $items) => (int) $items->first()->rotationBlock->from_week);
                $periods = collect();
                foreach ($blocks as $blockId => $items) {
                    $block = $items->first()->rotationBlock;
                    $week = (int) $block->from_week;
                    $last = $periods->last();
                    $singleWeek = $week > 0 && $week === (int) $block->to_week;
                    if ($last && $singleWeek && $last['single_week'] && $week <= $last['end_week'] + 1) {
                        $last['assignments'] = $last['assignments']->concat($items);
                        $last['block_ids']->push((int) $blockId);
                        $last['end_week'] = max($last['end_week'], $week);
                        $periods->put($periods->count() - 1, $last);
                    } else {
                        $periods->push([
                            'assignments' => $items->values(),
                            'block_ids' => collect([(int) $blockId]),
                            'primary_block_id' => (int) $blockId,
                            'start_week' => $week,
                            'end_week' => (int) $block->to_week,
                            'single_week' => $singleWeek,
                        ]);
                    }
                }
                return $periods;
            })->values();
    }
}
