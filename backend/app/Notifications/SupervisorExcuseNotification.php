<?php

namespace App\Notifications;

use App\Models\SupervisorFollowupRecord;
use Illuminate\Notifications\Notification;

class SupervisorExcuseNotification extends Notification
{
    public function __construct(private readonly SupervisorFollowupRecord $record, private readonly bool $reviewed = false) {}
    public function via(object $notifiable): array { return ['database']; }
    public function toArray(object $notifiable): array
    {
        return [
            'category' => 'supervisors', 'severity' => $this->reviewed ? 'info' : 'action',
            'title_ar' => $this->reviewed ? 'تمت مراجعة عذر المشرف' : 'عذر مشرف بانتظار المراجعة',
            'title_en' => $this->reviewed ? 'Supervisor excuse reviewed' : 'Supervisor excuse awaiting review',
            'message_ar' => $this->reviewed ? 'تم تسجيل قرار مراجعة العذر. افتح السجل للاطلاع على التفاصيل.' : 'يوجد عذر جديد ضمن نطاق صلاحياتك يحتاج إلى مراجعة.',
            'message_en' => $this->reviewed ? 'A review decision has been recorded. Open the record for details.' : 'A new excuse within your access scope awaits review.',
            'action_url' => '/clinical-supervisors/'.$this->record->supervisor_user_id.'?tab=followup',
            'entity_type' => 'supervisor_followup', 'entity_id' => $this->record->id,
        ];
    }
}
