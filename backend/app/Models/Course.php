<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Course extends Model
{
    use HasFactory;

    protected $fillable = ['code', 'name_ar', 'name_en', 'credit_hours', 'academic_level', 'course_type', 'semester', 'is_active', 'description'];
    protected static function booted(): void
    {
        static::created(function (Course $course): void {
            $course->assessmentComponents()->createMany([
                ['code' => 'clinical', 'name' => 'التقييم السريري', 'weight' => 20, 'max_score' => 20, 'evaluator' => 'clinical_supervisor', 'timing' => 'continuous', 'is_required_to_pass' => true],
                ['code' => 'osce', 'name' => 'امتحان OSCE', 'weight' => 40, 'max_score' => 40, 'evaluator' => 'department', 'timing' => 'final'],
                ['code' => 'written', 'name' => 'الامتحان النظري', 'weight' => 40, 'max_score' => 40, 'evaluator' => 'department', 'timing' => 'final'],
            ]);
        });
    }
    protected function casts(): array { return ['is_active' => 'boolean', 'credit_hours' => 'integer', 'semester' => 'integer']; }
    public function assessmentComponents(): HasMany { return $this->hasMany(CourseAssessmentComponent::class); }
    public function learningOutcomes(): HasMany { return $this->hasMany(CourseLearningOutcome::class); }
    public function programOutcomeMappings(): HasMany { return $this->hasMany(CourseProgramOutcomeMapping::class); }
    public function rotations(): HasMany { return $this->hasMany(Rotation::class); }
    public function reports(): HasMany { return $this->hasMany(CourseReport::class); }
}
