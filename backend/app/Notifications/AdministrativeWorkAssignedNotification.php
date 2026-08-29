<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class AdministrativeWorkAssignedNotification extends Notification
{
    use Queueable;

    public function __construct(private readonly string $workType, private readonly int $workId, private readonly string $title) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        $isTask = $this->workType === 'task';
        $isReply = $this->workType === 'correspondence_reply';
        $isReturned = $this->workType === 'correspondence_returned';

        return [
            'event_key' => $isTask ? 'task.assigned' : ($isReply ? 'correspondence.reply' : ($isReturned ? 'correspondence.returned' : 'correspondence.assigned')),
            'category' => $isTask ? 'tasks' : 'correspondence',
            'severity' => 'action',
            'title_ar' => $isTask ? 'مهمة جديدة' : ($isReply ? 'رد جديد على مراسلة' : ($isReturned ? 'مراسلة معادة للتعديل' : 'مراسلة جديدة')),
            'title_en' => $isTask ? 'New task' : ($isReply ? 'New correspondence reply' : ($isReturned ? 'Correspondence returned' : 'New correspondence')),
            'message_ar' => ($isTask ? 'تم تكليفك بالمهمة: ' : ($isReply ? 'وصل رد جديد على: ' : ($isReturned ? 'أعيدت إليك المراسلة: ' : 'لديك مراسلة تحتاج إلى المتابعة: '))).$this->title,
            'message_en' => ($isTask ? 'You were assigned the task: ' : ($isReply ? 'A new reply was added to: ' : ($isReturned ? 'The correspondence was returned to you: ' : 'A correspondence requires your attention: '))).$this->title,
            'action_url' => $isTask ? '/tasks' : '/correspondence/'.$this->workId,
            'entity_type' => $this->workType,
            'entity_id' => $this->workId,
        ];
    }
}
