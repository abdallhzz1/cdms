<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<StudentGroupAssignment> */
class StudentGroupAssignmentFactory extends Factory
{
    protected $model = StudentGroupAssignment::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;
        $code = 'SGA-T' . str_pad(self::$counter, 4, '0', STR_PAD_LEFT);

        return [
            'assignment_code'     => $code,
            'student_id'          => Student::factory(),
            'academic_year_id'    => AcademicYear::factory(),
            'student_group_id'    => StudentGroup::factory(),
            'student_subgroup_id' => null,
            'valid_from'          => null,
            'valid_until'         => null,
            'rotation'            => null,
            'change_reason'       => null,
            'approved_by'         => null,
            'notes'               => null,
            'data_source'         => 'factory',
        ];
    }
}
