<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PermissionMatrixWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private Role $adminRole;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\Phase3PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
        ]);

        $this->adminRole = Role::where('code', 'SYS_ADMIN')->firstOrFail();
        $bootstrap = Permission::whereIn('code', ['users.manage', 'roles.manage'])->get();
        $this->adminRole->permissions()->syncWithoutDetaching(
            $bootstrap->mapWithKeys(fn (Permission $permission) => [
                $permission->id => ['scope_type' => 'global'],
            ])->all()
        );

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($this->adminRole->id);
    }

    public function test_matrix_contains_group_registration_permissions_and_covers_guarded_routes(): void
    {
        $response = $this->actingAs($this->admin)->getJson('/api/v1/admin/permissions/matrix');

        $response->assertOk()
            ->assertJsonPath('data.audit.is_complete', true)
            ->assertJsonPath('data.audit.missing_route_permissions', []);

        $codes = collect($response->json('data.permissions'))->pluck('code');

        $this->assertEqualsCanonicalizing([
            'group_registration.view',
            'group_registration.manage_roster',
            'group_registration.manage_groups',
            'group_registration.open_close',
            'group_registration.override',
            'group_registration.export',
        ], $codes->filter(fn (string $code) => str_starts_with($code, 'group_registration.'))->values()->all());
    }

    public function test_matrix_access_does_not_require_unrelated_user_management_permission(): void
    {
        $role = Role::where('code', 'QUALITY')->firstOrFail();
        $permission = Permission::where('code', 'roles.manage')->firstOrFail();
        $role->permissions()->syncWithoutDetaching([
            $permission->id => ['scope_type' => 'global'],
        ]);
        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->actingAs($user)->getJson('/api/v1/admin/permissions/matrix')->assertOk();
    }

    public function test_setting_a_permission_is_idempotent(): void
    {
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $permission = Permission::where('code', 'group_registration.view')->firstOrFail();

        $payload = [
            'role_id' => $role->id,
            'permission_id' => $permission->id,
            'granted' => true,
        ];

        $this->actingAs($this->admin)->postJson('/api/v1/admin/permissions/toggle', $payload)->assertOk();
        $this->actingAs($this->admin)->postJson('/api/v1/admin/permissions/toggle', $payload)->assertOk();

        $this->assertSame(1, $role->permissions()->where('permissions.id', $permission->id)->count());
    }

    public function test_roles_manage_cannot_be_revoked_from_system_admin_role(): void
    {
        $permission = Permission::where('code', 'roles.manage')->firstOrFail();

        $this->actingAs($this->admin)->postJson('/api/v1/admin/permissions/toggle', [
            'role_id' => $this->adminRole->id,
            'permission_id' => $permission->id,
            'granted' => false,
        ])->assertStatus(422);

        $this->assertTrue($this->adminRole->permissions()->where('permissions.id', $permission->id)->exists());
    }
}
