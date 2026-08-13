<?php

namespace Database\Factories;

use App\Models\Role;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Role>
 */
class RoleFactory extends Factory
{
    protected $model = Role::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $code = 'TEST_ROLE_'.fake()->unique()->numberBetween(1000, 999999);

        return [
            'code' => $code,
            'name_key' => 'roles.'.strtolower($code).'.name',
            'description_key' => 'roles.'.strtolower($code).'.description',
        ];
    }
}
