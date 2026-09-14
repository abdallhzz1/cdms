<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class MeetingRepositoryFile extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'meeting_repository_id', 'uploaded_by', 'original_name', 'stored_path',
        'mime_type', 'file_size',
    ];

    protected $hidden = ['stored_path'];

    public function repository()
    {
        return $this->belongsTo(MeetingRepository::class, 'meeting_repository_id');
    }

    public function uploader()
    {
        return $this->belongsTo(User::class, 'uploaded_by');
    }
}
