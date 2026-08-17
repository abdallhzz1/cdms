<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Course extends Model
{
    protected $fillable = ['code', 'name_ar', 'name_en', 'credit_hours', 'academic_level', 'is_active', 'description'];
    protected function casts(): array { return ['is_active' => 'boolean']; }
    public function assessmentComponents(): HasMany { return $this->hasMany(CourseAssessmentComponent::class); }
    public function learningOutcomes(): HasMany { return $this->hasMany(CourseLearningOutcome::class); }
    public function programOutcomeMappings(): HasMany { return $this->hasMany(CourseProgramOutcomeMapping::class); }
}
