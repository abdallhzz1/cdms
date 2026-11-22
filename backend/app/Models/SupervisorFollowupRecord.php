<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class SupervisorFollowupRecord extends Model
{
    use SoftDeletes;
    protected $guarded = [];
    protected $casts = ['supervisor_user_id' => 'integer', 'created_by' => 'integer', 'reviewed_by' => 'integer', 'visible_to_supervisor' => 'boolean', 'record_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'reviewed_at' => 'datetime'];
    public function files() { return $this->hasMany(SupervisorFollowupFile::class, 'record_id'); }
    public function supervisor() { return $this->belongsTo(User::class, 'supervisor_user_id'); }
    public function author() { return $this->belongsTo(User::class, 'created_by'); }
    public function reviewer() { return $this->belongsTo(User::class, 'reviewed_by'); }
    public function site() { return $this->belongsTo(TrainingSite::class, 'training_site_id'); }
}
