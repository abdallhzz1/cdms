<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\Person;
use App\Models\TrainingSite;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Person> */
class PersonFactory extends Factory
{
    protected $model = Person::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;
        $code = 'DR-T' . str_pad(self::$counter, 4, '0', STR_PAD_LEFT);

        return [
            'staff_code'               => $code,
            'full_name_ar'             => 'د. ' . $this->faker->name,
            'full_name_en'             => 'Dr. ' . $this->faker->name,
            'email'                    => $this->faker->unique()->safeEmail,
            'phone'                    => null,
            'department_id'            => null,
            'primary_site_id'          => null,
            'specialty'                => null,
            'academic_degree'          => null,
            'license_number'           => null,
            'contract_type'            => $this->faker->randomElement(['full_time', 'part_time']),
            'contract_start'           => null,
            'contract_end'             => null,
            'teaching_hours_per_week'  => null,
            'available_days'           => null,
            'max_students'             => $this->faker->numberBetween(4, 8),
            'photo_url'                => null,
            'cv_url'                   => null,
            'is_active'                => true,
            'user_id'                  => null,
            'notes'                    => null,
        ];
    }

    public function inDepartment(Department $department): static
    {
        return $this->state(['department_id' => $department->id]);
    }
}
