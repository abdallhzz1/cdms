<?php

namespace Tests\Unit;

use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Services\ClinicalAssessmentPeriods;
use PHPUnit\Framework\TestCase;

class ClinicalAssessmentPeriodsTest extends TestCase
{
    public function test_consecutive_weekly_blocks_form_one_period_but_explicit_and_disjoint_blocks_remain_separate(): void
    {
        $make = function (int $id, int $week, int $endWeek, int $subgroup = 7): StudentClinicalAssignment {
            $block = new RotationBlock([
                'id' => $id, 'rotation_id' => 4, 'from_week' => $week, 'to_week' => $endWeek,
            ]);
            $block->id = $id;
            $assignment = new StudentClinicalAssignment([
                'id' => $id, 'distribution_version_id' => 2, 'rotation_block_id' => $id,
                'student_subgroup_id' => $subgroup, 'supervisor_id' => 9, 'training_site_id' => 3,
            ]);
            $assignment->id = $id;
            $assignment->setRelation('rotationBlock', $block);
            $assignment->setRelation('student', new Student(['batch_year' => 2022]));
            return $assignment;
        };

        $periods = (new ClinicalAssessmentPeriods)->groups(collect([
            $make(11, 1, 1), $make(12, 2, 2), $make(13, 3, 3),
            $make(14, 5, 5), $make(15, 6, 7), $make(16, 8, 8), $make(17, 4, 4, 8),
        ]));

        $this->assertSame([[11, 12, 13], [14], [15], [16], [17]],
            $periods->map(fn (array $period) => $period['block_ids']->all())->all());
    }
}
