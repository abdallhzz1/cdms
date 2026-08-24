<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StudentGroupRoster extends Model
{
    protected $fillable = ['group_registration_cycle_id', 'student_id', 'student_group_id'];
    public function cycle(): BelongsTo { return $this->belongsTo(GroupRegistrationCycle::class, 'group_registration_cycle_id'); }
    public function student(): BelongsTo { return $this->belongsTo(Student::class); }
    public function group(): BelongsTo { return $this->belongsTo(StudentGroup::class, 'student_group_id'); }
}
