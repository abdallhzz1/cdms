<?php

namespace App\Listeners;

use App\Events\ApprovalRevokedEvent;
use App\Models\User;
use App\Notifications\ApprovalRevokedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class SendApprovalRevokedNotification implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;
    public array $backoff = [10, 30, 60];

    public function handle(ApprovalRevokedEvent $event): void
    {
        $recipients = User::where('is_active', true)
            ->whereHas('roles.permissions', function ($q) {
                $q->whereIn('code', ['distribution.approve', 'distribution.publish']);
            })
            ->get();

        foreach ($recipients as $user) {
            try {
                $exists = $user->notifications()
                    ->where('data->event_id', $event->eventId)
                    ->exists();

                if (!$exists) {
                    $user->notify(new ApprovalRevokedNotification($event));
                }
            } catch (\Throwable $e) {
                Log::error("Failed sending ApprovalRevokedNotification to user {$user->id}: " . $e->getMessage());
            }
        }
    }
}
