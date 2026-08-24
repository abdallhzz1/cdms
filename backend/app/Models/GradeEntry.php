<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GradeEntry extends Model
{
    protected $fillable = [
        'student_course_enrollment_id', 'score', 'max_score', 'status',
        'clinical_score', 'osce_score', 'written_score', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'decimal:2',
            'max_score' => 'decimal:2',
            'clinical_score' => 'decimal:2',
            'osce_score' => 'decimal:2',
            'written_score' => 'decimal:2',
        ];
    }

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(StudentCourseEnrollment::class, 'student_course_enrollment_id');
    }
}
