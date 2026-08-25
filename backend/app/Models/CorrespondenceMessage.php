<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorrespondenceMessage extends Model
{
    protected $fillable = ['correspondence_id', 'sender_id', 'recipient_id', 'body', 'read_at'];
    protected $casts = ['read_at' => 'datetime'];

    public function correspondence()
    {
        return $this->belongsTo(Correspondence::class);
    }

    public function sender()
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function recipient()
    {
        return $this->belongsTo(User::class, 'recipient_id');
    }
}
