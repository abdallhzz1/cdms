<?php

namespace Tests\Feature;

use App\Models\ApprovalRequest;
use App\Models\ApprovalWorkflow;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use App\Services\Approvals\ApprovalWorkflowService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ApprovalWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\RoleSeeder::class, \Database\Seeders\PermissionSeeder::class]);
    }

    public function test_sequential_workflow_requires_configured_roles_and_distinct_approvers(): void
    {
        $requester = User::factory()->create();
        $director = $this->userWithRoleAndPermissions('CLINICAL_DIRECTOR', ['approvals.view', 'approvals.decide']);
        $dean = $this->userWithRoleAndPermissions('DEAN', ['approvals.view', 'approvals.decide']);
        $service = app(ApprovalWorkflowService::class);

        $request = $service->submit('grade_sheet', 'grade_sheet', '22:4', $requester, 'كشف علامات', 'Grade sheet', '/grades');
        $first = $service->approve('grade_sheet', 'grade_sheet', '22:4', $director);
        $this->assertFalse($first['completed']);
        $this->assertSame(2, $first['request']->current_step_order);
        $this->assertSame('pending', $first['request']->status);

        try {
            $service->approve('grade_sheet', 'grade_sheet', '22:4', $director);
            $this->fail('The director must not complete the dean stage.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('approval', $exception->errors());
        }

        $final = $service->approve('grade_sheet', 'grade_sheet', '22:4', $dean);
        $this->assertTrue($final['completed']);
        $this->assertSame('approved', $final['request']->status);
        $this->assertDatabaseCount('approval_actions', 3);
        $this->assertNotNull($request->fresh()->completed_at);
    }

    public function test_requester_cannot_approve_own_request(): void
    {
        $director = $this->userWithRoleAndPermissions('CLINICAL_DIRECTOR', ['approvals.decide']);
        $service = app(ApprovalWorkflowService::class);
        $service->submit('clinical_assessment', 'clinical_assessment', 55, $director, 'تقييم', 'Assessment');

        $this->expectException(ValidationException::class);
        $service->approve('clinical_assessment', 'clinical_assessment', 55, $director);
    }

    public function test_admin_can_change_stages_and_approval_inbox_is_role_scoped(): void
    {
        $admin = $this->userWithRoleAndPermissions('SYS_ADMIN', ['approval_workflows.view', 'approval_workflows.manage']);
        $director = $this->userWithRoleAndPermissions('CLINICAL_DIRECTOR', ['approvals.view', 'approvals.decide']);
        $dean = $this->userWithRoleAndPermissions('DEAN', ['approvals.view', 'approvals.decide']);
        $requester = User::factory()->create();

        $workflow = ApprovalWorkflow::where('code', 'clinical_assessment')->firstOrFail();
        $this->actingAs($admin)->putJson('/api/v1/approval-workflows/clinical_assessment', [
            'is_active' => true, 'prevent_requester_approval' => true, 'require_distinct_approvers' => false,
            'steps' => [['name_ar' => 'اعتماد العمادة', 'name_en' => 'Dean approval', 'role_codes' => ['DEAN']]],
        ])->assertOk()->assertJsonPath('data.steps.0.role_codes.0', 'DEAN');
        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $admin->id,
            'action' => 'approval_workflow.updated',
            'entity_type' => ApprovalWorkflow::class,
            'entity_id' => $workflow->id,
        ]);

        app(ApprovalWorkflowService::class)->submit('clinical_assessment', 'clinical_assessment', 77, $requester, 'تقييم طالب', 'Student assessment', '/assessments');
        $this->actingAs($director)->getJson('/api/v1/approvals')->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($dean)->getJson('/api/v1/approvals')->assertOk()->assertJsonCount(1, 'data');
        $this->assertSame(['DEAN'], $workflow->fresh('steps')->steps->first()->role_codes);
    }

    public function test_pending_request_protects_workflow_configuration_and_return_creates_a_new_cycle(): void
    {
        $admin = $this->userWithRoleAndPermissions('SYS_ADMIN', ['approval_workflows.manage']);
        $director = $this->userWithRoleAndPermissions('CLINICAL_DIRECTOR', ['approvals.decide']);
        $requester = User::factory()->create();
        $service = app(ApprovalWorkflowService::class);

        $first = $service->submit('clinical_assessment', 'clinical_assessment', 91, $requester, 'تقييم', 'Assessment');
        $this->actingAs($admin)->putJson('/api/v1/approval-workflows/clinical_assessment', [
            'is_active' => true, 'prevent_requester_approval' => true, 'require_distinct_approvers' => false,
            'steps' => [['name_ar' => 'اعتماد الدائرة', 'name_en' => 'Department approval', 'role_codes' => ['CLINICAL_DIRECTOR']]],
        ])->assertUnprocessable()->assertJsonValidationErrors('workflow');

        $service->returnForRevision('clinical_assessment', 'clinical_assessment', 91, $director, 'استكمال البيانات');
        $this->assertSame('returned', $first->fresh()->status);

        $second = $service->submit('clinical_assessment', 'clinical_assessment', 91, $requester, 'تقييم', 'Assessment');
        $this->assertNotSame($first->id, $second->id);
        $this->assertSame('pending', $second->status);
    }

    private function userWithRoleAndPermissions(string $roleCode, array $permissions): User
    {
        $role = Role::where('code', $roleCode)->firstOrFail();
        foreach (Permission::whereIn('code', $permissions)->get() as $permission) {
            $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $user = User::factory()->create();
        $user->roles()->attach($role);
        return $user;
    }
}
