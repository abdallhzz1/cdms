<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class GradeEntry extends Model
{
    protected $fillable = [
        'student_course_enrollment_id', 'score', 'max_score', 'status',
        'clinical_score', 'osce_score', 'written_score', 'notes',
        'prepared_by_user_id', 'submitted_at', 'approved_by_user_id', 'approved_at', 'return_reason',
    ];

    protected function casts(): array
    {
        return [
            'score' => 'decimal:2',
            'max_score' => 'decimal:2',
            'clinical_score' => 'decimal:2',
            'mini_osce_score' => 'decimal:2',
            'osce_score' => 'decimal:2',
            'osce_committee_snapshot' => 'array',
            'written_score' => 'decimal:2',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (self $grade) {
            $enrollment = $grade->enrollment;
            if (! $enrollment) return;
            $component = CourseAssessmentComponent::where('course_id', $enrollment->course_id)->where('code', 'clinical')->first();
            if ($component?->mini_osce_mode !== 'direct' || (float) $component->mini_osce_max_score <= 0) return;
            $official = app(\App\Services\CourseMiniOsce::class)->directScore(
                $enrollment->student_id, $enrollment->course_id, $enrollment->academic_year_id
            );
            if (in_array($grade->getOriginal('status'), ['submitted', 'approved', 'published', 'locked'], true) && ! in_array($grade->status, ['returned', 'draft'], true)) {
                if ($official === null || $grade->mini_osce_score === null || abs($official - (float) $grade->mini_osce_score) > 0.005) {
                    throw \Illuminate\Validation\ValidationException::withMessages(['grades' => ['علامة الميني أوسكي ناقصة أو تغيّرت؛ راجع الكشف قبل الاعتماد.']]);
                }
            } else {
                $grade->mini_osce_score = $official;
            }
            if ($grade->status === 'submitted' && $official === null) {
                throw \Illuminate\Validation\ValidationException::withMessages(['grades' => ['علامة الميني أوسكي ناقصة؛ يجب إدخالها قبل إرسال الكشف.']]);
            }
            $grade->score = $official === null || $grade->clinical_score === null || $grade->osce_score === null || $grade->written_score === null
                ? null : round((float) $grade->clinical_score + (float) $grade->osce_score + (float) $grade->written_score + $official, 2);
        });
    }

    public function enrollment(): BelongsTo
    {
        return $this->belongsTo(StudentCourseEnrollment::class, 'student_course_enrollment_id');
    }

    public function osceRecorder(): BelongsTo
    {
        return $this->belongsTo(User::class, 'osce_recorded_by_user_id');
    }
}
