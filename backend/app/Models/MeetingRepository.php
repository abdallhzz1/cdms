<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MeetingRepository extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'title', 'description', 'share_token', 'share_token_hash', 'is_active',
        'allow_download', 'expires_at', 'last_accessed_at', 'access_count', 'created_by',
    ];

    protected $hidden = ['share_token', 'share_token_hash'];

    protected $casts = [
        'share_token' => 'encrypted',
        'is_active' => 'boolean',
        'allow_download' => 'boolean',
        'expires_at' => 'datetime',
        'last_accessed_at' => 'datetime',
    ];

    public function meetings()
    {
        return $this->belongsToMany(Meeting::class, 'meeting_repository_meeting')->withTimestamps();
    }

    public function files()
    {
        return $this->hasMany(MeetingRepositoryFile::class);
    }

    public function creator()
    {
        return $this->belongsTo(User::class, 'created_by');
    }
}
