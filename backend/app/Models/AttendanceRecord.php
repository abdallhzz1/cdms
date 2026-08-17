<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    public const STATUSES = ['present', 'absent', 'late', 'excused'];

    protected $fillable = ['clinical_session_id', 'student_id', 'status', 'excuse_note'];

    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'clinical_session_id');
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }
}
