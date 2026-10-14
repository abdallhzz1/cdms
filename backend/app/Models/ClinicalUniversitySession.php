<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalUniversitySession extends Model
{
    protected $fillable = ['clinical_university_lecture_id', 'session_date', 'supervisor_person_id', 'recorded_by_user_id'];

    protected $casts = ['session_date' => 'date'];

    public function lecture() { return $this->belongsTo(ClinicalUniversityLecture::class, 'clinical_university_lecture_id'); }
    public function records() { return $this->hasMany(ClinicalUniversityAttendanceRecord::class); }
    public function supervisor() { return $this->belongsTo(Person::class, 'supervisor_person_id'); }
}
