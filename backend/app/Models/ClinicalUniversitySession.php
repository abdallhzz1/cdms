<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalUniversitySession extends Model
{
    protected $fillable = ['clinical_university_lecture_id', 'session_date', 'supervisor_person_id', 'recorded_by_user_id', 'qr_public_id', 'qr_state', 'qr_opened_at', 'qr_closed_at', 'approved_at', 'approved_by_user_id'];

    protected $casts = ['session_date' => 'date', 'qr_opened_at' => 'datetime', 'qr_closed_at' => 'datetime', 'approved_at' => 'datetime'];

    public function isApproved(): bool
    {
        // Previously saved manual and closed QR registers are historical final
        // registers too. Their actual approval actor/time was not recorded.
        return $this->exists && ($this->approved_at !== null || $this->qr_state !== 'open');
    }

    public function lecture()
    {
        return $this->belongsTo(ClinicalUniversityLecture::class, 'clinical_university_lecture_id');
    }

    public function records()
    {
        return $this->hasMany(ClinicalUniversityAttendanceRecord::class);
    }

    public function supervisor()
    {
        return $this->belongsTo(Person::class, 'supervisor_person_id');
    }
}
