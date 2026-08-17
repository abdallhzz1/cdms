<?php

namespace App\Notifications;

use App\Events\SupervisorReassignedEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class SupervisorReassignedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly SupervisorReassignedEvent $event
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'event_id'                => $this->event->eventId,
            'title'                   => 'Supervisor Reassigned',
            'assignment_id'           => $this->event->assignmentId,
            'distribution_version_id' => $this->event->distributionVersionId,
            'rotation_id'             => $this->event->rotationId,
            'student_id'              => $this->event->studentId,
            'previous_supervisor_id'  => $this->event->previousSupervisorId,
            'new_supervisor_id'       => $this->event->newSupervisorId,
            'performed_by_user_id'    => $this->event->performedByUserId,
            'timestamp'               => $this->event->timestamp,
        ];
    }
}
