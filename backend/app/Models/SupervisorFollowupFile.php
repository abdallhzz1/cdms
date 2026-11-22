<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class SupervisorFollowupFile extends Model
{
    protected $guarded = [];
    protected $hidden = ['storage_path'];
    public function record() { return $this->belongsTo(SupervisorFollowupRecord::class, 'record_id'); }
}
