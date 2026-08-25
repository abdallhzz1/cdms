<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Correspondence extends Model {
    protected $table = 'correspondence'; 
    protected $fillable = ['reference_number','direction','category','subject','counterparty','correspondence_date','response_due_date','summary','status','submitted_at','read_at','returned_at','approved_at','closed_at','closed_by','close_notes','sender_id','assigned_to','priority'];
    protected $casts = ['sender_id'=>'integer','assigned_to'=>'integer','closed_by'=>'integer','correspondence_date'=>'date','response_due_date'=>'date','submitted_at'=>'datetime','read_at'=>'datetime','returned_at'=>'datetime','approved_at'=>'datetime','closed_at'=>'datetime'];

    public function sender() { return $this->belongsTo(User::class, 'sender_id'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function closer() { return $this->belongsTo(User::class, 'closed_by'); }
    public function transitions() { return $this->hasMany(WorkflowTransitionLog::class, 'entity_id')->where('entity_type', self::class)->latest(); }
    public function attachments() { return $this->hasMany(CorrespondenceAttachment::class); }
    public function participants() { return $this->hasMany(CorrespondenceParticipant::class); }
}
