<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OperationalTaskAttachment extends Model
{
    protected $fillable = ['operational_task_id', 'uploaded_by', 'original_name', 'stored_path', 'mime_type', 'file_size'];
    protected $hidden = ['stored_path'];
    protected $casts = ['operational_task_id' => 'integer', 'uploaded_by' => 'integer', 'file_size' => 'integer'];

    public function task() { return $this->belongsTo(OperationalTask::class, 'operational_task_id'); }
    public function uploader() { return $this->belongsTo(User::class, 'uploaded_by'); }
}
