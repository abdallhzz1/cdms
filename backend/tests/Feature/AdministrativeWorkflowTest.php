<?php

namespace Tests\Feature;

use App\Models\Meeting;
use App\Models\CorrespondenceAttachment;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class AdministrativeWorkflowTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_correspondence_is_dispatched_tracked_and_hidden_from_unrelated_users(): void
    {
        $sender = $this->userWithPermissions(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->userWithPermissions(['correspondence.view', 'correspondence.forward']);
        $nextRecipient = $this->userWithPermissions(['correspondence.view']);
        $outsider = $this->userWithPermissions(['correspondence.view']);

        $created = $this->asUser($sender)->postJson('/api/v1/correspondence', [
            'direction' => 'internal', 'category' => 'request', 'subject' => 'Clinical department request',
            'summary' => 'Please review.', 'correspondence_date' => now()->toDateString(),
            'priority' => 'urgent', 'assigned_to' => $recipient->id,
        ])->assertCreated()->assertJsonPath('data.status', 'submitted');

        $id = $created->json('data.id');
        $this->asUser($recipient)->getJson('/api/v1/correspondence?filter=inbox')
            ->assertOk()->assertJsonPath('data.0.id', $id);
        $this->getJson("/api/v1/correspondence/{$id}")->assertOk();
        $this->assertDatabaseHas('workflow_transition_logs', ['entity_id' => $id, 'to_state' => 'submitted']);
        $this->assertDatabaseCount('notifications', 1);

        $this->postJson("/api/v1/correspondence/{$id}/forward", [
            'assigned_to' => $nextRecipient->id, 'notes' => 'Forward for completion.',
        ])->assertOk();
        $this->getJson("/api/v1/correspondence/{$id}")->assertOk();
        $this->assertDatabaseHas('correspondence_participants', ['correspondence_id' => $id, 'user_id' => $recipient->id]);
        $this->assertDatabaseHas('correspondence_participants', ['correspondence_id' => $id, 'user_id' => $nextRecipient->id]);

        $this->asUser($outsider)->getJson("/api/v1/correspondence/{$id}")->assertForbidden();
    }

    public function test_meeting_task_is_created_and_completion_is_synchronized(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage', 'tasks.view', 'tasks.manage']);
        $assignee = $this->userWithPermissions(['tasks.view']);

        $meetingResponse = $this->asUser($manager)->postJson('/api/v1/meetings', [
            'minutes_number' => 'MTG-TEST-001', 'meeting_type' => 'Clinical Department Council',
            'meeting_date' => now()->toDateString(), 'status' => 'scheduled',
        ])->assertCreated();
        $meetingId = $meetingResponse->json('data.id');

        $actionResponse = $this->postJson("/api/v1/meetings/{$meetingId}/actions", [
            'item_type' => 'task', 'description' => 'Prepare the clinical rotation list',
            'assigned_to' => $assignee->id, 'priority' => 'high', 'due_date' => now()->addWeek()->toDateString(),
        ])->assertCreated();
        $taskId = $actionResponse->json('data.operational_task_id');

        $this->assertDatabaseHas('operational_tasks', [
            'id' => $taskId, 'assigned_to' => $assignee->id, 'source_type' => Meeting::class, 'source_id' => $meetingId,
        ]);

        $this->asUser($assignee)->putJson("/api/v1/operational-tasks/{$taskId}", [
            'status' => 'completed', 'completion_notes' => 'Completed and verified.',
        ])->assertOk()->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseHas('meeting_action_items', [
            'id' => $actionResponse->json('data.id'), 'status' => 'completed', 'completion_evidence' => 'Completed and verified.',
        ]);
    }

    public function test_correspondence_attachments_are_private_and_limited_to_participants(): void
    {
        Storage::fake('local');
        $sender = $this->userWithPermissions(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->userWithPermissions(['correspondence.view']);
        $outsider = $this->userWithPermissions(['correspondence.view']);
        $correspondenceId = $this->asUser($sender)->postJson('/api/v1/correspondence', [
            'direction' => 'internal', 'subject' => 'Documented request', 'summary' => 'See attachment.',
            'correspondence_date' => now()->toDateString(), 'assigned_to' => $recipient->id,
        ])->assertCreated()->json('data.id');

        $uploaded = $this->asUser($recipient)->post("/api/v1/correspondence/{$correspondenceId}/attachments", [
            'file' => UploadedFile::fake()->create('evidence.pdf', 120, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertCreated();
        $attachmentId = $uploaded->json('data.id');
        Storage::disk('local')->assertExists(CorrespondenceAttachment::findOrFail($attachmentId)->stored_path);

        $this->get("/api/v1/correspondence/{$correspondenceId}/attachments/{$attachmentId}/download")->assertOk();
        $this->asUser($outsider)->get("/api/v1/correspondence/{$correspondenceId}/attachments/{$attachmentId}/download")->assertForbidden();
    }

    public function test_correspondence_replies_behave_like_mail_and_return_to_the_other_users_inbox(): void
    {
        $sender = $this->userWithPermissions(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->userWithPermissions(['correspondence.view']);
        $id = $this->asUser($sender)->postJson('/api/v1/correspondence', [
            'direction' => 'internal', 'subject' => 'Schedule question', 'summary' => 'Please confirm.',
            'correspondence_date' => now()->toDateString(), 'assigned_to' => $recipient->id,
        ])->assertCreated()->json('data.id');

        $this->asUser($recipient)->getJson("/api/v1/correspondence/{$id}")->assertOk();
        $this->postJson("/api/v1/correspondence/{$id}/messages", ['body' => 'Confirmed.'])
            ->assertCreated()
            ->assertJsonPath('data.sender_id', $recipient->id)
            ->assertJsonPath('data.recipient_id', $sender->id);

        $this->asUser($sender)->getJson('/api/v1/correspondence?filter=inbox')
            ->assertOk()
            ->assertJsonPath('data.0.id', $id)
            ->assertJsonPath('data.0.mail_unread', true);
        $this->getJson("/api/v1/correspondence/{$id}")
            ->assertOk()
            ->assertJsonPath('data.messages.0.body', 'Confirmed.');
        $this->getJson('/api/v1/correspondence?filter=inbox')
            ->assertOk()
            ->assertJsonPath('data.0.mail_unread', false);
    }

    public function test_clinical_supervisors_cannot_correspond_with_each_other_but_can_contact_rta(): void
    {
        $supervisorRole = Role::factory()->create(['code' => 'CLINICAL_SUPERVISOR']);
        $this->grantPermissions($supervisorRole, ['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $firstSupervisor = User::factory()->create();
        $secondSupervisor = User::factory()->create();
        $firstSupervisor->roles()->attach($supervisorRole->id);
        $secondSupervisor->roles()->attach($supervisorRole->id);

        $rtaRole = Role::factory()->create(['code' => 'RTA']);
        $this->grantPermissions($rtaRole, ['correspondence.view']);
        $rta = User::factory()->create();
        $rta->roles()->attach($rtaRole->id);

        $payload = [
            'direction' => 'internal', 'subject' => 'Coordination request',
            'correspondence_date' => now()->toDateString(),
        ];
        $this->asUser($firstSupervisor)->postJson('/api/v1/correspondence', $payload + ['assigned_to' => $secondSupervisor->id])
            ->assertUnprocessable()->assertJsonValidationErrors('assigned_to');
        $this->postJson('/api/v1/correspondence', $payload + ['assigned_to' => $rta->id])->assertCreated();

        $lookup = $this->getJson('/api/v1/users/lookup?purpose=correspondence')->assertOk();
        $this->assertIsArray($lookup->json('data'));
        $this->assertTrue(array_is_list($lookup->json('data')));
        $ids = collect($lookup->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($secondSupervisor->id));
        $this->assertTrue($ids->contains($rta->id));
    }

    public function test_only_approved_minutes_permission_can_approve_and_reopen_minutes(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage']);
        $approver = $this->userWithPermissions(['meetings.manage', 'meetings.approve_minutes']);
        $meeting = Meeting::create([
            'minutes_number' => 'MTG-TEST-002', 'meeting_type' => 'Council', 'meeting_date' => now()->toDateString(),
            'status' => 'minutes_draft', 'created_by' => $manager->id,
        ]);

        $this->asUser($manager)->postJson("/api/v1/meetings/{$meeting->id}/approve")->assertForbidden();
        $this->asUser($approver)->postJson("/api/v1/meetings/{$meeting->id}/approve")
            ->assertOk()->assertJsonPath('data.status', 'approved');
        $this->putJson("/api/v1/meetings/{$meeting->id}", ['agenda' => 'Changed'])->assertStatus(422);
        $this->postJson("/api/v1/meetings/{$meeting->id}/reopen")->assertOk()->assertJsonPath('data.status', 'minutes_draft');
    }

    private function userWithPermissions(array $codes): User
    {
        $role = Role::factory()->create();
        $this->grantPermissions($role, $codes);
        $user = User::factory()->create();
        $user->roles()->attach($role->id);
        return $user;
    }

    private function grantPermissions(Role $role, array $codes): void
    {
        foreach ($codes as $code) {
            $permission = Permission::firstOrCreate(['code' => $code], [
                'module' => 'Administrative', 'action' => strtoupper(str_replace('.', '_', $code)),
                'description_key' => 'permissions.'.str_replace('.', '_', $code).'.description',
            ]);
            $role->permissions()->attach($permission->id, ['scope_type' => 'global']);
        }
    }

    private function asUser(User $user): static
    {
        $this->app['auth']->forgetGuards();
        return $this->actingAs($user, 'web');
    }
}
