<?php

namespace App\Listeners;

use App\Events\SupervisorReassignedEvent;
use App\Models\Person;
use App\Models\User;
use App\Notifications\SupervisorReassignedNotification;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Support\Facades\Log;

class SendSupervisorReassignedNotification implements ShouldQueue
{
    use InteractsWithQueue;

    public int $tries = 3;
    public array $backoff = [10, 30, 60];

    public function handle(SupervisorReassignedEvent $event): void
    {
        $recipientUserIds = [];

        // 1. Resolve new supervisor user
        if ($event->newSupervisorId !== null) {
            $newSupervisor = Person::find($event->newSupervisorId);
            if ($newSupervisor && $newSupervisor->user_id && $newSupervisor->is_active) {
                $recipientUserIds[] = $newSupervisor->user_id;
            }
        }

        // 2. Resolve previous supervisor user
        if ($event->previousSupervisorId !== null) {
            $prevSupervisor = Person::find($event->previousSupervisorId);
            if ($prevSupervisor && $prevSupervisor->user_id && $prevSupervisor->is_active) {
                $recipientUserIds[] = $prevSupervisor->user_id;
            }
        }

        // 3. Resolve department admins/coordinators
        $adminUserIds = User::where('is_active', true)
            ->whereHas('roles.permissions', function ($q) {
                $q->whereIn('code', ['distribution.update', 'distribution.publish']);
            })
            ->pluck('id')
            ->toArray();

        $allRecipientIds = array_unique(array_merge($recipientUserIds, $adminUserIds));
        $recipients = User::whereIn('id', $allRecipientIds)->where('is_active', true)->get();

        foreach ($recipients as $user) {
            try {
                $exists = $user->notifications()
                    ->where('data->event_id', $event->eventId)
                    ->exists();

                if (!$exists) {
                    $user->notify(new SupervisorReassignedNotification($event));
                }
            } catch (\Throwable $e) {
                Log::error("Failed sending SupervisorReassignedNotification to user {$user->id}: " . $e->getMessage());
            }
        }
    }
}
