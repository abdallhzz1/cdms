<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use App\Models\StudentGroup;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<StudentGroup> */
class StudentGroupFactory extends Factory
{
    protected $model = StudentGroup::class;

    public function definition(): array
    {
        return [
            'academic_year_id'     => AcademicYear::factory(),
            'academic_level'       => $this->faker->randomElement(['fourth', 'fifth', 'sixth']),
            'name'                 => $this->faker->randomElement(['A', 'B', 'C', 'G', 'N', 'Q', 'R', 'S']),
            'distribution_manager' => null,
            'approved_at'          => null,
            'notes'                => null,
        ];
    }
}
