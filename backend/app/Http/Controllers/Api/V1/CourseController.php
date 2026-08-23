<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use App\Models\CourseAssessmentComponent;
use App\Models\CourseLearningOutcome;
use App\Models\CourseProgramOutcomeMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;

class CourseController extends Controller
{
    public function index(Request $request): JsonResponse {
        $perPage = $request->integer('per_page', 100);
        $hasSemester = Schema::hasColumn('courses', 'semester');

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
            ->when($hasSemester && $request->filled('semester'), function ($q) use ($request) {
                $q->where('semester', $request->query('semester'));
            })
            ->orderBy('academic_level');

        if ($hasSemester) {
            $query->orderBy('semester');
        }

        $query->orderBy('code');

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
        $hasSemester = Schema::hasColumn('courses', 'semester');
        $rules = [
            'code' => 'required|string|max:50',
            'name_ar' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'required|integer|min:1',
            'academic_level' => 'required|string|in:fourth,fifth,sixth',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ];
        if ($hasSemester) {
            $rules['semester'] = 'sometimes|integer|in:1,2';
        }

        $validated = $request->validate($rules);
        $course = Course::create($validated);
        return ApiResponse::success($course, 'Course created.', [], 201);
    }

    public function show(Course $course): JsonResponse {
        return ApiResponse::success(
            $course->load(['assessmentComponents', 'learningOutcomes', 'programOutcomeMappings'])
        );
    }

    public function update(Request $request, Course $course): JsonResponse {
        $hasSemester = Schema::hasColumn('courses', 'semester');
        $rules = [
            'code' => 'sometimes|required|string|max:50',
            'name_ar' => 'sometimes|required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'sometimes|required|integer|min:1',
            'academic_level' => 'sometimes|required|string|in:fourth,fifth,sixth',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ];
        if ($hasSemester) {
            $rules['semester'] = 'sometimes|integer|in:1,2';
        }

        $validated = $request->validate($rules);
        $course->update($validated);
        return ApiResponse::success($course, 'Course updated successfully.');
    }

    public function destroy(Course $course): JsonResponse {
        $course->delete();
        return ApiResponse::success(null, 'Course deleted successfully.');
    }

