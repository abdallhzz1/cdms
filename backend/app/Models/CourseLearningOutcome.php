<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class CourseLearningOutcome extends Model { protected $fillable=['course_id','outcome_code','text_en','text_ar','domain','program_outcome','teaching_method','assessment_method']; }
