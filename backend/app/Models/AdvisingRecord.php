<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class AdvisingRecord extends Model
{
    protected $fillable = ['student_id', 'advisor_person_id', 'meeting_date', 'category', 'notes', 'action_plan', 'status', 'meeting_number', 'semester', 'academic_year', 'attendance_count', 'absence_count', 'follow_up_status', 'attachment_path', 'signed_at'];
    protected $casts = ['meeting_date' => 'date'];
    public function student() { return $this->belongsTo(Student::class); }
    public function advisor() { return $this->belongsTo(Person::class, 'advisor_person_id'); }
    public function participants(): HasMany { return $this->hasMany(AdvisingParticipant::class); }
}
