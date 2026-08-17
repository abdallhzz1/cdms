<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\Rotation;
use Illuminate\Database\Eloquent\Factories\Factory;

class RotationBlockFactory extends Factory
{
    public function definition(): array
    {
        return [
            'rotation_id' => Rotation::factory(),
            'block_code' => 'B' . $this->faker->unique()->numberBetween(100, 999),
            'from_week' => 1,
            'to_week' => 4,
            'department_id' => Department::factory(),
        ];
    }
}
