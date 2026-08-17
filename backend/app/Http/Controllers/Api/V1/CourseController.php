<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreCourseRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CourseController extends Controller
{
    public function index(Request $request): JsonResponse {
        $courses = Course::query()->when($request->filled('search'), fn ($q) => $q->where(fn ($s) => $s->where('code','like','%'.$request->query('search').'%')->orWhere('name_ar','like','%'.$request->query('search').'%')->orWhere('name_en','like','%'.$request->query('search').'%')))->orderBy('code')->paginate($request->integer('per_page', 25));
        return ApiResponse::success($courses->items(), null, ['current_page'=>$courses->currentPage(),'last_page'=>$courses->lastPage(),'total'=>$courses->total()]);
    }
    public function store(StoreCourseRequest $request): JsonResponse { return ApiResponse::success(Course::create($request->validated()), 'Course created.', [], 201); }
    public function show(Course $course): JsonResponse { return ApiResponse::success($course->load(['assessmentComponents','learningOutcomes','programOutcomeMappings'])); }
}
