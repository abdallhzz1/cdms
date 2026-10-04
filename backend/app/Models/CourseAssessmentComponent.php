<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class CourseAssessmentComponent extends Model { protected $fillable=['course_id','code','name','weight','max_score','entry_max_score','assessment_frequency','mini_osce_max_score','osce_entry_mode','evaluator','timing','is_required_to_pass','notes']; }
