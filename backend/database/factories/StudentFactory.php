<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use App\Models\Person;
use App\Models\Student;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Student> */
class StudentFactory extends Factory
{
    protected $model = Student::class;

    private static int $counter = 10000;

    public function definition(): array
    {
        self::$counter++;
        $num = (string) self::$counter;

        return [
            'university_number'       => $num,
            'full_name_ar'            => $this->faker->name,
            'full_name_en'            => $this->faker->name,
            'national_id'             => null,
            'gender'                  => $this->faker->randomElement(['male', 'female']),
            'date_of_birth'           => null,
            'city'                    => null,
            'phone'                   => null,
            'guardian_phone'          => null,
            'university_email'        => $num . '@students.hebron.edu',
            'photo_url'               => null,
            'batch_year'              => null,
            'academic_level'          => $this->faker->randomElement(['fourth', 'fifth', 'sixth']),
            'academic_year_id'        => null,
            'study_plan_code'         => null,
            'registration_status'     => 'active',
            'academic_registration_status' => 'registered',
            'gpa'                     => null,
            'credit_hours_passed'     => null,
            'warning_count'           => 0,
            'last_warning_date'       => null,
            'academic_advisor_id'     => null,
            'clinical_fees_status'    => 'unknown',
            'has_amboss_subscription' => false,
            'notes'                   => null,
            'data_source'             => 'factory',
        ];
    }

    public function active(): static
    {
        return $this->state(['registration_status' => 'active']);
    }

    public function atRisk(): static
    {
        return $this->state(['warning_count' => $this->faker->numberBetween(1, 3)]);
    }

    public function forLevel(string $level): static
    {
        return $this->state(['academic_level' => $level]);
    }
}
