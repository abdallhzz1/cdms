<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasSafePagination;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use App\Models\CourseAssessmentComponent;
use App\Models\CourseLearningOutcome;
use App\Models\CourseProgramOutcomeMapping;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CourseController extends Controller
{
    use HasSafePagination;

    public function index(Request $request): JsonResponse {
        $perPage = $this->perPage($request, 100, 200);
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
            ->when($hasSemester && $request->filled('semester'), function ($q) use ($request) {
                $q->where('semester', $request->query('semester'));
            })
            ->when($request->query('status') === 'active', fn ($q) => $q->where('is_active', true))
            ->when($request->query('status') === 'inactive', fn ($q) => $q->where('is_active', false));

        $summaryQuery = clone $query;
        $summary = [
            'total' => (clone $summaryQuery)->count(),
            'total_hours' => (int) (clone $summaryQuery)->sum('credit_hours'),
            'active' => (clone $summaryQuery)->where('is_active', true)->count(),
            'inactive' => (clone $summaryQuery)->where('is_active', false)->count(),
            'by_level' => (clone $summaryQuery)->selectRaw('academic_level, COUNT(*) as courses_count, COALESCE(SUM(credit_hours), 0) as credit_hours')
                ->groupBy('academic_level')->get()->keyBy('academic_level'),
        ];

        $query->when($request->filled('academic_level'), function ($q) use ($request) {
            $q->where('academic_level', $request->query('academic_level'));
        });

        $query->orderBy('academic_level');

        if ($hasSemester) {
            $query->orderBy('semester');
        }

        $query->orderBy('code');

        $courses = $query->paginate($perPage);

        $data = $request->boolean('with_pagination') ? [
            'items' => $courses->items(),
            'pagination' => [
                'current_page' => $courses->currentPage(),
                'last_page' => $courses->lastPage(),
                'per_page' => $courses->perPage(),
                'total' => $courses->total(),
            ],
            'summary' => $summary,
        ] : $courses->items();

        return ApiResponse::success(
            $data,
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
            'code' => ['required', 'string', 'max:30', 'unique:courses,code'],
            'name_ar' => 'required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'required|integer|min:1',
            'academic_level' => 'required|string|in:fourth,fifth,sixth',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ];
        if ($hasSemester) {
            $rules['semester'] = 'required|integer|in:1,2';
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
            'code' => ['sometimes', 'required', 'string', 'max:30', Rule::unique('courses', 'code')->ignore($course->id)],
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
        $course->update(['is_active' => false]);
        return ApiResponse::success($course->fresh(), 'Course archived safely.');
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

        $this->validateAssessmentWeight($course, (float) ($validated['weight'] ?? 0));

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

        $this->validateAssessmentWeight($course, (float) ($validated['weight'] ?? $component->weight ?? 0), $component->id);

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
            'outcome_code' => ['required', 'string', 'max:50', Rule::unique('course_learning_outcomes', 'outcome_code')->where('course_id', $course->id)],
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
            'outcome_code' => ['sometimes', 'required', 'string', 'max:50', Rule::unique('course_learning_outcomes', 'outcome_code')->where('course_id', $course->id)->ignore($outcome->id)],
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
            'program_outcome_code' => ['required', 'string', 'max:50', Rule::exists('program_outcomes', 'code')->where('is_active', true)],
            'mapping_level' => ['nullable', Rule::in(['High', 'Medium', 'Low', 'Introduced', 'Reinforced', 'Mastered'])],
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
        $request->validate(['courses' => ['required', 'array', 'min:1', 'max:1000']]);

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
                $level = null;
                if (in_array($rawLevel, ['fourth', 'fifth', 'sixth'])) {
                    $level = $rawLevel;
                } elseif (!empty($rawLevel)) {
                    if (str_contains($rawLevel, '4') || str_contains($rawLevel, 'رابع') || str_contains($rawLevel, 'fourth')) $level = 'fourth';
                    elseif (str_contains($rawLevel, '5') || str_contains($rawLevel, 'خامس') || str_contains($rawLevel, 'fifth')) $level = 'fifth';
                    elseif (str_contains($rawLevel, '6') || str_contains($rawLevel, 'سادس') || str_contains($rawLevel, 'sixth')) $level = 'sixth';
                }
                if (!$level) {
                    $errors[] = "السطر " . ($index + 1) . ": السنة السريرية يجب أن تكون رابعة أو خامسة أو سادسة.";
                    continue;
                }

                $isActive = true;
                if (isset($row['is_active']) || isset($row['نشط'])) {
                    $val = strtolower(trim((string)($row['is_active'] ?? $row['نشط'])));
                    if (in_array($val, ['0', 'false', 'no', 'لا', 'غير نشط', 'inactive'])) {
                        $isActive = false;
                    }
                }

                $rawCredits = $row['credit_hours'] ?? $row['الساعات_المعتمدة'] ?? $row['الساعات'] ?? null;
                if (!is_numeric($rawCredits) || (int) $rawCredits < 1 || (int) $rawCredits > 30) {
                    $errors[] = "السطر " . ($index + 1) . ": الساعات المعتمدة يجب أن تكون بين 1 و30.";
                    continue;
                }
                $credits = (int) $rawCredits;
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
                \Log::warning('Course import row failed', [
                    'row' => $index + 1,
                    'exception' => $e,
                    'user_id' => auth()->id(),
                ]);
                $errors[] = "السطر " . ($index + 1) . ": تعذرت معالجة بيانات هذا السطر.";
            }
        }

        return ApiResponse::success([
            'imported' => $imported,
            'updated'  => $updated,
            'errors'   => $errors,
        ], "تمت معالجة " . ($imported + $updated) . " مساق بنجاح.");
    }

    private function validateAssessmentWeight(Course $course, float $weight, ?int $exceptComponentId = null): void
    {
        $existing = $course->assessmentComponents()
            ->when($exceptComponentId, fn ($query) => $query->where('id', '!=', $exceptComponentId))
            ->sum('weight');

        if ((float) $existing + $weight > 100.0001) {
            throw ValidationException::withMessages([
                'weight' => ['مجموع أوزان مكونات التقييم لا يمكن أن يتجاوز 100%.'],
            ]);
        }
    }
}
