<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalUniversityAttendanceRecord extends Model
{
    protected $fillable = ['clinical_university_session_id', 'student_id', 'student_subgroup_id', 'status', 'excuse_note', 'recorded_by_user_id'];

    public function session() { return $this->belongsTo(ClinicalUniversitySession::class, 'clinical_university_session_id'); }
    public function student() { return $this->belongsTo(Student::class); }
    public function subgroup() { return $this->belongsTo(StudentSubgroup::class, 'student_subgroup_id'); }
    public function recorder() { return $this->belongsTo(User::class, 'recorded_by_user_id'); }
}
