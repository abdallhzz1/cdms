<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class Correspondence extends Model { 
    protected $table = 'correspondence'; 
    protected $fillable = ['reference_number','direction','subject','counterparty','correspondence_date','summary','status','submitted_at','closed_at','sender_id','assigned_to','priority']; 
    protected $casts = ['correspondence_date'=>'date','submitted_at'=>'datetime','closed_at'=>'datetime']; 

    public function sender() { return $this->belongsTo(User::class, 'sender_id'); }
    public function assignee() { return $this->belongsTo(User::class, 'assigned_to'); }
}
