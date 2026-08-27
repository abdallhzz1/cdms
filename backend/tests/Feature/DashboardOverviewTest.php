<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DashboardOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
    }

    public function test_dashboard_requires_authentication(): void
    {
        $this->getJson('/api/v1/dashboard/overview')->assertUnauthorized();
    }

    public function test_rta_dashboard_is_limited_to_the_assigned_cohort(): void
    {
        $role = Role::where('code', 'RTA')->firstOrFail();
        foreach (Permission::whereIn('code', ['students.view', 'attendance.view'])->get() as $permission) {
            $role->permissions()->syncWithoutDetaching([
                $permission->id => ['scope_type' => 'global'],
            ]);
        }

        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($role, ['scope_type' => 'global']);

        Student::factory()->create([
            'academic_level' => 'fourth',
            'registration_status' => 'active',
            'academic_registration_status' => 'registered',
        ]);
        Student::factory()->create([
            'academic_level' => 'fifth',
            'registration_status' => 'active',
            'academic_registration_status' => 'registered',
        ]);

        $response = $this->actingAs($rta)->getJson('/api/v1/dashboard/overview')
            ->assertOk()
            ->assertJsonPath('data.profile.focus', 'cohort')
            ->assertJsonPath('data.profile.assigned_levels.0', 'fourth')
            ->assertJsonPath('data.profile.scope_student_count', 1);

        $studentsMetric = collect($response->json('data.metrics'))->firstWhere('key', 'students_total');
        $studentsChart = collect($response->json('data.charts'))->firstWhere('key', 'students_by_level');

        $this->assertSame(1, $studentsMetric['value']);
        $this->assertSame([1, 0, 0], collect($studentsChart['items'])->pluck('value')->all());
    }

    public function test_system_administrator_receives_system_health_content(): void
    {
        $admin = User::factory()->create(['is_active' => true]);
        $admin->roles()->attach(Role::where('code', 'SYS_ADMIN')->firstOrFail(), ['scope_type' => 'global']);

        $response = $this->actingAs($admin)->getJson('/api/v1/dashboard/overview')
            ->assertOk()
            ->assertJsonPath('data.profile.focus', 'system');

        $metricKeys = collect($response->json('data.metrics'))->pluck('key');
        $chartKeys = collect($response->json('data.charts'))->pluck('key');

        $this->assertTrue($metricKeys->contains('system_users'));
        $this->assertTrue($metricKeys->contains('system_sessions'));
        $this->assertTrue($chartKeys->contains('users_by_role'));
    }

    public function test_every_standard_role_can_load_its_dashboard_with_full_permissions(): void
    {
        $permissionIds = Permission::query()->pluck('id')->mapWithKeys(
            fn (int $id) => [$id => ['scope_type' => 'global']],
        )->all();

        foreach (Role::query()->get() as $role) {
            $role->permissions()->syncWithoutDetaching($permissionIds);
            $user = User::factory()->create([
                'assigned_levels' => $role->code === 'RTA' ? ['fourth'] : null,
            ]);
            $user->roles()->attach($role, ['scope_type' => 'global']);

            $this->actingAs($user)->getJson('/api/v1/dashboard/overview')
                ->assertOk()
                ->assertJsonPath('data.profile.roles.0', $role->code);
        }
    }
}
