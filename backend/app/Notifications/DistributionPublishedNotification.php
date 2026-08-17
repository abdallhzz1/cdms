<?php

namespace App\Notifications;

use App\Events\DistributionPublishedEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class DistributionPublishedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly DistributionPublishedEvent $event
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'event_id'                => $this->event->eventId,
            'title'                   => 'Clinical Distribution Published',
            'distribution_version_id' => $this->event->distributionVersionId,
            'rotation_id'             => $this->event->rotationId,
            'published_by_user_id'    => $this->event->publishedByUserId,
            'is_override'             => $this->event->isOverride,
            'override_reason'         => $this->event->overrideReason,
            'timestamp'               => $this->event->timestamp,
        ];
    }
}
