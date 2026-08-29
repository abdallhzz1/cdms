<?php

namespace App\Notifications;

use App\Events\ApprovalRevokedEvent;
use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Notification;

class ApprovalRevokedNotification extends Notification
{
    use Queueable;

    public function __construct(
        public readonly ApprovalRevokedEvent $event
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'event_id' => $this->event->eventId,
            'event_key' => 'distribution.approval_revoked',
            'category' => 'distribution',
            'severity' => 'urgent',
            'title_ar' => 'سحب اعتماد جدول التوزيع',
            'title_en' => 'Distribution approval revoked',
            'message_ar' => 'تم سحب اعتماد الجدول بعد تعديل محتواه ويجب مراجعته مجدداً.',
            'message_en' => 'The distribution approval was revoked after changes and requires review.',
            'action_url' => '/distribution',
            'entity_type' => 'distribution_version',
            'entity_id' => $this->event->distributionVersionId,
            'distribution_version_id' => $this->event->distributionVersionId,
            'rotation_id' => $this->event->rotationId,
            'revoked_by_user_id' => $this->event->revokedByUserId,
            'reason' => $this->event->reason,
            'timestamp' => $this->event->timestamp,
        ];
    }
}
