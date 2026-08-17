<?php

namespace Database\Factories;

use App\Models\Department;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Department> */
class DepartmentFactory extends Factory
{
    protected $model = Department::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;
        $code = 'DEP-T' . str_pad(self::$counter, 3, '0', STR_PAD_LEFT);

        return [
            'code'                   => $code,
            'name_ar'                => $this->faker->words(3, true),
            'name_en'                => $this->faker->words(3, true),
            'dept_type'              => $this->faker->randomElement(['primary', 'sub']),
            'serves_academic_levels' => $this->faker->randomElements(['fourth', 'fifth', 'sixth'], 2),
            'is_active'              => true,
            'notes'                  => null,
        ];
    }

    public function primary(): static
    {
        return $this->state(['dept_type' => 'primary']);
    }
}
