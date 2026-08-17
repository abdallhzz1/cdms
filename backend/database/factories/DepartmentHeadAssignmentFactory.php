<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\DepartmentHeadAssignment;
use App\Models\Person;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<DepartmentHeadAssignment> */
class DepartmentHeadAssignmentFactory extends Factory
{
    protected $model = DepartmentHeadAssignment::class;

    public function definition(): array
    {
        return [
            'person_id'     => Person::factory(),
            'department_id' => Department::factory(),
            'role_type'     => $this->faker->randomElement(['head', 'rta']),
            'started_at'    => $this->faker->date(),
            'ended_at'      => null,
            'is_current'    => true,
            'notes'         => null,
        ];
    }
}
