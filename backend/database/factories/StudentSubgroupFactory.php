<?php

namespace Database\Factories;

use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<StudentSubgroup> */
class StudentSubgroupFactory extends Factory
{
    protected $model = StudentSubgroup::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;

        return [
            'student_group_id' => StudentGroup::factory(),
            'name'             => 'SG' . self::$counter,
            'min_size'         => 5,
            'max_size'         => 6,
            'is_active'        => true,
        ];
    }
}
