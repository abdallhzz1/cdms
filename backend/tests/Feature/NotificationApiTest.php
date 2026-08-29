<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\LocalSystemNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NotificationApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_user_can_list_and_read_only_their_own_notifications(): void
    {
        $user = User::factory()->create();
        $other = User::factory()->create();
        $user->notify($this->notification('Own notification'));
        $other->notify($this->notification('Private notification'));

        $this->actingAs($user, 'web');
        $response = $this->getJson('/api/v1/notifications')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.title_en', 'Own notification')
            ->assertJsonPath('meta.unread_count', 1);

        $ownId = $response->json('data.0.id');
        $otherId = $other->notifications()->firstOrFail()->id;

        $this->patchJson("/api/v1/notifications/{$otherId}/read")->assertNotFound();
        $this->patchJson("/api/v1/notifications/{$ownId}/read")->assertOk()
            ->assertJsonPath('data.read_at', fn ($value) => is_string($value));
        $this->getJson('/api/v1/notifications/unread-count')->assertOk()->assertJsonPath('data.count', 0);
    }

    public function test_user_can_mark_all_notifications_as_read(): void
    {
        $user = User::factory()->create();
        $user->notify($this->notification('First'));
        $user->notify($this->notification('Second'));

        $this->actingAs($user, 'web')->postJson('/api/v1/notifications/read-all')->assertOk()
            ->assertJsonPath('data.marked_count', 2);

        $this->assertSame(0, $user->fresh()->unreadNotifications()->count());
    }

    private function notification(string $title): LocalSystemNotification
    {
        return new LocalSystemNotification([
            'event_key' => 'test.created',
            'category' => 'system',
            'severity' => 'info',
            'title_ar' => 'إشعار اختباري',
            'title_en' => $title,
            'message_ar' => 'رسالة',
            'message_en' => 'Message',
            'action_url' => '/',
        ]);
    }
}
