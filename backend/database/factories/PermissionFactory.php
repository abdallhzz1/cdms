<?php

namespace Database\Factories;

use App\Models\Permission;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<Permission>
 */
class PermissionFactory extends Factory
{
    protected $model = Permission::class;

    /**
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        $code = 'test_module.action_'.fake()->unique()->numberBetween(1000, 999999);

        return [
            'code' => $code,
            'module' => 'TestModule',
            'action' => 'ACTION',
            'description_key' => 'permissions.'.str_replace('.', '_', $code).'.description',
        ];
    }
}
