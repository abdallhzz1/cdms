<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use Illuminate\Database\Eloquent\Factories\Factory;

class RotationFactory extends Factory
{
    public function definition(): array
    {
        return [
            'academic_year_id' => AcademicYear::factory(),
            'code' => 'R' . $this->faker->unique()->numberBetween(100, 999),
            'name' => $this->faker->word . ' Rotation',
            'academic_level' => $this->faker->randomElement(['fourth', 'fifth', 'sixth']),
            'duration_weeks' => $this->faker->numberBetween(4, 12),
            'start_date' => $this->faker->date(),
            'end_date' => $this->faker->date(),
            'status' => 'draft',
        ];
    }
}
