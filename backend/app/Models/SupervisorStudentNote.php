<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SupervisorStudentNote extends Model
{
    protected $fillable = [
        'supervisor_person_id',
        'student_id',
        'student_clinical_assignment_id',
        'rotation_block_id',
        'training_site_id',
        'note_date',
        'note',
    ];

    protected $casts = ['note_date' => 'date'];

    public function student() { return $this->belongsTo(Student::class); }
    public function supervisor() { return $this->belongsTo(Person::class, 'supervisor_person_id'); }
    public function assignment() { return $this->belongsTo(StudentClinicalAssignment::class, 'student_clinical_assignment_id'); }
}
