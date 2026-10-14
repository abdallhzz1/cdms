<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalUniversityLecture extends Model
{
    protected $fillable = ['student_group_id', 'supervisor_person_id', 'title', 'weekday', 'starts_at', 'ends_at', 'starts_on', 'ends_on', 'is_active', 'created_by_user_id'];

    protected $casts = ['starts_on' => 'date', 'ends_on' => 'date', 'is_active' => 'boolean'];

    public function group() { return $this->belongsTo(StudentGroup::class, 'student_group_id'); }
    public function supervisor() { return $this->belongsTo(Person::class, 'supervisor_person_id'); }
    public function sessions() { return $this->hasMany(ClinicalUniversitySession::class); }

    public function scheduledDates(): array
    {
        $dates = [];
        for ($day = $this->starts_on->copy(); $day->lte($this->ends_on); $day->addDay()) {
            if (strtolower($day->format('l')) === $this->weekday) $dates[] = $day->toDateString();
        }
        return $dates;
    }
}
