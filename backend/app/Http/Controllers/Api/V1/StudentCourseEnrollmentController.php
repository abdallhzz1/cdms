<?php
namespace App\Http\Controllers\Api\V1;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\StudentCourseEnrollment;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
class StudentCourseEnrollmentController extends Controller {
 public function index(Request $request): JsonResponse { 
     $query = StudentCourseEnrollment::with(['student:id,university_number,full_name_ar,full_name_en','course:id,code,name_ar,name_en','academicYear:id,code,name']);
     
     if ($request->query('student_id')) {
         $query->where('student_id', $request->query('student_id'));
     }
     if ($request->query('course_id')) {
         $query->where('course_id', $request->query('course_id'));
     }
     if ($request->query('semester')) {
         $query->where('semester', $request->query('semester'));
     }
     if ($request->query('include_grades')) {
         $query->with('gradeEntry');
     }

     $items = $query->orderByDesc('id')->paginate($request->integer('per_page',25)); 
     return ApiResponse::success($items->items(),null,['current_page'=>$items->currentPage(),'last_page'=>$items->lastPage(),'total'=>$items->total()]); 
 }
 public function store(Request $request): JsonResponse { $data=$request->validate(['student_id'=>['required','exists:students,id'],'course_id'=>['required','exists:courses,id'],'academic_year_id'=>['required','exists:academic_years,id'],'semester'=>['required','string','max:20'],'status'=>['nullable','in:enrolled,dropped,completed']]); $item=StudentCourseEnrollment::firstOrCreate(['student_id'=>$data['student_id'],'course_id'=>$data['course_id'],'academic_year_id'=>$data['academic_year_id'],'semester'=>$data['semester']],['status'=>$data['status']??'enrolled']); return ApiResponse::success($item,'Enrollment saved.',[],201); }
}
