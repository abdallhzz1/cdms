<?php

namespace App\Listeners;

use App\Events\DistributionPublishedEvent;
use App\Models\User;
use App\Notifications\DistributionPublishedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class SendDistributionPublishedNotification implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;
    public array $backoff = [10, 30, 60];

    public function handle(DistributionPublishedEvent $event): void
    {
        // 1. Resolve active authorized users (Department Directors / Admins)
        $recipients = User::where('is_active', true)
            ->whereHas('roles.permissions', function ($q) {
                $q->whereIn('code', ['distribution.publish', 'distribution.approve']);
            })
            ->get();

        foreach ($recipients as $user) {
            try {
                // Idempotency check: ensure notification hasn't already been sent for this eventId
                $exists = $user->notifications()
                    ->where('data->event_id', $event->eventId)
                    ->exists();

                if (!$exists) {
                    $user->notify(new DistributionPublishedNotification($event));
                }
            } catch (\Throwable $e) {
                Log::error("Failed sending DistributionPublishedNotification to user {$user->id}: " . $e->getMessage());
            }
        }
    }
}
