<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthenticationSecurityTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
        ]);

        $role = Role::where('code', 'SYS_ADMIN')->firstOrFail();
        $permissions = Permission::whereIn('code', [
            'users.manage', 'roles.manage', 'settings.manage',
        ])->get();
        $role->permissions()->sync(
            $permissions->mapWithKeys(fn ($permission) => [
                $permission->id => ['scope_type' => 'global'],
            ])->all()
        );

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($role->id);
    }

    public function test_user_creation_rejects_a_weak_password(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/users', [
            'name' => 'Weak Password User',
            'email' => 'weak@example.test',
            'password' => 'password',
            'roles' => [],
        ])->assertStatus(422);

        $this->assertDatabaseMissing('users', ['email' => 'weak@example.test']);
    }

    public function test_password_reset_revokes_all_existing_sessions(): void
    {
        $target = User::factory()->create();
        $this->insertSession('target-session', $target->id);

        $this->actingAs($this->admin)->postJson("/api/v1/users/{$target->id}/reset-password", [
            'password' => 'SecurePass!2026',
        ])->assertOk();

        $this->assertDatabaseMissing('sessions', ['user_id' => $target->id]);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->admin->id,
            'action' => 'user.password_reset',
            'entity_type' => User::class,
            'entity_id' => $target->id,
        ]);
    }

    public function test_session_admin_uses_real_database_sessions_and_can_revoke_them(): void
    {
        $target = User::factory()->create();
        $this->insertSession('real-session-id', $target->id);

        $this->actingAs($this->admin)->getJson('/api/v1/admin/sessions')
            ->assertOk()
            ->assertJsonPath('data.sessions.0.id', 'real-session-id')
            ->assertJsonPath('data.sessions.0.user_id', $target->id);

        $this->actingAs($this->admin)->postJson("/api/v1/admin/sessions/{$target->id}/revoke")
            ->assertOk();

        $this->assertDatabaseMissing('sessions', ['id' => 'real-session-id']);
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $this->admin->id,
            'action' => 'user.sessions_revoked',
            'entity_type' => User::class,
            'entity_id' => $target->id,
        ]);
    }

    private function insertSession(string $id, int $userId): void
    {
        DB::table('sessions')->insert([
            'id' => $id,
            'user_id' => $userId,
            'ip_address' => '127.0.0.1',
            'user_agent' => 'PHPUnit',
            'payload' => 'encrypted-test-payload',
            'last_activity' => now()->timestamp,
        ]);
    }
}
