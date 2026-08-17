<?php
namespace App\Models; use Illuminate\Database\Eloquent\Model; class CourseAssessmentComponent extends Model { protected $fillable=['course_id','name','weight','max_score','evaluator','timing','is_required_to_pass','notes']; }
