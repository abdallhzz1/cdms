<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceRecord extends Model
{
    public const STATUSES = ['present', 'absent', 'late', 'excused'];

    protected $fillable = ['clinical_session_id', 'student_id', 'clinical_qr_attendance_roster_id', 'status', 'excuse_note', 'check_in_at', 'check_out_at', 'recording_source', 'is_incomplete', 'recorded_by_user_id'];

    protected function casts(): array
    {
        return ['check_in_at' => 'datetime', 'check_out_at' => 'datetime', 'is_incomplete' => 'boolean'];
    }

    public function session()
    {
        return $this->belongsTo(ClinicalSession::class, 'clinical_session_id');
    }

    public function student()
    {
        return $this->belongsTo(Student::class);
    }

    public function recorder()
    {
        return $this->belongsTo(User::class, 'recorded_by_user_id');
    }
}
