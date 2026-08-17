<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class GradeEntry extends Model { protected $fillable=['student_course_enrollment_id','score','max_score','status','notes']; public function enrollment(){return $this->belongsTo(StudentCourseEnrollment::class,'student_course_enrollment_id');} }
