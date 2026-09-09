<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalAssessmentTemplate extends Model
{
    protected $fillable = ['name_ar', 'name_en', 'course_id', 'batch_year', 'version', 'total_score', 'is_active', 'created_by_user_id'];

    protected function casts(): array
    {
        return ['batch_year' => 'integer', 'total_score' => 'decimal:2', 'is_active' => 'boolean'];
    }

    public function criteria() { return $this->hasMany(ClinicalAssessmentCriterion::class, 'template_id')->orderBy('sort_order')->orderBy('id'); }
    public function course() { return $this->belongsTo(Course::class); }
    public function creator() { return $this->belongsTo(User::class, 'created_by_user_id'); }

    public static function currentForCourse(?int $courseId, ?int $batchYear = null): ?self
    {
        $scopes = array_unique([
            json_encode([$courseId, $batchYear]), json_encode([$courseId, null]),
            json_encode([null, $batchYear]), json_encode([null, null]),
        ]);
        foreach ($scopes as $encodedScope) {
            [$course, $batch] = json_decode($encodedScope, true);
            $query = static::query()->where('is_active', true);
            $course === null ? $query->whereNull('course_id') : $query->where('course_id', $course);
            $batch === null ? $query->whereNull('batch_year') : $query->where('batch_year', $batch);
            if ($template = $query->latest('version')->first()) return $template;
        }
        return null;
    }
}
