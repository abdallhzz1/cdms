<?php

namespace Tests\Feature\Phase3A;

use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TrainingSiteTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class, Phase3PermissionSeeder::class, RolePermissionSeeder::class]);
        
        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($sysAdminRole);
    }

    public function test_can_list_and_create_training_sites()
    {
        $payload = [
            'site_code' => 'H-99',
            'name_ar' => 'مستشفى القدس',
            'site_type' => 'hospital_public',
            'city' => 'القدس',
            'bed_count' => 120,
            'has_university_transport' => true,
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/training-sites', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.site_code', 'H-99');

        $this->assertDatabaseHas('training_sites', ['site_code' => 'H-99', 'bed_count' => 120]);
    }
}
