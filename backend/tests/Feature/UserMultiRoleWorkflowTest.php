<?php

namespace Tests\Feature;

use App\Models\ClinicalSupervisorProfile;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UserMultiRoleWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
        $manager = Role::create(['code' => 'TEST_USER_MANAGER', 'name_key' => 'test.manager']);
        $manager->permissions()->attach(Permission::where('code', 'users.manage')->firstOrFail(), ['scope_type' => 'global']);
        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($manager);
    }

    public function test_department_head_can_also_be_assigned_clinical_supervisor_role(): void
    {
        $department = Department::factory()->create();

        $response = $this->actingAs($this->admin)->postJson('/api/v1/users', [
            'name' => 'Dr Multi Role',
            'email' => 'multi.role@hebron.edu',
            'password' => 'Strong!Password123',
            'roles' => ['DEPARTMENT_HEAD', 'CLINICAL_SUPERVISOR'],
            'department_id' => $department->id,
            'is_active' => true,
        ])->assertOk();

        $user = User::where('email', 'multi.role@hebron.edu')->firstOrFail();
        $this->assertEqualsCanonicalizing(['DEPARTMENT_HEAD', 'CLINICAL_SUPERVISOR'], $user->roles()->pluck('code')->all());
        $this->assertDatabaseHas('user_roles', [
            'user_id' => $user->id,
            'role_id' => Role::where('code', 'DEPARTMENT_HEAD')->value('id'),
            'scope_type' => 'department',
            'scope_id' => $department->id,
        ]);
        $this->assertDatabaseHas('user_roles', [
            'user_id' => $user->id,
            'role_id' => Role::where('code', 'CLINICAL_SUPERVISOR')->value('id'),
            'scope_type' => 'global',
            'scope_id' => null,
        ]);
        $this->assertTrue(Person::where('user_id', $user->id)->exists());
        $this->assertTrue(ClinicalSupervisorProfile::where('user_id', $user->id)->exists());
        $response->assertJsonCount(2, 'data.roles');
    }

    public function test_scoped_role_requires_department_and_at_least_one_role(): void
    {
        $base = [
            'name' => 'Invalid Role User',
            'email' => 'invalid.role@hebron.edu',
            'password' => 'Strong!Password123',
            'is_active' => true,
        ];

        $this->actingAs($this->admin)->postJson('/api/v1/users', $base + ['roles' => ['DEPARTMENT_HEAD']])
            ->assertUnprocessable()->assertJsonValidationErrors('department_id');

        $this->actingAs($this->admin)->postJson('/api/v1/users', $base + ['roles' => []])
            ->assertUnprocessable()->assertJsonValidationErrors('roles');
    }
}
