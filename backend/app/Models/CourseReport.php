<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CourseReport extends Model
{
    protected $fillable = [
        'course_id', 'academic_year_id', 'prepared_by', 'approved_by', 'status',
        'summary', 'achievements', 'challenges', 'improvement_plan', 'review_notes',
        'submitted_at', 'approved_at',
    ];

    protected function casts(): array
    {
        return ['submitted_at' => 'datetime', 'approved_at' => 'datetime'];
    }

    public function course(): BelongsTo { return $this->belongsTo(Course::class); }
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
    public function preparer(): BelongsTo { return $this->belongsTo(User::class, 'prepared_by'); }
    public function approver(): BelongsTo { return $this->belongsTo(User::class, 'approved_by'); }
}