    /**
     * Assessment Components Sub-Resource API
     */
    public function addAssessmentComponent(Request $request, Course $course): JsonResponse {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:100',
            'max_score' => 'nullable|numeric|min:0',
            'evaluator' => 'nullable|string|max:255',
            'timing' => 'nullable|string|max:255',
            'is_required_to_pass' => 'boolean',
            'notes' => 'nullable|string',
        ]);

        $component = $course->assessmentComponents()->create($validated);
        return ApiResponse::success($component, 'Assessment component added.', [], 201);
    }

    public function updateAssessmentComponent(Request $request, Course $course, int $componentId): JsonResponse {
        $component = $course->assessmentComponents()->findOrFail($componentId);
        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'weight' => 'nullable|numeric|min:0|max:100',
            'max_score' => 'nullable|numeric|min:0',
            'evaluator' => 'nullable|string|max:255',
            'timing' => 'nullable|string|max:255',
            'is_required_to_pass' => 'boolean',
            'notes' => 'nullable|string',
        ]);

        $component->update($validated);
        return ApiResponse::success($component, 'Assessment component updated.');
    }

    public function deleteAssessmentComponent(Course $course, int $componentId): JsonResponse {
        $component = $course->assessmentComponents()->findOrFail($componentId);
        $component->delete();
        return ApiResponse::success(null, 'Assessment component deleted.');
    }

    /**
     * Learning Outcomes (ILOs) Sub-Resource API
     */
    public function addLearningOutcome(Request $request, Course $course): JsonResponse {
        $validated = $request->validate([
            'outcome_code' => 'required|string|max:50',
            'text_ar' => 'nullable|string',
            'text_en' => 'nullable|string',
            'domain' => 'nullable|string|max:100',
            'program_outcome' => 'nullable|string|max:100',
            'teaching_method' => 'nullable|string|max:255',
            'assessment_method' => 'nullable|string|max:255',
        ]);

        $outcome = $course->learningOutcomes()->create($validated);
        return ApiResponse::success($outcome, 'Learning outcome added.', [], 201);
    }

    public function updateLearningOutcome(Request $request, Course $course, int $outcomeId): JsonResponse {
        $outcome = $course->learningOutcomes()->findOrFail($outcomeId);
        $validated = $request->validate([
            'outcome_code' => 'sometimes|required|string|max:50',
            'text_ar' => 'nullable|string',
            'text_en' => 'nullable|string',
            'domain' => 'nullable|string|max:100',
            'program_outcome' => 'nullable|string|max:100',
            'teaching_method' => 'nullable|string|max:255',
            'assessment_method' => 'nullable|string|max:255',
        ]);

        $outcome->update($validated);
        return ApiResponse::success($outcome, 'Learning outcome updated.');
    }

    public function deleteLearningOutcome(Course $course, int $outcomeId): JsonResponse {
        $outcome = $course->learningOutcomes()->findOrFail($outcomeId);
        $outcome->delete();
        return ApiResponse::success(null, 'Learning outcome deleted.');
    }

    /**
     * Program Outcome Mappings (PLOs) Sub-Resource API
     */
    public function addProgramOutcomeMapping(Request $request, Course $course): JsonResponse {
        $validated = $request->validate([
            'program_outcome_code' => 'required|string|max:50',
            'mapping_level' => 'nullable|string|max:50',
        ]);

        $mapping = $course->programOutcomeMappings()->updateOrCreate(
            ['program_outcome_code' => $validated['program_outcome_code']],
            ['mapping_level' => $validated['mapping_level'] ?? 'Medium']
        );
        return ApiResponse::success($mapping, 'Program outcome mapping saved.', [], 201);
    }

    public function deleteProgramOutcomeMapping(Course $course, int $mappingId): JsonResponse {
        $mapping = $course->programOutcomeMappings()->findOrFail($mappingId);
        $mapping->delete();
        return ApiResponse::success(null, 'Program outcome mapping deleted.');
    }

    /**
     * POST /api/v1/courses/bulk-import
     * Permission: courses.manage
     */
    public function bulkImport(Request $request): JsonResponse
    {
        $request->validate([
            'courses' => ['required', 'array', 'min:1'],
        ]);

        $hasSemester = Schema::hasColumn('courses', 'semester');
        $imported = 0;
        $updated = 0;
        $errors = [];

        foreach ($request->input('courses') as $index => $row) {
            try {
                $code = trim((string)($row['code'] ?? $row['رمز_المساق'] ?? $row['رمز المساق'] ?? $row['رمز'] ?? ''));
                $nameAr = trim((string)($row['name_ar'] ?? $row['اسم_المساق_بالعربية'] ?? $row['اسم المساق بالعربي'] ?? $row['اسم_المساق'] ?? $row['اسم المساق'] ?? $row['اسم'] ?? ''));
                $nameEn = trim((string)($row['name_en'] ?? $row['اسم_المساق_بالانجليزية'] ?? $row['اسم المساق بالانجليزي'] ?? ''));

                if (empty($code) || empty($nameAr)) {
                    $errors[] = "السطر " . ($index + 1) . ": رمز المساق والاسم بالعربي مطلوبان.";
                    continue;
                }

                $rawLevel = strtolower(trim((string)($row['academic_level'] ?? $row['المستوى_الأكاديمي'] ?? $row['المستوى'] ?? $row['السنة_السريرية'] ?? $row['السنة'] ?? '')));
                $level = 'fourth';
                if (in_array($rawLevel, ['fourth', 'fifth', 'sixth'])) {
                    $level = $rawLevel;
                } elseif (!empty($rawLevel)) {
                    if (str_contains($rawLevel, '4') || str_contains($rawLevel, 'رابع') || str_contains($rawLevel, 'fourth')) $level = 'fourth';
                    elseif (str_contains($rawLevel, '5') || str_contains($rawLevel, 'خامس') || str_contains($rawLevel, 'fifth')) $level = 'fifth';
                    elseif (str_contains($rawLevel, '6') || str_contains($rawLevel, 'سادس') || str_contains($rawLevel, 'sixth')) $level = 'sixth';
                }

                $isActive = true;
                if (isset($row['is_active']) || isset($row['نشط'])) {
                    $val = strtolower(trim((string)($row['is_active'] ?? $row['نشط'])));
                    if (in_array($val, ['0', 'false', 'no', 'لا', 'غير نشط', 'inactive'])) {
                        $isActive = false;
                    }
                }

                $credits = max(1, min(30, (int)($row['credit_hours'] ?? $row['الساعات_المعتمدة'] ?? $row['الساعات'] ?? 4)));
                $description = !empty($row['description']) ? trim((string)$row['description']) : (!empty($row['الوصف']) ? trim((string)$row['الوصف']) : null);

                $data = [
                    'name_ar'        => $nameAr,
                    'name_en'        => !empty($nameEn) ? $nameEn : null,
                    'credit_hours'   => $credits,
                    'academic_level' => $level,
                    'is_active'      => $isActive,
                    'description'    => $description,
                ];

                if ($hasSemester) {
                    $rawSem = trim((string)($row['semester'] ?? $row['الفصل'] ?? $row['الفصل_الدراسي'] ?? '1'));
                    $semester = 1;
                    if (str_contains($rawSem, '2') || str_contains($rawSem, 'ثاني') || str_contains($rawSem, 'second')) {
                        $semester = 2;
                    }
                    $data['semester'] = $semester;
                }

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
