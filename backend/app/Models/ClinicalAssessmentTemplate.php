<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalAssessmentTemplate extends Model
{
    protected $fillable = ['name_ar', 'name_en', 'course_id', 'version', 'total_score', 'is_active', 'created_by_user_id'];

    protected function casts(): array
    {
        return ['total_score' => 'decimal:2', 'is_active' => 'boolean'];
    }

    public function criteria() { return $this->hasMany(ClinicalAssessmentCriterion::class, 'template_id')->orderBy('sort_order')->orderBy('id'); }
    public function course() { return $this->belongsTo(Course::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by_user_id'); }

    public static function currentForCourse(?int $courseId): ?self
    {
        if ($courseId) {
            $courseTemplate = static::query()->where('course_id', $courseId)->where('is_active', true)->latest('version')->first();
            if ($courseTemplate) return $courseTemplate;
        }

        return static::query()->whereNull('course_id')->where('is_active', true)->latest('version')->first();
    }
}
