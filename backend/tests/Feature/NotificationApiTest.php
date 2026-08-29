<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\LocalSystemNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Notifications\DatabaseNotification;
use Illuminate\Support\Str;
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

    public function test_legacy_english_distribution_notification_is_returned_bilingually(): void
    {
        $user = User::factory()->create();
        DatabaseNotification::query()->create([
            'id' => (string) Str::uuid(),
            'type' => 'App\\Notifications\\DistributionPublishedNotification',
            'notifiable_type' => User::class,
            'notifiable_id' => $user->id,
            'data' => [
                'title' => 'Clinical Distribution Published',
                'distribution_version_id' => 9,
            ],
        ]);

        $this->actingAs($user, 'web')->getJson('/api/v1/notifications')->assertOk()
            ->assertJsonPath('data.0.title_ar', 'نشر جدول التوزيع السريري')
            ->assertJsonPath('data.0.title_en', 'Clinical distribution published')
            ->assertJsonPath('data.0.action_url', '/distribution');
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
