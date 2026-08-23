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

    /**
     * POST /api/v1/courses/bulk-import
     * Permission: courses.manage
     */
    public function bulkImport(Request $request): JsonResponse
    {
        $request->validate([
            'courses' => ['required', 'array', 'min:1'],
            'courses.*.code' => ['required', 'string'],
            'courses.*.name_ar' => ['required', 'string'],
        ]);

        $imported = 0;
        $updated = 0;
        $errors = [];

        foreach ($request->input('courses') as $index => $row) {
            try {
                $code = trim((string)($row['code'] ?? ''));
                $nameAr = trim((string)($row['name_ar'] ?? ''));
                if (empty($code) || empty($nameAr)) {
                    $errors[] = "السطر " . ($index + 1) . ": رمز المساق والاسم بالعربي مطلوبان.";
                    continue;
                }

                $rawLevel = strtolower(trim((string)($row['academic_level'] ?? '')));
                $level = 'fourth';
                if (in_array($rawLevel, ['fourth', 'fifth', 'sixth'])) {
                    $level = $rawLevel;
                } elseif (!empty($rawLevel)) {
                    if (str_contains($rawLevel, '4') || str_contains($rawLevel, 'رابع') || str_contains($rawLevel, 'fourth')) $level = 'fourth';
                    elseif (str_contains($rawLevel, '5') || str_contains($rawLevel, 'خامس') || str_contains($rawLevel, 'fifth')) $level = 'fifth';
                    elseif (str_contains($rawLevel, '6') || str_contains($rawLevel, 'سادس') || str_contains($rawLevel, 'sixth')) $level = 'sixth';
                }

                $isActive = true;
                if (isset($row['is_active'])) {
                    $val = strtolower(trim((string)$row['is_active']));
                    if (in_array($val, ['0', 'false', 'no', 'لا', 'غير نشط', 'inactive'])) {
                        $isActive = false;
                    }
                }

                $credits = max(1, min(30, (int)($row['credit_hours'] ?? 1)));
                $semester = isset($row['semester']) ? max(1, min(2, (int)$row['semester'])) : 1;

                $data = [
                    'name_ar'        => $nameAr,
                    'name_en'        => !empty($row['name_en']) ? trim((string)$row['name_en']) : null,
                    'credit_hours'   => $credits,
                    'academic_level' => $level,
                    'semester'       => $semester,
                    'is_active'      => $isActive,
                    'description'    => !empty($row['description']) ? trim((string)$row['description']) : null,
                ];

                $course = Course::where('code', $code)->first();
                if ($course) {
                    $course->update($data);
                    $updated++;
                } else {
                    $data['code'] = $code;
                    Course::create($data);
                    $imported++;
                }
            } catch (\Throwable $e) {
                $errors[] = "السطر " . ($index + 1) . ": " . $e->getMessage();
            }
        }

        return ApiResponse::success([
            'imported' => $imported,
            'updated'  => $updated,
            'errors'   => $errors,
        ], "تمت معالجة " . ($imported + $updated) . " مساق بنجاح.");
    }
}
