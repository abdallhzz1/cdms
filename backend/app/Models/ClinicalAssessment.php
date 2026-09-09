<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalAssessment extends Model
{
    protected $fillable = ['student_id', 'clinical_session_id', 'evaluator_person_id', 'assessment_template_id', 'student_clinical_assignment_id', 'evaluation_week', 'week_start', 'week_end', 'assessment_batch_uuid', 'score', 'max_score', 'criteria_scores', 'status', 'notes', 'submitted_at'];

    protected $casts = ['score' => 'decimal:2', 'max_score' => 'decimal:2', 'criteria_scores' => 'array', 'week_start' => 'date', 'week_end' => 'date', 'submitted_at' => 'datetime'];

    public function student() { return $this->belongsTo(Student::class); }
    public function session() { return $this->belongsTo(ClinicalSession::class, 'clinical_session_id'); }
    public function evaluator() { return $this->belongsTo(Person::class, 'evaluator_person_id'); }
    public function template() { return $this->belongsTo(ClinicalAssessmentTemplate::class, 'assessment_template_id'); }
    public function clinicalAssignment() { return $this->belongsTo(StudentClinicalAssignment::class, 'student_clinical_assignment_id'); }
    public function workflowTransitions()
    {
        return $this->hasMany(WorkflowTransitionLog::class, 'entity_id')
            ->where('entity_type', self::class)
            ->latest('id');
    }
}
