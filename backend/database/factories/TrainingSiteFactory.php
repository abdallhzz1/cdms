<?php

namespace Database\Factories;

use App\Models\Department;
use App\Models\TrainingSite;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<TrainingSite> */
class TrainingSiteFactory extends Factory
{
    protected $model = TrainingSite::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;
        $code = 'H-T' . str_pad(self::$counter, 2, '0', STR_PAD_LEFT);

        return [
            'site_code'                   => $code,
            'name_ar'                     => 'مستشفى ' . $this->faker->city,
            'name_en'                     => $this->faker->city . ' Hospital',
            'site_type'                   => $this->faker->randomElement(['hospital_public', 'hospital_private', 'medical_center']),
            'city'                        => $this->faker->city,
            'address'                     => null,
            'latitude'                    => null,
            'longitude'                   => null,
            'distance_km'                 => $this->faker->randomFloat(1, 1, 50),
            'coordinator_name'            => null,
            'coordinator_phone'           => null,
            'coordinator_email'           => null,
            'agreement_status'            => null,
            'agreement_start'             => null,
            'agreement_end'               => null,
            'has_university_transport'    => false,
            'department_id'               => null,
            'bed_count'                   => null,
            'max_students_per_period'     => null,
            'max_students_per_doctor'     => null,
            'training_days'               => null,
            'accepts_night_shifts'        => false,
            'female_student_restrictions' => null,
            'is_active'                   => true,
            'notes'                       => null,
        ];
    }
}
