<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuditLogControllerTest extends TestCase
{
    use RefreshDatabase;

    private function userWithAuditPermission(): User
    {
        $role = Role::factory()->create();
        $permission = Permission::factory()->create(['code' => 'audit.view']);
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);
        $user = User::factory()->create();
        $user->roles()->attach($role->id, ['scope_type' => 'global']);

        return $user;
    }

    public function test_audit_index_filters_entries_and_masks_sensitive_change_values(): void
    {
        $user = $this->userWithAuditPermission();
        AuditLog::create([
            'user_id' => $user->id,
            'action' => 'Course.updated',
            'entity_type' => 'Course',
            'entity_id' => 10,
            'changes' => ['before' => ['password' => 'private-value'], 'after' => ['name_ar' => 'مساق']],
        ]);
        AuditLog::create([
            'action' => 'Student.created',
            'entity_type' => 'Student',
            'entity_id' => 11,
        ]);

        $this->actingAs($user, 'web')
            ->getJson('/api/v1/audit-logs?action=Course.updated&entity_type=Course')
            ->assertOk()
            ->assertJsonPath('data.0.action', 'Course.updated')
            ->assertJsonPath('data.0.changes.before.password', '********')
            ->assertJsonCount(1, 'data');
    }
}
