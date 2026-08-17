<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalSession extends Model
{
    protected $fillable = ['rotation_block_id', 'training_site_id', 'session_date', 'title'];

    protected $casts = ['session_date' => 'date'];

    public function trainingSite()
    {
        return $this->belongsTo(TrainingSite::class);
    }

    public function attendanceRecords()
    {
        return $this->hasMany(AttendanceRecord::class);
    }
}
