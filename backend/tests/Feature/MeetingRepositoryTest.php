<?php

namespace Tests\Feature;

use App\Models\Meeting;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class MeetingRepositoryTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost');
        Storage::fake('local');
    }

    public function test_manager_can_create_repository_and_share_selected_minutes_publicly(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage']);
        $meeting = Meeting::create([
            'minutes_number' => 'MTG-SHARE-001',
            'meeting_type' => 'Clinical Council',
            'meeting_date' => now()->toDateString(),
            'status' => 'approved',
            'agenda' => 'Agenda text',
            'discussion_summary' => 'Discussion text',
            'decisions_summary' => 'Decision text',
            'created_by' => $manager->id,
        ]);

        $response = $this->actingAs($manager, 'web')->postJson('/api/v1/meeting-repositories', [
            'title' => 'September council minutes',
            'description' => 'Shared with the faculty council',
            'meeting_ids' => [$meeting->id],
            'is_active' => true,
        ])->assertCreated()
            ->assertJsonPath('data.meetings.0.id', $meeting->id);

        $publicPath = $response->json('data.public_path');
        $this->assertIsString($publicPath);
        $this->getJson('/api/v1/public'.str_replace('/shared', '', $publicPath))
            ->assertOk()
            ->assertJsonPath('data.title', 'September council minutes')
            ->assertJsonPath('data.meetings.0.decisions_summary', 'Decision text');

        $this->assertDatabaseHas('audit_logs', [
            'user_id' => $manager->id,
            'action' => 'meeting_repository.created',
        ]);
    }

    public function test_repository_link_is_permanent_and_unchanged_after_updates(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage']);
        $created = $this->actingAs($manager, 'web')->postJson('/api/v1/meeting-repositories', [
            'title' => 'Committee archive',
        ])->assertCreated();
        $repositoryId = $created->json('data.id');
        $publicPath = $created->json('data.public_path');
        $publicApiPath = '/api/v1/public'.str_replace('/shared', '', $publicPath);

        DB::table('meeting_repositories')->where('id', $repositoryId)->update(['expires_at' => now()->subDay()]);
        $this->getJson($publicApiPath)->assertOk();

        $this->putJson("/api/v1/meeting-repositories/{$repositoryId}", ['is_active' => false])->assertOk();
        $this->getJson($publicApiPath)->assertNotFound();

        $updated = $this->putJson("/api/v1/meeting-repositories/{$repositoryId}", [
            'title' => 'Updated committee archive',
            'is_active' => true,
        ])->assertOk();

        $this->assertSame($publicPath, $updated->json('data.public_path'));
        $this->getJson($publicApiPath)->assertOk()
            ->assertJsonPath('data.title', 'Updated committee archive');
    }

    public function test_private_files_are_only_exposed_through_authorized_or_active_share_routes(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage']);
        $created = $this->actingAs($manager, 'web')->postJson('/api/v1/meeting-repositories', [
            'title' => 'Minutes files',
        ])->assertCreated();
        $repositoryId = $created->json('data.id');
        $token = basename($created->json('data.public_path'));

        $upload = $this->post('/api/v1/meeting-repositories/'.$repositoryId.'/files', [
            'files' => [UploadedFile::fake()->image('minutes.png')],
        ])->assertCreated();
        $fileId = $upload->json('data.0.id');

        $this->get("/api/v1/meeting-repositories/{$repositoryId}/files/{$fileId}/download")->assertOk();
        $this->get("/api/v1/public/meeting-repositories/{$token}/files/{$fileId}")->assertOk();

        $this->putJson("/api/v1/meeting-repositories/{$repositoryId}", ['allow_download' => false])->assertOk();
        $this->get("/api/v1/public/meeting-repositories/{$token}/files/{$fileId}")->assertOk();
        $this->get("/api/v1/public/meeting-repositories/{$token}/files/{$fileId}?download=1")->assertForbidden();
    }

    public function test_repository_management_requires_meetings_permission(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'web')->getJson('/api/v1/meeting-repositories')->assertForbidden();
    }

    public function test_only_approved_minutes_can_be_linked_to_a_public_repository(): void
    {
        $manager = $this->userWithPermissions(['meetings.manage']);
        $draftMeeting = Meeting::create([
            'minutes_number' => 'MTG-DRAFT-001',
            'meeting_type' => 'Clinical Council',
            'meeting_date' => now()->toDateString(),
            'status' => 'draft',
            'created_by' => $manager->id,
        ]);

        $this->actingAs($manager, 'web')->postJson('/api/v1/meeting-repositories', [
            'title' => 'Draft minutes repository',
            'meeting_ids' => [$draftMeeting->id],
        ])->assertUnprocessable()
            ->assertJsonValidationErrors('meeting_ids.0');

        $this->assertDatabaseCount('meeting_repositories', 0);
    }

    private function userWithPermissions(array $codes): User
    {
        $role = Role::factory()->create();
        foreach ($codes as $code) {
            $permission = Permission::firstOrCreate(['code' => $code], [
                'module' => 'Meetings',
                'action' => strtoupper(str_replace('.', '_', $code)),
                'description_key' => 'permissions.'.str_replace('.', '_', $code).'.description',
            ]);
            $role->permissions()->attach($permission->id, ['scope_type' => 'global']);
        }
        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        return $user;
    }
}
