<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Meeting extends Model
{
    protected $fillable=['minutes_number','meeting_type','status','meeting_date','meeting_time','location','chairperson','attendees','absentees','agenda','discussion_summary','decisions_summary','implementation_owner','created_by','approved_by','approved_at','cancelled_at','cancellation_reason'];
    protected $casts=['meeting_date'=>'date','approved_at'=>'datetime','cancelled_at'=>'datetime'];
    public function actionItems(){return $this->hasMany(MeetingActionItem::class);}
    public function creator(){return $this->belongsTo(User::class, 'created_by');}
    public function approver(){return $this->belongsTo(User::class, 'approved_by');}
    public function transitions(){return $this->hasMany(WorkflowTransitionLog::class, 'entity_id')->where('entity_type', self::class)->latest();}
}
