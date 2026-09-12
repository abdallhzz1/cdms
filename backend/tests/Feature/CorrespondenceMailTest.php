<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CorrespondenceMailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_message_supports_to_cc_and_fyi_without_an_approval_request(): void
    {
        $sender = $this->user(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $to = $this->user(['correspondence.view']);
        $cc = $this->user(['correspondence.view']);
        $fyi = $this->user(['correspondence.view']);

        $response = $this->as($sender)->postJson('/api/v1/correspondence', [
            'subject' => 'Rotation update', 'body' => 'Please review the attached update.',
            'to' => [$to->id], 'cc' => [$cc->id], 'fyi' => [$fyi->id],
            'message_type' => 'action', 'response_due_date' => now()->addDay()->toDateString(), 'send_now' => true,
        ])->assertCreated()->assertJsonPath('data.status', 'sent');

        $id = $response->json('data.id');
        $this->assertDatabaseHas('correspondence_participants', ['correspondence_id' => $id, 'user_id' => $to->id, 'participant_role' => 'to']);
        $this->assertDatabaseHas('correspondence_participants', ['correspondence_id' => $id, 'user_id' => $cc->id, 'participant_role' => 'cc']);
        $this->assertDatabaseHas('correspondence_participants', ['correspondence_id' => $id, 'user_id' => $fyi->id, 'participant_role' => 'fyi']);
        $this->assertDatabaseMissing('approval_requests', ['subject_type' => 'correspondence', 'subject_id' => (string) $id]);
        $this->as($to)->getJson('/api/v1/correspondence?filter=action')->assertOk()->assertJsonPath('meta.unread', 1)->assertJsonPath('data.0.id', $id);
    }

    public function test_read_star_archive_and_restore_are_private_per_user(): void
    {
        $sender = $this->user(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->user(['correspondence.view']);
        $id = $this->as($sender)->postJson('/api/v1/correspondence', ['subject' => 'Private state', 'to' => [$recipient->id], 'send_now' => true])->assertCreated()->json('data.id');

        $this->as($recipient)->getJson("/api/v1/correspondence/{$id}")->assertOk();
        $this->getJson('/api/v1/correspondence?filter=inbox')->assertJsonPath('meta.unread', 0);
        $this->postJson("/api/v1/correspondence/{$id}/mailbox/star")->assertOk();
        $this->getJson('/api/v1/correspondence?filter=starred')->assertJsonPath('data.0.id', $id);
        $this->postJson("/api/v1/correspondence/{$id}/mailbox/archive")->assertOk();
        $this->getJson('/api/v1/correspondence?filter=inbox')->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/correspondence?filter=archive')->assertJsonPath('data.0.id', $id);
        $this->postJson("/api/v1/correspondence/{$id}/mailbox/restore")->assertOk();
        $this->getJson('/api/v1/correspondence?filter=inbox')->assertJsonPath('data.0.id', $id);
        $this->as($sender)->getJson('/api/v1/correspondence?filter=outbox')->assertJsonPath('data.0.id', $id);
    }

    public function test_mail_html_is_sanitized_and_removed_template_routes_are_unavailable(): void
    {
        $sender = $this->user(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->user(['correspondence.view']);
        $response = $this->as($sender)->postJson('/api/v1/correspondence', [
            'subject' => 'Formatted message', 'to' => [$recipient->id], 'send_now' => true,
            'body' => '<strong>Hello</strong><script>alert(1)</script><a href="javascript:alert(2)" onclick="alert(3)">bad</a>',
        ])->assertCreated();
        $body = $response->json('data.summary');
        $this->assertStringContainsString('<strong>Hello</strong>', $body);
        $this->assertStringNotContainsString('<script', $body);
        $this->assertStringNotContainsString('javascript:', $body);
        $this->assertStringNotContainsString('onclick', $body);
        $this->getJson('/api/v1/correspondence-templates')->assertNotFound();
        $this->getJson('/api/v1/correspondence-report')->assertNotFound();
    }

    public function test_bcc_recipients_are_hidden_from_other_recipients(): void
    {
        $sender = $this->user(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->user(['correspondence.view']);
        $bcc = $this->user(['correspondence.view']);
        $id = $this->as($sender)->postJson('/api/v1/correspondence', ['subject' => 'Private copy', 'to' => [$recipient->id], 'fyi' => [$bcc->id], 'send_now' => true])->assertCreated()->json('data.id');
        $participants = $this->as($recipient)->getJson("/api/v1/correspondence/{$id}")->assertOk()->json('data.participants');
        $this->assertFalse(collect($participants)->contains('user_id', $bcc->id));
        $bccParticipants = $this->as($bcc)->getJson("/api/v1/correspondence/{$id}")->assertOk()->json('data.participants');
        $this->assertTrue(collect($bccParticipants)->contains('user_id', $bcc->id));
    }

    public function test_arabic_mail_pdf_can_be_generated_in_the_requested_language(): void
    {
        $sender = $this->user(['correspondence.view', 'correspondence.create', 'correspondence.submit']);
        $recipient = $this->user(['correspondence.view']);
        $id = $this->as($sender)->postJson('/api/v1/correspondence', [
            'subject' => 'تحديث التدريب السريري', 'body' => '<strong>مرحباً بكم</strong>',
            'to' => [$recipient->id], 'send_now' => true,
        ])->assertCreated()->json('data.id');

        $this->get("/api/v1/correspondence/{$id}/print?locale=ar")
            ->assertOk()
            ->assertHeader('content-type', 'application/pdf');
    }

    public function test_legacy_approval_actions_are_not_routes_and_workflow_is_hidden(): void
    {
        $user = $this->user(['correspondence.view', 'approval_workflows.view']);
        $this->as($user)->postJson('/api/v1/correspondence/999/approve')->assertNotFound();
        $workflows = $this->getJson('/api/v1/approval-workflows')->assertOk()->json('data.workflows');
        $this->assertFalse(collect($workflows)->contains('code', 'correspondence'));
    }

    private function user(array $codes): User
    {
        $role = Role::factory()->create();
        foreach ($codes as $code) {
            $permission = Permission::firstOrCreate(['code' => $code], ['module' => 'Administrative', 'action' => strtoupper(str_replace('.', '_', $code)), 'description_key' => 'permissions.'.str_replace('.', '_', $code).'.description']);
            $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $user = User::factory()->create();
        $user->roles()->attach($role);

        return $user;
    }

    private function as(User $user): static
    {
        $this->app['auth']->forgetGuards();

        return $this->actingAs($user, 'web');
    }
}
