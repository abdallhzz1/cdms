<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CorrespondenceAttachment extends Model
{
    protected $fillable = ['correspondence_id', 'uploaded_by', 'original_name', 'stored_path', 'mime_type', 'file_size'];
    protected $hidden = ['stored_path'];
    public function correspondence() { return $this->belongsTo(Correspondence::class); }
    public function uploader() { return $this->belongsTo(User::class, 'uploaded_by'); }
}
