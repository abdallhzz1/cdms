<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OperationalTaskComment extends Model
{
    protected $fillable = ['operational_task_id', 'user_id', 'body'];

    protected $casts = ['operational_task_id' => 'integer', 'user_id' => 'integer'];

    public function task() { return $this->belongsTo(OperationalTask::class, 'operational_task_id'); }
    public function user() { return $this->belongsTo(User::class); }
}
