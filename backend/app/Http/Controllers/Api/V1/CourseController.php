<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Controllers\Concerns\HasSafePagination;
use App\Http\Responses\ApiResponse;
use App\Models\Course;
use App\Models\CourseAssessmentComponent;
use App\Models\CourseLearningOutcome;
use App\Models\CourseProgramOutcomeMapping;
use App\Models\Department;
use App\Models\AuditLog;
use App\Models\GradeEntry;
use App\Services\DepartmentHeadCourseScope;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

class CourseController extends Controller
{
    use HasSafePagination;
    use ScopesByDepartmentAndLevel;

    public function departmentOptions(): JsonResponse
    {
        $ids = app(DepartmentHeadCourseScope::class)->departmentIds();
        return ApiResponse::success([
            'departments' => Department::query()->when($ids !== null, fn ($query) => $query->whereIn('id', $ids))
                ->orderBy('name_ar')->get(['id', 'code', 'name_ar', 'name_en', 'is_active']),
            'can_assign_departments' => $ids === null,
            'department_scoped' => $ids !== null,
            'academic_levels' => $this->applyCourseAccessScope(Course::query())->distinct()->orderBy('academic_level')->pluck('academic_level'),
        ]);
    }

    public function index(Request $request): JsonResponse {
        $perPage = $this->perPage($request, 100, 200);
        $hasSemester = Schema::hasColumn('courses', 'semester');

        $query = $this->applyCourseAccessScope(Course::query())->with('departments:id,code,name_ar,name_en')
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
            'course_type' => 'sometimes|string|in:major,minor',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
            'department_ids' => ['sometimes', 'array', 'max:20'],
            'department_ids.*' => ['integer', 'distinct', 'exists:departments,id'],
        ];
        if ($hasSemester) {
            $rules['semester'] = 'sometimes|integer|in:1,2';
        }

