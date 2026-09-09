<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ClinicalAssessmentCriterion extends Model
{
    protected $fillable = ['template_id', 'code', 'name_ar', 'name_en', 'max_score', 'sort_order'];
    protected function casts(): array { return ['max_score' => 'decimal:2']; }
    public function template() { return $this->belongsTo(ClinicalAssessmentTemplate::class, 'template_id'); }
}
