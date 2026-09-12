<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorrespondenceParticipant extends Model
{
    protected $fillable = ['correspondence_id', 'user_id', 'participant_role', 'read_at', 'archived_at', 'starred_at', 'deleted_at'];

    protected $casts = ['read_at' => 'datetime', 'archived_at' => 'datetime', 'starred_at' => 'datetime', 'deleted_at' => 'datetime'];

    public function correspondence()
    {
        return $this->belongsTo(Correspondence::class);
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }
}
