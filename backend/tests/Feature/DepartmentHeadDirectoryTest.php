<?php

namespace Tests\Feature;

use App\Models\ClinicalSupervisorProfile;
use App\Models\Department;
use App\Models\DepartmentHeadAssignment;
use App\Models\DepartmentHeadProfile;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentHeadDirectoryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);

        $role = Role::create([
            'code' => 'HEAD_DIRECTORY_TEST',
            'name_key' => 'test',
            'name_ar' => 'اختبار',
            'name_en' => 'Test',
        ]);
        $permissionIds = Permission::whereIn('code', ['people.view', 'users.manage'])->pluck('id');
        $role->permissions()->sync($permissionIds->mapWithKeys(
            fn (int $id) => [$id => ['scope_type' => 'global']]
        )->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($role);
    }

    public function test_directory_only_lists_current_assignments_and_does_not_invent_kpi_data(): void
    {
        $department = Department::factory()->create(['name_ar' => 'قسم الباطني']);
        $currentUser = User::factory()->create(['is_active' => true]);
        $currentPerson = Person::factory()->create([
            'user_id' => $currentUser->id,
            'department_id' => $department->id,
            'phone' => '0599000000',
        ]);
        DepartmentHeadAssignment::create([
            'person_id' => $currentPerson->id,
            'department_id' => $department->id,
            'role_type' => 'head',
            'is_current' => true,
        ]);

        $formerUser = User::factory()->create(['is_active' => true]);
        $formerPerson = Person::factory()->create(['user_id' => $formerUser->id]);
        DepartmentHeadAssignment::create([
            'person_id' => $formerPerson->id,
            'department_id' => $department->id,
            'role_type' => 'head',
            'is_current' => false,
            'ended_at' => now()->subDay(),
        ]);

        $this->actingAs($this->admin)->getJson('/api/v1/dept-heads')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.user_id', $currentUser->id)
            ->assertJsonPath('data.0.department_name', 'الباطني')
            ->assertJsonPath('data.0.phone', '0599000000')
            ->assertJsonPath('data.0.kpi_score', null)
            ->assertJsonPath('data.0.kpi_complete', false);
    }

    public function test_replacing_a_head_ends_the_old_assignment_and_moves_the_scoped_role(): void
    {
        $department = Department::factory()->create();
        $headRole = Role::where('code', 'DEPARTMENT_HEAD')->firstOrFail();
        $oldUser = User::factory()->create();
        $oldPerson = Person::factory()->create(['user_id' => $oldUser->id]);
        $newUser = User::factory()->create();
        $newPerson = Person::factory()->create(['user_id' => $newUser->id]);

        $oldUser->roles()->attach($headRole, ['scope_type' => 'department', 'scope_id' => $department->id]);
        DepartmentHeadAssignment::create([
            'person_id' => $oldPerson->id,
            'department_id' => $department->id,
            'role_type' => 'head',
            'is_current' => true,
        ]);

        $this->actingAs($this->admin)
            ->postJson("/api/v1/departments-manage/{$department->id}/assign-leaders", [
                'head_person_id' => $newPerson->id,
            ])->assertOk();

        $this->assertDatabaseHas('department_head_assignments', [
            'person_id' => $oldPerson->id,
            'is_current' => false,
        ]);
        $this->assertDatabaseHas('department_head_assignments', [
            'person_id' => $newPerson->id,
            'department_id' => $department->id,
            'is_current' => true,
        ]);
        $this->assertDatabaseMissing('user_roles', ['user_id' => $oldUser->id, 'role_id' => $headRole->id]);
        $this->assertDatabaseHas('user_roles', [
            'user_id' => $newUser->id,
            'role_id' => $headRole->id,
            'scope_type' => 'department',
            'scope_id' => $department->id,
        ]);
    }

    public function test_department_head_and_clinical_supervisor_profiles_are_independent(): void
    {
        $user = User::factory()->create();
        DepartmentHeadProfile::create(['user_id' => $user->id, 'academic_title' => 'رئيس قسم']);
        ClinicalSupervisorProfile::create(['user_id' => $user->id, 'academic_title' => 'مشرف سريري']);

        $this->assertSame('رئيس قسم', $user->fresh()->departmentHeadProfile->academic_title);
        $this->assertSame('مشرف سريري', $user->fresh()->clinicalSupervisorProfile->academic_title);
    }
}
