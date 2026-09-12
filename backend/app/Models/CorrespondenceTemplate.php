<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorrespondenceTemplate extends Model
{
    protected $fillable = ['created_by', 'name', 'subject', 'body', 'message_type', 'priority'];

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