        $validated = $request->validate($rules);
        $validated['course_type'] = $validated['course_type'] ?? 'major';
        if ($hasSemester) {
            $validated['semester'] = null;
        }
        $departmentIds = $validated['department_ids'] ?? [];
        unset($validated['department_ids']);
        $this->validateDepartmentOwnership($departmentIds);
        $levels = $this->getEffectiveAcademicLevelScope();
        abort_if($levels !== null && ! in_array($validated['academic_level'], $levels, true), 403);
        $course = DB::transaction(function () use ($validated, $departmentIds) {
            $course = Course::create($validated);
            $this->syncDepartments($course, $departmentIds);
            return $course->load('departments:id,code,name_ar,name_en');
        });
        return ApiResponse::success($course, 'Course created.', [], 201);
    }

    public function show(Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
        return ApiResponse::success(
            $course->load(['departments:id,code,name_ar,name_en', 'assessmentComponents', 'learningOutcomes', 'programOutcomeMappings'])
        );
    }

    public function update(Request $request, Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
        $hasSemester = Schema::hasColumn('courses', 'semester');
        $rules = [
            'code' => ['sometimes', 'required', 'string', 'max:30', Rule::unique('courses', 'code')->ignore($course->id)],
            'department_ids' => ['sometimes', 'array', 'max:20'],
            'department_ids.*' => ['integer', 'distinct', 'exists:departments,id'],
            'name_ar' => 'sometimes|required|string|max:255',
            'name_en' => 'nullable|string|max:255',
            'credit_hours' => 'sometimes|required|integer|min:1',
            'academic_level' => 'sometimes|required|string|in:fourth,fifth,sixth',
            'course_type' => 'sometimes|string|in:major,minor',
            'is_active' => 'boolean',
            'description' => 'nullable|string',
        ];
        if ($hasSemester) {
            $rules['semester'] = 'sometimes|integer|in:1,2';
        }

        $validated = $request->validate($rules);
        $departmentIds = $validated['department_ids'] ?? null;
        unset($validated['department_ids']);
        if ($departmentIds !== null) $this->validateDepartmentOwnership($departmentIds, $course);
        $levels = $this->getEffectiveAcademicLevelScope();
        abort_if($levels !== null && isset($validated['academic_level']) && ! in_array($validated['academic_level'], $levels, true), 403);
        DB::transaction(function () use ($course, $validated, $departmentIds) {
            $course->update($validated);
            if ($departmentIds !== null) $this->syncDepartments($course, $departmentIds);
        });
        $course->load('departments:id,code,name_ar,name_en');
        return ApiResponse::success($course, 'Course updated successfully.');
    }

    public function destroy(Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
        $course->update(['is_active' => false]);
        return ApiResponse::success($course->fresh(), 'Course archived safely.');
    }

    /**
     * Assessment Components Sub-Resource API
     */
    public function updateAssessmentPlan(Request $request, Course $course): JsonResponse
    {
        $this->authorizeCourseAccess($course);
        $validated = $request->validate([
            'clinical' => ['required', 'numeric', 'gt:0', 'max:100'],
            'osce' => ['required', 'numeric', 'min:0', 'max:100'],
            'written' => ['required', 'numeric', 'gt:0', 'max:100'],
            'clinical_entry_max_score' => ['sometimes', 'required', 'numeric', 'gt:0', 'max:100'],
            'assessment_frequency' => ['sometimes', 'required', 'in:weekly,period'],
            'mini_osce_max_score' => ['sometimes', 'required', 'numeric', 'min:0', 'max:100'],
            'osce_entry_mode' => ['sometimes', 'required', 'in:assistant,supervisor,committee,legacy_shared'],
        ]);
        $scores = collect($validated)->only(['clinical', 'osce', 'written'])->all();
        if (abs(array_sum(array_map('floatval', $scores)) - 100.0) > 0.001) {
            throw ValidationException::withMessages(['assessment_plan' => [
                'مجموع علامات التقييم السريري وOSCE والامتحان النظري يجب أن يساوي 100.',
            ]]);
        }
        $components = DB::transaction(function () use ($course, $scores, $validated) {
            $items = $course->assessmentComponents()->lockForUpdate()->get()->keyBy('code');
            if ($items->count() !== 3 || ! collect(['clinical', 'osce', 'written'])->every(fn ($code) => $items->has($code))) {
                throw ValidationException::withMessages(['assessment_plan' => ['خطة تقييم المساق غير مكتملة؛ راجع مكوناتها قبل التعديل.']]);
            }
            $miniMax = (float) ($validated['mini_osce_max_score'] ?? $items['clinical']->mini_osce_max_score ?? 0);
            if ($miniMax >= (float) $validated['clinical'] && $miniMax > 0) {
                throw ValidationException::withMessages(['mini_osce_max_score' => ['علامة الميني أوسكي يجب أن تكون أقل من حصة التقييم السريري.']]);
            }
            $weightsChanged = collect($scores)->contains(fn ($score, $code) => abs((float) $score - (float) $items[$code]->max_score) > 0.001);
            if ($weightsChanged && GradeEntry::query()->whereHas('enrollment', fn ($query) => $query->where('course_id', $course->id))->exists()) {
                throw ValidationException::withMessages(['assessment_plan' => ['لا يمكن تغيير خطة المساق بعد إنشاء كشوف علامات له، حتى لا تتغير العلامات المحفوظة بأثر رجعي.']]);
            }
            $frequencyChanged = isset($validated['assessment_frequency']) && $validated['assessment_frequency'] !== ($items['clinical']->assessment_frequency ?: 'weekly');
            $miniChanged = isset($validated['mini_osce_max_score']) && abs((float) $validated['mini_osce_max_score'] - (float) $items['clinical']->mini_osce_max_score) > 0.001;
            $osceModeChanged = isset($validated['osce_entry_mode']) && $validated['osce_entry_mode'] !== ($items['osce']->osce_entry_mode ?: 'legacy_shared');
            if (($frequencyChanged || $miniChanged) && \App\Models\ClinicalAssessment::query()
                ->where(fn ($query) => $query
                    ->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $course->id))
                    ->orWhereHas('clinicalAssignment.rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $course->id)))
                ->exists()) {
                throw ValidationException::withMessages(['assessment_plan' => ['لا يمكن تغيير تكرار التقييم أو حصة الميني أوسكي بعد تسجيل تقييمات لهذا المساق؛ يلزم ترحيل أكاديمي يحفظ العلامات السابقة.']]);
            }
            if ($miniChanged && DB::table('clinical_mini_osce_scores')
                ->join('rotation_blocks', 'rotation_blocks.id', '=', 'clinical_mini_osce_scores.rotation_block_id')
                ->join('rotations', 'rotations.id', '=', 'rotation_blocks.rotation_id')
                ->where('rotations.course_id', $course->id)->exists()) {
                throw ValidationException::withMessages(['mini_osce_max_score' => ['لا يمكن تغيير حصة الميني أوسكي بعد تسجيل علاماته لهذا المساق.']]);
            }
            if ($osceModeChanged && GradeEntry::query()->whereNotNull('osce_score')
                ->whereHas('enrollment', fn ($query) => $query->where('course_id', $course->id))->exists()) {
                throw ValidationException::withMessages(['osce_entry_mode' => ['لا يمكن تغيير جهة إدخال الأوسكي بعد تسجيل علاماته لهذا المساق.']]);
            }

            $previous = $items->mapWithKeys(fn ($item, $code) => [$code => (float) $item->max_score])->all();
            $previous['clinical_entry_max_score'] = $items['clinical']->entry_max_score === null ? null : (float) $items['clinical']->entry_max_score;
            $previous['assessment_frequency'] = $items['clinical']->assessment_frequency;
            $previous['mini_osce_max_score'] = $items['clinical']->mini_osce_max_score;
            $previous['osce_entry_mode'] = $items['osce']->osce_entry_mode;
            foreach ($scores as $code => $score) {
                $values = ['weight' => $score, 'max_score' => $score];
                if ($code === 'clinical' && array_key_exists('clinical_entry_max_score', $validated)) {
                    $values['entry_max_score'] = $validated['clinical_entry_max_score'];
                }
                if ($code === 'clinical' && isset($validated['assessment_frequency'])) $values['assessment_frequency'] = $validated['assessment_frequency'];
                if ($code === 'clinical' && isset($validated['mini_osce_max_score'])) $values['mini_osce_max_score'] = $validated['mini_osce_max_score'];
                if ($code === 'osce' && isset($validated['osce_entry_mode'])) $values['osce_entry_mode'] = $validated['osce_entry_mode'];
                $items[$code]->update($values);
            }
            AuditLog::create([
                'user_id' => auth()->id(), 'action' => 'course.assessment_plan.updated',
                'entity_type' => Course::class, 'entity_id' => $course->id,
                'changes' => ['previous' => $previous, 'current' => [
                    ...$scores,
                    'clinical_entry_max_score' => $items['clinical']->entry_max_score === null ? null : (float) $items['clinical']->entry_max_score,
                    'assessment_frequency' => $items['clinical']->assessment_frequency,
                    'mini_osce_max_score' => $items['clinical']->mini_osce_max_score,
                    'osce_entry_mode' => $items['osce']->osce_entry_mode,
                ]],
            ]);

            return $course->assessmentComponents()->orderBy('id')->get();
        });

        return ApiResponse::success($components, 'Course assessment plan updated.');
    }

    public function addAssessmentComponent(Request $request, Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
        throw ValidationException::withMessages([
            'assessment_components' => ['تتكون الخطة من التقييم السريري وOSCE والامتحان النظري؛ عدّل أوزانها معًا من شاشة خطة تقييم المساق.'],
        ]);

    }

    public function updateAssessmentComponent(Request $request, Course $course, int $componentId): JsonResponse {
        $this->authorizeCourseAccess($course);
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

        if ($component->code && (array_key_exists('weight', $validated) || array_key_exists('max_score', $validated))) {
            throw ValidationException::withMessages(['assessment_plan' => ['عدّل أوزان مكوّنات المساق الثلاثة معًا من شاشة خطة تقييم المساق.']]);
        }

        $changesScore = (array_key_exists('weight', $validated) && (float) $validated['weight'] !== (float) $component->weight)
            || (array_key_exists('max_score', $validated) && (float) $validated['max_score'] !== (float) $component->max_score);
        if ($changesScore && GradeEntry::query()->whereHas('enrollment', fn ($query) => $query->where('course_id', $course->id))->exists()) {
            throw ValidationException::withMessages(['assessment_plan' => ['لا يمكن تغيير خطة المساق بعد إنشاء كشوف علامات له.']]);
        }

        $this->validateAssessmentWeight($course, (float) ($validated['weight'] ?? $component->weight ?? 0), $component->id);

        $component->update($validated);
        return ApiResponse::success($component, 'Assessment component updated.');
    }

    public function deleteAssessmentComponent(Course $course, int $componentId): JsonResponse {
        $this->authorizeCourseAccess($course);
        $component = $course->assessmentComponents()->findOrFail($componentId);
        if (in_array($component->code, ['clinical', 'osce', 'written'], true)) {
            throw ValidationException::withMessages([
                'assessment_components' => ['لا يمكن حذف مكوّن قياسي من خطة التقييم المعتمدة.'],
            ]);
        }
        $component->delete();
        return ApiResponse::success(null, 'Assessment component deleted.');
    }

    /**
     * Learning Outcomes (ILOs) Sub-Resource API
     */
    public function addLearningOutcome(Request $request, Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
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
        $this->authorizeCourseAccess($course);
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
        $this->authorizeCourseAccess($course);
        $outcome = $course->learningOutcomes()->findOrFail($outcomeId);
        $outcome->delete();
        return ApiResponse::success(null, 'Learning outcome deleted.');
    }

    /**
     * Program Outcome Mappings (PLOs) Sub-Resource API
     */
    public function addProgramOutcomeMapping(Request $request, Course $course): JsonResponse {
        $this->authorizeCourseAccess($course);
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
        $this->authorizeCourseAccess($course);
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
        abort_if(app(DepartmentHeadCourseScope::class)->departmentIds() !== null, 403);
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
                    'course_type'    => in_array(strtolower(trim((string) ($row['course_type'] ?? $row['نوع_المساق'] ?? $row['نوع المساق'] ?? 'major'))), ['minor', 'ماينر'], true) ? 'minor' : 'major',
                    'is_active'      => $isActive,
                    'description'    => $description,
                ];

                if ($hasSemester) {
                    $data['semester'] = null;
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

    private function validateDepartmentOwnership(array $ids, ?Course $course = null): void
    {
        $scope = app(DepartmentHeadCourseScope::class)->departmentIds();
        if ($scope === null) return;
        $ids = array_map('intval', $ids);
        if ($course) {
            $current = $course->departments()->pluck('departments.id')->map(fn ($id) => (int) $id)->all();
            sort($current);
            sort($ids);
            abort_unless($ids === $current, 403);
        } else {
            abort_if(empty($ids) || array_diff($ids, $scope), 403);
        }
    }

    private function syncDepartments(Course $course, array $ids): void
    {
        $old = $course->departments()->pluck('departments.id')->map(fn ($id) => (int) $id)->all();
        $new = array_map('intval', $ids);
        sort($old);
        sort($new);
        if ($old === $new) return;
        $course->departments()->sync($new);
        AuditLog::create([
            'user_id' => auth()->id(), 'action' => 'course.departments.changed',
            'entity_type' => Course::class, 'entity_id' => $course->id,
            'changes' => ['old_department_ids' => $old, 'new_department_ids' => $new],
        ]);
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
