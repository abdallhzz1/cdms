<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorrespondenceParticipant extends Model
{
    protected $fillable = ['correspondence_id', 'user_id', 'participant_role'];
    public function correspondence() { return $this->belongsTo(Correspondence::class); }
    public function user() { return $this->belongsTo(User::class); }
}
