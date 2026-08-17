<?php

namespace Database\Factories;

use App\Models\Partnership;
use Illuminate\Database\Eloquent\Factories\Factory;

/** @extends Factory<Partnership> */
class PartnershipFactory extends Factory
{
    protected $model = Partnership::class;

    public function definition(): array
    {
        return [
            'institution_name' => $this->faker->company . ' University',
            'purpose'          => $this->faker->sentence,
            'scope'            => $this->faker->randomElement(['local', 'international']),
            'start_date'       => $this->faker->date(),
            'end_date'         => null,
            'is_active'        => true,
            'notes'            => null,
            'data_source'      => 'factory',
        ];
    }
}
