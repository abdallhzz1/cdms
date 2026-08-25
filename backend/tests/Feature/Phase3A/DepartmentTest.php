<?php

namespace Tests\Feature\Phase3A;

use App\Models\Department;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentTest extends TestCase
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

    public function test_can_list_departments()
    {
        $baseline = Department::count();
        Department::factory()->count(5)->create();

        $response = $this->actingAs($this->admin)->getJson('/api/v1/departments');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonCount($baseline + 5, 'data');
    }

    public function test_can_create_department()
    {
        $payload = [
            'code' => 'DEP-TEST',
            'name_ar' => 'قسم تجريبي',
            'name_en' => 'Test Dept',
            'dept_type' => 'primary',
            'serves_academic_levels' => ['fourth', 'sixth'],
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/departments', $payload);

        $response->assertStatus(201)->assertJsonPath('data.code', 'DEP-TEST');
        $this->assertDatabaseHas('departments', ['code' => 'DEP-TEST']);
    }

    public function test_cannot_create_with_invalid_levels()
    {
        $payload = [
            'code' => 'DEP-FAIL',
            'name_ar' => 'Fail',
            'name_en' => 'Fail',
            'dept_type' => 'primary',
            'serves_academic_levels' => ['invalid_level'],
        ];

        $response = $this->actingAs($this->admin)->postJson('/api/v1/departments', $payload);

        $response->assertStatus(422);
    }
}
