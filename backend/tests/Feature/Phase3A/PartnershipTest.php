<?php

namespace Tests\Feature\Phase3A;

use App\Models\Partnership;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PartnershipTest extends TestCase
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

    public function test_can_list_and_create_partnerships()
    {
        $payload = [
            'institution_name' => 'Ministry of Health',
            'purpose' => 'Clinical Training',
            'scope' => 'local',
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/partnerships', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.institution_name', 'Ministry of Health');

        $this->assertDatabaseHas('partnerships', ['institution_name' => 'Ministry of Health']);
    }
}
