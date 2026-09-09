<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\ClinicalAssessmentTemplate;
use App\Models\Course;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClinicalAssessmentTemplateController extends Controller
{
    public function index(): JsonResponse
    {
        return ApiResponse::success([
            'templates' => ClinicalAssessmentTemplate::query()
                ->with(['criteria', 'course:id,code,name_ar,name_en,academic_level', 'creator:id,name'])
                ->orderByRaw('course_id IS NULL DESC')->orderBy('course_id')->orderByDesc('version')->get(),
            'courses' => Course::query()->where('is_active', true)->orderBy('academic_level')->orderBy('code')
                ->get(['id', 'code', 'name_ar', 'name_en', 'academic_level']),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name_ar' => ['required', 'string', 'max:255'],
            'name_en' => ['nullable', 'string', 'max:255'],
            'course_id' => ['nullable', 'integer', 'exists:courses,id'],
            'criteria' => ['required', 'array', 'min:1', 'max:20'],
            'criteria.*.code' => ['nullable', 'string', 'max:60'],
            'criteria.*.name_ar' => ['required', 'string', 'max:255'],
            'criteria.*.name_en' => ['nullable', 'string', 'max:255'],
            'criteria.*.max_score' => ['required', 'numeric', 'gt:0', 'max:10'],
        ]);
        $total = round((float) collect($data['criteria'])->sum('max_score'), 2);
        if ($total !== 10.0) {
            throw ValidationException::withMessages(['criteria' => ['يجب أن يكون مجموع الدرجات القصوى لمعايير التقييم 10 درجات بالضبط.']]);
        }

        $template = DB::transaction(function () use ($data, $request, $total) {
            $scope = ClinicalAssessmentTemplate::query();
            empty($data['course_id']) ? $scope->whereNull('course_id') : $scope->where('course_id', $data['course_id']);
            $version = ((int) (clone $scope)->max('version')) + 1;
            (clone $scope)->where('is_active', true)->update(['is_active' => false]);
            $template = ClinicalAssessmentTemplate::create([
                'name_ar' => trim($data['name_ar']), 'name_en' => filled($data['name_en'] ?? null) ? trim($data['name_en']) : null,
                'course_id' => $data['course_id'] ?? null, 'version' => $version, 'total_score' => $total,
                'is_active' => true, 'created_by_user_id' => $request->user()->id,
            ]);
            foreach (array_values($data['criteria']) as $index => $criterion) {
                $template->criteria()->create([
                    'code' => filled($criterion['code'] ?? null) ? strtolower(trim($criterion['code'])) : 'criterion_'.($index + 1),
                    'name_ar' => trim($criterion['name_ar']), 'name_en' => filled($criterion['name_en'] ?? null) ? trim($criterion['name_en']) : null,
                    'max_score' => $criterion['max_score'], 'sort_order' => $index + 1,
                ]);
            }
            AuditLog::create([
                'user_id' => $request->user()->id, 'action' => 'clinical_assessment_template.created',
                'entity_type' => ClinicalAssessmentTemplate::class, 'entity_id' => $template->id,
                'changes' => ['course_id' => $template->course_id, 'version' => $template->version, 'total_score' => $total],
                'is_override' => false,
            ]);
            return $template;
        });

        return ApiResponse::success($template->load(['criteria', 'course']), 'تم اعتماد إصدار جديد من نموذج التقييم الأسبوعي.', [], 201);
    }
}
