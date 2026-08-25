<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class MeetingActionItem extends Model
{
    protected $fillable=['meeting_id','item_type','description','responsible','assigned_to','operational_task_id','executing_entity','priority','due_date','status','completed_date','completion_evidence','notes'];
    protected $casts=['due_date'=>'date','completed_date'=>'date'];
    public function meeting(){return $this->belongsTo(Meeting::class);}
    public function assignee(){return $this->belongsTo(User::class, 'assigned_to');}
    public function operationalTask(){return $this->belongsTo(OperationalTask::class);}
}
