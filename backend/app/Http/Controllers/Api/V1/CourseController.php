<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class CourseController extends Controller
{
    public function index(Request $request): JsonResponse {
        $perPage = $request->integer('per_page', 100);
        $query = Course::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $search = $request->query('search');
                $q->where(function ($s) use ($search) {
                    $s->where('code', 'like', "%{$search}%")
                      ->orWhere('name_ar', 'like', "%{$search}%")
                      ->orWhere('name_en', 'like', "%{$search}%");
                });
            })
            ->when($request->filled('academic_level'), function ($q) use ($request) {
                $q->where('academic_level', $request->query('academic_level'));
            })
            ->when($request->filled('semester'), function ($q) use ($request) {
                $q->where('semester', $request->query('semester'));
            })
            ->orderBy('academic_level')
            ->orderBy('semester')
            ->orderBy('code');

        $courses = $query->paginate($perPage);

        return ApiResponse::success(
            $courses->items(),
            null,
            [
                'current_page' => $courses->currentPage(),
                'last_page' => $courses->lastPage(),
                'total' => $courses->total()
            ]
        );
    }

    public function store(Request $request): JsonResponse {
        $validated = $request->validate([
            'code' => 'required|string|max:50',
            'name_ar' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'required|integer|min:1',
            'academic_level' => 'required|string|in:fourth,fifth,sixth',
            'semester' => 'required|integer|in:1,2',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ]);

        $course = Course::create($validated);
        return ApiResponse::success($course, 'Course created.', [], 201);
    }

    public function show(Course $course): JsonResponse {
        return ApiResponse::success($course->load(['assessmentComponents', 'learningOutcomes', 'programOutcomeMappings']));
    }

    public function update(Request $request, Course $course): JsonResponse {
        $validated = $request->validate([
            'code' => 'sometimes|required|string|max:50',
            'name_ar' => 'sometimes|required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'sometimes|required|integer|min:1',
            'academic_level' => 'sometimes|required|string|in:fourth,fifth,sixth',
            'semester' => 'sometimes|required|integer|in:1,2',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ]);

        $course->update($validated);
        return ApiResponse::success($course, 'Course updated successfully.');
    }

    public function destroy(Course $course): JsonResponse {
        $course->delete();
        return ApiResponse::success(null, 'Course deleted successfully.');
    }
}
