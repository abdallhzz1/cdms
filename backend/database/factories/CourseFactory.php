<?php

namespace Database\Factories;

use App\Models\Course;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Course> */
class CourseFactory extends Factory
{
    protected $model = Course::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;

        return [
            'code' => 'COURSE-T'.str_pad((string) self::$counter, 4, '0', STR_PAD_LEFT),
            'name_ar' => 'مساق سريري '.self::$counter,
            'name_en' => 'Clinical Course '.self::$counter,
            'credit_hours' => 4,
            'academic_level' => $this->faker->randomElement(['fourth', 'fifth', 'sixth']),
            'semester' => $this->faker->randomElement([1, 2]),
            'is_active' => true,
            'description' => null,
        ];
    }
}
