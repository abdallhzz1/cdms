<?php
namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OperationalTask extends Model
{
    protected $fillable = ['created_by','assigned_to','source_type','source_id','title','description','due_date','priority','status','started_at','completed_at','completion_notes'];
    protected $casts = ['due_date'=>'date','started_at'=>'datetime','completed_at'=>'datetime'];

    public function creator() { return $this->belongsTo(User::class, 'created_by'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
    public function meetingActionItem() { return $this->hasOne(MeetingActionItem::class); }
}
