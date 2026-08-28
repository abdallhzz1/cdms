<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DepartmentHeadEvaluation extends Model
{
    protected $fillable = [
        'department_head_user_id', 'department_id', 'academic_year_id',
        'evaluation_purpose', 'status', 'domains', 'major_achievements',
        'development_areas', 'overall_score', 'overall_rating',
        'recommendation', 'recommendation_notes', 'evaluator_user_id',
        'evaluator_name', 'evaluator_role', 'evaluator_signed_at',
        'dean_user_id', 'dean_name', 'dean_role', 'dean_signed_at',
        'submitted_at', 'approved_at', 'activity_log',
    ];

    protected function casts(): array
    {
        return [
            'domains' => 'array',
            'major_achievements' => 'array',
            'development_areas' => 'array',
            'activity_log' => 'array',
            'overall_score' => 'decimal:1',
            'evaluator_signed_at' => 'datetime',
            'dean_signed_at' => 'datetime',
            'submitted_at' => 'datetime',
            'approved_at' => 'datetime',
        ];
    }

    /** @return BelongsTo<User, $this> */
    public function departmentHead(): BelongsTo { return $this->belongsTo(User::class, 'department_head_user_id'); }
    /** @return BelongsTo<Department, $this> */
    public function department(): BelongsTo { return $this->belongsTo(Department::class); }
    /** @return BelongsTo<AcademicYear, $this> */
    public function academicYear(): BelongsTo { return $this->belongsTo(AcademicYear::class); }
    /** @return BelongsTo<User, $this> */
    public function evaluator(): BelongsTo { return $this->belongsTo(User::class, 'evaluator_user_id'); }
    /** @return BelongsTo<User, $this> */
    public function dean(): BelongsTo { return $this->belongsTo(User::class, 'dean_user_id'); }
}
