<?php

namespace Tests\Feature\Phase3A;

use App\Models\AcademicYear;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AcademicYearTest extends TestCase
{
    use RefreshDatabase;

    protected User $admin;
    protected User $student; // User without academic_years permissions

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->seed([
            RoleSeeder::class,
            PermissionSeeder::class,
            Phase3PermissionSeeder::class,
            RolePermissionSeeder::class,
        ]);

        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($sysAdminRole);

        $this->student = User::factory()->create();
        // student gets no roles
    }

    public function test_can_list_academic_years()
    {
        $baseline = AcademicYear::count();
        AcademicYear::factory()->count(3)->create();

        $response = $this->actingAs($this->admin)
            ->getJson('/api/v1/academic-years');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonCount($baseline + 3, 'data');
    }

    public function test_can_create_academic_year()
    {
        $payload = [
            'code' => '2027/2028',
            'start_date' => '2027-09-01',
            'end_date' => '2028-08-31',
            'status' => 'planned',
            'is_current' => false,
        ];

        $response = $this->actingAs($this->admin)
            ->postJson('/api/v1/academic-years', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.code', '2027/2028');

        $this->assertDatabaseHas('academic_years', ['code' => '2027/2028']);
    }

    public function test_setting_new_current_year_unsets_previous()
    {
        $old = AcademicYear::factory()->create(['is_current' => true, 'code' => '2025/2026']);
        
        $payload = [
            'code' => '2036/2037',
            'start_date' => '2026-09-01',
            'end_date' => '2027-08-31',
            'status' => 'active',
            'is_current' => true, // making this the new current
        ];

        $response = $this->actingAs($this->admin)
            ->postJson('/api/v1/academic-years', $payload);

        $response->assertStatus(201);
        $this->assertDatabaseHas('academic_years', ['code' => '2036/2037', 'is_current' => 1]);
        $this->assertDatabaseHas('academic_years', ['code' => '2025/2026', 'is_current' => 0]);
    }

    public function test_unauthorized_user_cannot_manage()
    {
        $payload = [
            'code' => '2027/2028',
            'start_date' => '2027-09-01',
            'end_date' => '2028-08-31',
            'status' => 'planned',
        ];

        $this->actingAs($this->student)
            ->postJson('/api/v1/academic-years', $payload)
            ->assertStatus(403);
    }
}
