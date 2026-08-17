<?php
namespace App\Models;
use Illuminate\Database\Eloquent\Model;
class StudentCourseEnrollment extends Model { protected $fillable=['student_id','course_id','academic_year_id','semester','status']; public function student(){return $this->belongsTo(Student::class);} public function course(){return $this->belongsTo(Course::class);} public function academicYear(){return $this->belongsTo(AcademicYear::class);} }
