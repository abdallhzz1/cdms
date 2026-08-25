<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class AdministrativeWorkAssignedNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $workType, private readonly int $workId, private readonly string $title) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return [
            'type' => $this->workType, 'id' => $this->workId, 'title' => $this->title,
            'message_ar' => $this->workType === 'task' ? 'تم تكليفك بمهمة جديدة' : 'لديك مراسلة جديدة تحتاج إلى المتابعة',
            'message_en' => $this->workType === 'task' ? 'A new task has been assigned to you' : 'A new correspondence requires your attention',
        ];
    }
}
