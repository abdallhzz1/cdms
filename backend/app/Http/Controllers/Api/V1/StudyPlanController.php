<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\StudyPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudyPlanController extends Controller
{
    public function index(Request $request): JsonResponse { $plans = StudyPlan::with('courses')->orderBy('code')->paginate($request->integer('per_page', 25)); return ApiResponse::success($plans->items(), null, ['current_page'=>$plans->currentPage(),'last_page'=>$plans->lastPage(),'total'=>$plans->total()]); }
    public function show(StudyPlan $studyPlan): JsonResponse { return ApiResponse::success($studyPlan->load('courses')); }

    public function store(Request $request): JsonResponse {
        $data = $request->validate([
            'code' => 'required|string|unique:study_plans',
            'name_ar' => 'required|string',
            'name_en' => 'nullable|string',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);
        $plan = StudyPlan::create($data);
        return ApiResponse::success($plan, 'Study plan created successfully.');
    }

    public function update(Request $request, StudyPlan $studyPlan): JsonResponse {
        $data = $request->validate([
            'code' => 'required|string|unique:study_plans,code,' . $studyPlan->id,
            'name_ar' => 'required|string',
            'name_en' => 'nullable|string',
            'description' => 'nullable|string',
            'is_active' => 'boolean',
        ]);
        $studyPlan->update($data);
        return ApiResponse::success($studyPlan, 'Study plan updated successfully.');
    }

    public function destroy(StudyPlan $studyPlan): JsonResponse {
        $studyPlan->delete();
        return ApiResponse::success(null, 'Study plan deleted successfully.');
    }

    public function addCourse(Request $request, StudyPlan $studyPlan): JsonResponse {
        $data = $request->validate([
            'course_id' => 'required|exists:courses,id',
            'sequence' => 'required|integer|min:1',
            'is_required' => 'boolean',
            'academic_level' => 'nullable|string',
        ]);
        $studyPlan->courses()->syncWithoutDetaching([
            $data['course_id'] => [
                'sequence' => $data['sequence'],
                'is_required' => $data['is_required'] ?? true,
                'academic_level' => $data['academic_level'],
            ]
        ]);
        return ApiResponse::success(null, 'Course added to study plan.');
    }

    public function removeCourse(StudyPlan $studyPlan, $courseId): JsonResponse {
        $studyPlan->courses()->detach($courseId);
        return ApiResponse::success(null, 'Course removed from study plan.');
    }
}
