<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalAssessmentTemplate;
use App\Models\CourseAssessmentComponent;
use App\Models\DistributionVersion;
use App\Models\GradeEntry;
use App\Models\StudentClinicalAssignment;
use App\Models\WorkflowTransitionLog;
use App\Services\ClinicalAssessmentAdminService;
use App\Services\ClinicalAssessmentContinuity;
use App\Services\ClinicalAssessmentPeriods;
use App\Services\ClinicalGradeCalculator;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use App\Services\Distribution\ClinicalScheduleDateCalculator;

/** System-admin registry: current and historic assessments remain separately visible. */
class AdminClinicalAssessmentController extends Controller
{
    private array $breakCache = [];

    public function __construct(private ClinicalScheduleDateCalculator $dateCalculator) {}

    private function authorizeAdmin(Request $request): void
    {
        abort_unless($request->user()?->is_active && $request->user()->hasRole('SYS_ADMIN'), 403);
    }

    public function overview(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        return ApiResponse::success([
            'counts' => [
                'clinical' => DB::table('clinical_assessments')->count(),
                'clinical_historical' => DB::table('clinical_assessments as ca')
                    ->join('student_clinical_assignments as a', 'a.id', '=', 'ca.student_clinical_assignment_id')
                    ->join('distribution_versions as v', 'v.id', '=', 'a.distribution_version_id')
                    ->where('v.status', 'published')->where('v.is_current', false)
                    ->whereIn('ca.status', ['submitted', 'approved'])->whereNotNull('ca.score')->count(),
                'mini_osce' => DB::table('clinical_mini_osce_scores')->count(),
                'mini_historical' => DB::table('clinical_mini_osce_scores as m')
                    ->join('distribution_versions as v', 'v.id', '=', 'm.distribution_version_id')
                    ->where('v.status', 'published')->where('v.is_current', false)
                    ->whereNull('m.superseded_at')->count(),
                'final_osce' => DB::table('grade_entries')->whereNotNull('osce_score')->count(),
            ],
            'courses' => DB::table('courses')->whereIn('id', DB::table('rotations')->select('course_id'))
                ->orderBy('code')->get(['id', 'code', 'name_ar']),
            'supervisors' => DB::table('people')->where(function ($query) {
                $query->whereIn('id', DB::table('clinical_assessments')->whereNotNull('evaluator_person_id')->select('evaluator_person_id'))
                    ->orWhereIn('id', DB::table('student_clinical_assignments')->whereNotNull('supervisor_id')->select('supervisor_id'));
            })->orderBy('full_name_ar')->get(['id', 'full_name_ar']),
            'groups' => DB::table('student_groups as g')->leftJoin('academic_years as y', 'y.id', '=', 'g.academic_year_id')
                ->whereIn('g.id', DB::table('student_subgroups')
                ->whereIn('id', DB::table('student_clinical_assignments')->whereNotNull('student_subgroup_id')->select('student_subgroup_id'))
                ->select('student_group_id'))->orderBy('g.name')->get(['g.id', 'g.name', 'g.academic_level', 'y.code as academic_year']),
            'subgroups' => DB::table('student_subgroups as sg')->join('student_groups as g', 'g.id', '=', 'sg.student_group_id')
                ->whereIn('sg.id', DB::table('student_clinical_assignments')
                ->whereNotNull('student_subgroup_id')->select('student_subgroup_id'))
                ->orderBy('g.name')->orderBy('sg.name')->get(['sg.id', 'sg.student_group_id', 'sg.name', 'g.name as group_name']),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $filters = $request->validate([
            'type' => ['nullable', 'in:clinical,mini_osce,final_osce'],
            'course_id' => ['nullable', 'integer', 'min:1'],
            'supervisor_id' => ['nullable', 'integer', 'min:1'],
            'group_id' => ['nullable', 'integer', 'min:1'],
            'subgroup_id' => ['nullable', 'integer', 'min:1'],
            'student' => ['nullable', 'string', 'max:100'],
            'week' => ['nullable', 'integer', 'between:1,60'],
            'version' => ['nullable', 'in:all,current,historical'],
            'status' => ['nullable', 'string', 'max:30'],
            'issues_only' => ['nullable', 'boolean'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $type = $filters['type'] ?? 'clinical';
        $query = match ($type) {
            'mini_osce' => $this->miniQuery(),
            'final_osce' => $this->osceQuery(),
            default => $this->clinicalQuery(),
        };
        if ($type === 'mini_osce' && ! empty($filters['issues_only'])) {
            // A training period can span several blocks. SQL matching only one block
            // misses those conflicts, so classify the full filtered stream first.
            $this->applyFilters($query, $type, array_diff_key($filters, ['issues_only' => true]));
            $perPage = (int) ($filters['per_page'] ?? 25);
            $pageNumber = (int) ($filters['page'] ?? 1);
            $offset = ($pageNumber - 1) * $perPage;
            $total = 0;
            $items = [];
            foreach ($query->orderByDesc('record_id')->cursor() as $row) {
                $presented = $this->present($row, $type);
                if (in_array($presented['finding'], ['current', 'superseded'], true)) continue;
                if ($total >= $offset && count($items) < $perPage) $items[] = $presented;
                $total++;
            }
            return ApiResponse::success(['items' => $items, 'pagination' => [
                'current_page' => $pageNumber, 'last_page' => max(1, (int) ceil($total / $perPage)),
                'per_page' => $perPage, 'total' => $total,
            ]]);
        }
        $this->applyFilters($query, $type, $filters);
        $page = $query->orderByDesc('record_id')->paginate((int) ($filters['per_page'] ?? 25));
        return ApiResponse::success([
            'items' => collect($page->items())->map(fn ($row) => $this->present($row, $type))->all(),
            'pagination' => [
                'current_page' => $page->currentPage(), 'last_page' => $page->lastPage(),
                'per_page' => $page->perPage(), 'total' => $page->total(),
            ],
        ]);
    }

    public function show(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce', 'final_osce'], true), 404);
        $query = match ($type) {
            'mini_osce' => $this->miniQuery(), 'final_osce' => $this->osceQuery(), default => $this->clinicalQuery(),
        };
        $row = $query->where(match ($type) {
            'mini_osce' => 'm.id', 'final_osce' => 'ge.id', default => 'ca.id',
        }, $id)->first();
        abort_unless($row, 404);
        $assessment = $type === 'clinical' ? ClinicalAssessment::findOrFail($id) : null;
        $mini = $type === 'mini_osce' ? DB::table('clinical_mini_osce_scores')->where('id', $id)->first() : null;
        $miniCurrent = $mini ? $service->currentMiniForHistorical($mini) : null;
        $plan = $assessment ? $service->restorePlan($assessment) : ($mini ? $service->miniRestorePlan($mini) : null);
        $grade = $type === 'final_osce' ? GradeEntry::find($id)
            : GradeEntry::query()->whereHas('enrollment', fn ($q) => $q
                ->where('student_id', $row->student_id)->where('course_id', $row->course_id)
                ->where('academic_year_id', $row->academic_year_id))->first();
        $officialClinical = $grade && $row->course_id && $row->academic_year_id
            ? app(ClinicalGradeCalculator::class)->scores([(int) $row->student_id],
                (int) $row->course_id, (int) $row->academic_year_id)->get((int) $row->student_id)
            : null;
        $peers = $type === 'clinical'
            ? $this->clinicalQuery()->where('ca.student_id', $row->student_id)
                ->where('r.id', $row->rotation_id)->where('ca.assessment_kind', $row->assessment_kind)
                ->where('ca.evaluation_week', $row->evaluation_week)
                ->when($row->assessment_kind === 'period' && $row->week_start && $row->week_end,
                    fn ($q) => $q->whereDate('ca.week_start', '<=', $row->week_end)
                        ->whereDate('ca.week_end', '>=', $row->week_start))
                ->orderBy('ca.id')->get()->map(fn ($peer) => $this->present($peer, 'clinical'))->all()
            : ($type === 'mini_osce'
                ? $this->miniQuery()->where('m.student_id', $row->student_id)
                    ->where('r.id', $row->rotation_id)
                    ->when($miniCurrent, fn ($q) => $q->where('b.from_week', '<=', $miniCurrent['period']['end_week'])
                        ->where('b.to_week', '>=', $miniCurrent['period']['start_week']))
                    ->orderBy('m.id')->get()->map(fn ($peer) => $this->present($peer, 'mini_osce'))->all()
                : []);
        $audits = AuditLog::query()->with('user:id,name')->where('entity_type', $type === 'clinical'
            ? ClinicalAssessment::class : ($type === 'final_osce' ? GradeEntry::class : 'clinical_mini_osce_scores'))
            ->where('entity_id', $id)->latest('id')->limit(30)->get()
            ->map(fn (AuditLog $log) => [
                'id' => $log->id, 'action' => $log->action, 'actor' => $log->user?->name,
                'reason' => $log->override_reason, 'changes' => $log->changes,
                'created_at' => $log->created_at,
            ]);
        return ApiResponse::success([
            'record' => $this->present($row, $type) + ['snapshot' => $service->fingerprint($type, $id)],
            'restore' => $plan ? ['allowed' => $plan['reason'] === null, 'reason' => $plan['reason'],
                'current_version_id' => $plan['current_version_id'],
                'target_assignment_id' => $plan['target']->id ?? null] : null,
            'current_authoritative' => $assessment
                ? (($match = $service->currentOfficialMarkForHistorical($assessment)) ? [
                    'id' => $match->id, 'score' => $match->score, 'max_score' => $match->max_score,
                    'version_id' => $match->clinicalAssignment?->distribution_version_id,
                    'supervisor_name' => $match->evaluator?->full_name_ar,
                    'snapshot' => $service->fingerprint('clinical', $match->id),
                ] : null) : ($miniCurrent ? [
                    'id' => $miniCurrent['score']->id, 'score' => $miniCurrent['score']->score,
                    'max_score' => $miniCurrent['score']->max_score,
                    'version_id' => $miniCurrent['version_id'],
                    'supervisor_name' => DB::table('people')->where('id', $miniCurrent['score']->entered_by_person_id)->value('full_name_ar'),
                    'snapshot' => $service->fingerprint('mini_osce', $miniCurrent['score']->id),
                ] : null),
            'grade' => $grade ? [
                'id' => $grade->id, 'status' => $grade->status, 'clinical_score' => $grade->clinical_score,
                'osce_score' => $grade->osce_score, 'written_score' => $grade->written_score, 'total_score' => $grade->score,
                'official_clinical_score' => $officialClinical,
                'clinical_outdated' => $officialClinical !== null && ($grade->clinical_score === null
                    || abs((float) $grade->clinical_score - (float) $officialClinical) > 0.005),
                'updated_at' => $grade->updated_at?->format('Y-m-d H:i:s'),
                'snapshot' => $service->fingerprint('final_osce', $grade->id),
            ] : null,
            'peers' => $peers, 'audits' => $audits,
            'manual' => $type === 'clinical' && $row->rotation_id ? $this->manualOptions($row->student_id, $row->rotation_id) : null,
        ]);
    }

    private function manualOptions(int $studentId, int $rotationId): array
    {
        $rotation = DB::table('rotations')->where('id', $rotationId)->first(['course_id']);
        $component = CourseAssessmentComponent::query()->where('course_id', $rotation->course_id)
            ->where('code', 'clinical')->first();
        $assignments = StudentClinicalAssignment::query()->where('student_id', $studentId)
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true))
            ->whereHas('rotationBlock', fn ($q) => $q->where('rotation_id', $rotationId))
            ->with(['studentSubgroup', 'supervisor', 'rotationBlock', 'distributionVersion'])
            ->orderBy('id')->get()->map(fn (StudentClinicalAssignment $item) => [
                'id' => $item->id, 'version_id' => $item->distribution_version_id,
                'supervisor' => $item->supervisor?->full_name_ar,
                'subgroup' => $item->studentSubgroup?->name,
                'from_week' => $item->rotationBlock?->from_week,
                'to_week' => $item->rotationBlock?->to_week,
            ])->all();
        return [
            'assignments' => $assignments,
            'kind' => $component?->assessment_frequency === 'period' ? 'period' : 'weekly',
            'max_score' => (float) ($component?->entry_max_score ?: 10),
        ];
    }

    public function gaps(Request $request): JsonResponse
    {
        $this->authorizeAdmin($request);
        $filters = $request->validate([
            'kind' => ['nullable', 'in:clinical,mini_osce'],
            'course_id' => ['nullable', 'integer', 'min:1'],
            'supervisor_id' => ['nullable', 'integer', 'min:1'],
            'group_id' => ['nullable', 'integer', 'min:1'],
            'subgroup_id' => ['nullable', 'integer', 'min:1'],
            'student' => ['nullable', 'string', 'max:100'],
            'week' => ['nullable', 'integer', 'between:1,60'],
            'page' => ['nullable', 'integer', 'min:1'],
            'per_page' => ['nullable', 'integer', 'between:1,100'],
        ]);
        $query = DB::table('student_clinical_assignments as a')
            ->join('distribution_versions as v', 'v.id', '=', 'a.distribution_version_id')
            ->join('rotation_blocks as b', 'b.id', '=', 'a.rotation_block_id')
            ->join('rotations as r', 'r.id', '=', 'b.rotation_id')
            ->join('courses as c', 'c.id', '=', 'r.course_id')
            ->join('students as s', 's.id', '=', 'a.student_id')
            ->join('people as p', 'p.id', '=', 'a.supervisor_id')
            ->leftJoin('student_subgroups as sg', 'sg.id', '=', 'a.student_subgroup_id')
            ->leftJoin('student_groups as g', 'g.id', '=', 'sg.student_group_id')
            ->leftJoin('course_assessment_components as ac', function ($join) {
                $join->on('ac.course_id', '=', 'r.course_id')->where('ac.code', '=', 'clinical');
            })
            ->where('v.status', 'published')->where('v.is_current', true)
            ->select('a.id as assignment_id', 'a.student_id', 'a.supervisor_id', 'a.student_subgroup_id',
                'a.training_site_id', 'a.distribution_version_id as version_id', 'a.rotation_block_id',
                'b.from_week', 'b.to_week', 'r.id as rotation_id', 'r.start_date', 'r.academic_year_id',
                'c.id as course_id', 'c.code as course_code', 'c.name_ar as course_name',
                's.full_name_ar as student_name', 's.university_number', 'p.full_name_ar as supervisor_name',
                'g.id as group_id', 'g.name as group_name', 'sg.id as subgroup_id', 'sg.name as subgroup_name',
                'ac.assessment_frequency', 'ac.entry_max_score', 'ac.max_score as clinical_max_score', 'ac.mini_osce_max_score');
        if (! empty($filters['course_id'])) $query->where('c.id', $filters['course_id']);
        if (! empty($filters['supervisor_id'])) $query->where('p.id', $filters['supervisor_id']);
        if (! empty($filters['group_id'])) $query->where('g.id', $filters['group_id']);
        if (! empty($filters['subgroup_id'])) $query->where('sg.id', $filters['subgroup_id']);
        if (! empty($filters['student'])) {
            $needle = str_replace(['%', '_'], ['\\%', '\\_'], trim($filters['student']));
            $query->where(fn ($q) => $q->where('s.full_name_ar', 'like', "%{$needle}%")
                ->orWhere('s.university_number', 'like', "%{$needle}%"));
        }
        $assignments = $query->orderBy('a.id')->get();
        if ($assignments->isEmpty()) return ApiResponse::success(['items' => [],
            'pagination' => ['current_page' => 1, 'last_page' => 1, 'per_page' => (int) ($filters['per_page'] ?? 25), 'total' => 0]]);

        $official = collect();
        $mini = collect();
        foreach ($assignments->pluck('assignment_id')->chunk(500) as $ids) {
            $official = $official->concat(DB::table('clinical_assessments as ca')
                ->join('student_clinical_assignments as a', 'a.id', '=', 'ca.student_clinical_assignment_id')
                ->join('rotation_blocks as b', 'b.id', '=', 'a.rotation_block_id')
                ->whereIn('a.id', $ids)->whereIn('ca.status', ['submitted', 'approved'])
                ->whereNotNull('ca.score')->whereColumn('ca.student_id', 'a.student_id')
                ->whereColumn('ca.evaluator_person_id', 'a.supervisor_id')
                ->get(['ca.student_id', 'ca.evaluator_person_id', 'ca.assessment_kind', 'ca.evaluation_week',
                    'ca.week_start', 'ca.week_end', 'b.rotation_id']));
        }
        foreach ($assignments->pluck('version_id')->unique()->chunk(300) as $ids) {
            $mini = $mini->concat(DB::table('clinical_mini_osce_scores')
                ->whereIn('distribution_version_id', $ids)
                ->whereNull('superseded_at')
                ->get(['student_id', 'rotation_block_id', 'distribution_version_id', 'entered_by_person_id']));
        }
        $weeklyKeys = $official->where('assessment_kind', 'weekly')
            ->mapWithKeys(fn ($mark) => [implode(':', [$mark->rotation_id, $mark->student_id,
                $mark->evaluator_person_id, $mark->evaluation_week]) => true]);
        $periodMarks = $official->where('assessment_kind', 'period')->groupBy(fn ($mark) => implode(':', [
            $mark->rotation_id, $mark->student_id, $mark->evaluator_person_id,
        ]));
        $miniKeys = $mini->mapWithKeys(fn ($mark) => [implode(':', [
            $mark->student_id, $mark->rotation_block_id, $mark->distribution_version_id,
            $mark->entered_by_person_id,
        ]) => true]);
        $gaps = collect();
        $seenWeekly = [];
        $today = today();
        foreach ($assignments as $assignment) {
            if (! $assignment->start_date || $assignment->assessment_frequency === 'period'
                || (float) $assignment->clinical_max_score <= 0) continue;
            for ($week = (int) $assignment->from_week; $week <= (int) $assignment->to_week; $week++) {
                if (! $week || (! empty($filters['week']) && (int) $filters['week'] !== $week)) continue;
                $key = implode(':', [$assignment->rotation_id, $assignment->student_id, $assignment->supervisor_id, $week]);
                if (isset($seenWeekly[$key])) continue;
                $seenWeekly[$key] = true;
                $end = $this->weekStart($assignment->start_date, $week, (int) $assignment->version_id)->addDays(6);
                if ($end->greaterThanOrEqualTo($today) || $weeklyKeys->has($key)) continue;
                if (($filters['kind'] ?? 'clinical') === 'clinical') $gaps->push($this->gapRow($assignment, 'clinical', $week, $week, $assignment->entry_max_score ?: 10));
            }
        }
        // Period and mini-OSCE are due after the complete continuous training
        // period, never once per duplicate weekly assignment row.
        $scopes = $assignments->groupBy(fn ($row) => implode(':', [
            $row->version_id, $row->rotation_id, $row->student_id, $row->supervisor_id,
            $row->student_subgroup_id, $row->training_site_id,
        ]));
        foreach ($scopes as $scope) {
            $ordered = $scope->sortBy('from_week')->values();
            $periods = [];
            foreach ($ordered as $row) {
                $last = count($periods) - 1;
                if ($last >= 0 && (int) $row->from_week <= $periods[$last]['end'] + 1) {
                    $periods[$last]['end'] = max($periods[$last]['end'], (int) $row->to_week);
                    $periods[$last]['blocks'][] = $row->rotation_block_id;
                } else {
                    $periods[] = ['first' => $row, 'start' => (int) $row->from_week,
                        'end' => (int) $row->to_week, 'blocks' => [$row->rotation_block_id]];
                }
            }
            foreach ($periods as $period) {
                $first = $period['first'];
                if (! $first->start_date || (! empty($filters['week']) && ((int) $filters['week'] < $period['start'] || (int) $filters['week'] > $period['end']))) continue;
                $startDate = $this->weekStart($first->start_date, $period['start'], (int) $first->version_id);
                $endDate = $this->weekStart($first->start_date, $period['end'], (int) $first->version_id)->addDays(6);
                if ($endDate->greaterThanOrEqualTo($today)) continue;
                if (($filters['kind'] ?? 'clinical') === 'clinical' && $first->assessment_frequency === 'period'
                    && (float) $first->clinical_max_score > 0) {
                    $key = implode(':', [$first->rotation_id, $first->student_id, $first->supervisor_id]);
                    $covered = $periodMarks->get($key, collect())->contains(fn ($mark) => $mark->week_start
                        && $mark->week_end && $mark->week_start <= $endDate->toDateString()
                        && $mark->week_end >= $startDate->toDateString());
                    if (! $covered) $gaps->push($this->gapRow($first, 'clinical', $period['start'], $period['end'], $first->entry_max_score ?: 10));
                }
                if (($filters['kind'] ?? 'clinical') === 'mini_osce' && (float) $first->mini_osce_max_score > 0) {
                    $covered = collect($period['blocks'])->contains(fn ($blockId) => $miniKeys->has(implode(':', [
                        $first->student_id, $blockId, $first->version_id, $first->supervisor_id,
                    ])));
                    if (! $covered) $gaps->push($this->gapRow($first, 'mini_osce', $period['start'], $period['end'], $first->mini_osce_max_score));
                }
            }
        }
        $gaps = $gaps->sortBy(fn ($row) => implode(':', [$row['course_code'], $row['group_name'],
            $row['subgroup_name'], $row['supervisor_name'], sprintf('%03d', $row['from_week']), $row['university_number']]))->values();
        $page = (int) ($filters['page'] ?? 1);
        $perPage = (int) ($filters['per_page'] ?? 25);
        return ApiResponse::success([
            'items' => $gaps->slice(($page - 1) * $perPage, $perPage)->values()->all(),
            'pagination' => ['current_page' => $page, 'last_page' => max(1, (int) ceil($gaps->count() / $perPage)),
                'per_page' => $perPage, 'total' => $gaps->count()],
        ]);
    }

    private function gapRow(object $assignment, string $kind, int $from, int $to, mixed $max): array
    {
        return [
            'kind' => $kind, 'assignment_id' => $assignment->assignment_id,
            'version_id' => $assignment->version_id, 'student_id' => $assignment->student_id,
            'student_name' => $assignment->student_name, 'university_number' => $assignment->university_number,
            'supervisor_name' => $assignment->supervisor_name, 'course_code' => $assignment->course_code,
            'course_name' => $assignment->course_name, 'group_name' => $assignment->group_name,
            'subgroup_name' => $assignment->subgroup_name, 'from_week' => $from, 'to_week' => $to,
            'max_score' => $max, 'assessment_kind' => $assignment->assessment_frequency === 'period' ? 'period' : 'weekly',
        ];
    }

    public function manual(Request $request, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        $data = $request->validate([
            'assignment_id' => ['required', 'integer', 'exists:student_clinical_assignments,id'],
            'expected_version_id' => ['required', 'integer'],
            'kind' => ['required', 'in:clinical,mini_osce'],
            'evaluation_week' => ['nullable', 'integer', 'between:1,60'],
            'score' => ['required', 'numeric', 'min:0'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
            'acknowledge_approved_grade' => ['nullable', 'boolean'],
        ]);
        $createdId = DB::transaction(function () use ($request, $data, $service): int {
            $assignment = StudentClinicalAssignment::query()->findOrFail($data['assignment_id']);
            DistributionVersion::query()->whereKey($assignment->distribution_version_id)->lockForUpdate()->first();
            $assignment = StudentClinicalAssignment::query()->with([
                'distributionVersion', 'rotationBlock.rotation', 'student',
            ])->lockForUpdate()->findOrFail($data['assignment_id']);
            $version = $assignment->distributionVersion;
            abort_if(! $version || $version->status !== 'published' || ! $version->is_current
                || (int) $version->id !== (int) $data['expected_version_id'], 409,
                'Current distribution changed. Refresh before entering a replacement mark.');
            $block = $assignment->rotationBlock;
            $rotation = $block?->rotation;
            abort_if(! $rotation?->start_date || ! $assignment->supervisor_id, 409,
                'The current assignment is incomplete.');
            DB::table('students')->where('id', $assignment->student_id)->lockForUpdate()->first();
            $component = CourseAssessmentComponent::query()->where('course_id', $rotation->course_id)
                ->where('code', 'clinical')->first();
            if ($data['kind'] === 'mini_osce') {
                $max = (float) ($component?->mini_osce_max_score ?: 0);
                abort_if($max <= 0 || (float) $data['score'] > $max, 422,
                    'Mini-OSCE is not configured for this course or the score exceeds its maximum.');
                $related = StudentClinicalAssignment::query()->where('distribution_version_id', $version->id)
                    ->where('student_id', $assignment->student_id)->where('supervisor_id', $assignment->supervisor_id)
                    ->where('student_subgroup_id', $assignment->student_subgroup_id)
                    ->where('training_site_id', $assignment->training_site_id)
                    ->whereHas('rotationBlock', fn ($q) => $q->where('rotation_id', $rotation->id))
                    ->with('rotationBlock')->get();
                $period = app(ClinicalAssessmentPeriods::class)->groups($related)
                    ->first(fn (array $item) => $item['assignments']->contains('id', $assignment->id));
                abort_unless($period, 409);
                $end = $this->weekStart($rotation->start_date, $period['end_week'], (int) $version->id)->addDays(6);
                abort_if($end->greaterThanOrEqualTo(today()), 422, 'Mini-OSCE period has not finished.');
                $blockIds = $period['block_ids']->all();
                abort_if(DB::table('clinical_mini_osce_scores')->where('student_id', $assignment->student_id)
                    ->where('distribution_version_id', $version->id)
                    ->whereIn('rotation_block_id', $blockIds)->exists(), 409,
                    'A mini-OSCE score already exists for this student and training period.');
                $oldMini = DB::table('clinical_mini_osce_scores as m')
                    ->join('rotation_blocks as b', 'b.id', '=', 'm.rotation_block_id')
                    ->join('distribution_versions as v', 'v.id', '=', 'm.distribution_version_id')
                    ->where('m.student_id', $assignment->student_id)
                    ->where('m.entered_by_person_id', $assignment->supervisor_id)
                    ->where('b.rotation_id', $rotation->id)->where('v.status', 'published')
                    ->where('v.is_current', false)->select('m.*')->get();
                foreach ($oldMini as $oldScore) {
                    $plan = $service->miniRestorePlan($oldScore);
                    if ($plan['reason'] === null && (int) $plan['current_version_id'] === (int) $version->id)
                        abort(409, 'A restorable historical mini-OSCE score exists. Restore it instead of entering a new mark.');
                }
                $id = DB::table('clinical_mini_osce_scores')->insertGetId([
                    'student_id' => $assignment->student_id,
                    'rotation_block_id' => $period['primary_block_id'],
                    'entered_by_person_id' => $assignment->supervisor_id,
                    'distribution_version_id' => $version->id,
                    'score' => round((float) $data['score'], 2), 'max_score' => $max,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $service->syncGrade($assignment->student_id, $rotation->course_id, $rotation->academic_year_id,
                    $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
                $service->audit($request->user(), 'grade.mini_osce.admin_created', 'clinical_mini_osce_scores',
                    $id, $assignment->student_id, $version->id,
                    ['assignment_id' => $assignment->id, 'entered_by_person_id' => $assignment->supervisor_id,
                        'entered_by_admin_user_id' => $request->user()->id,
                        'score' => round((float) $data['score'], 2), 'max_score' => $max], $data['reason']);
                return $id;
            }
            $kind = $component?->assessment_frequency === 'period' ? 'period' : 'weekly';
            $template = ClinicalAssessmentTemplate::currentForCourse($rotation->course_id, $assignment->student?->batch_year);
            $max = (float) ($component?->entry_max_score ?: $template?->total_score ?: 10);
            abort_if($max <= 0 || (float) $data['score'] > $max, 422, 'Score exceeds the configured entry maximum.');
            if ($kind === 'weekly') {
                $week = $data['evaluation_week'] ?? null;
                abort_if(! $week || $week < $block->from_week || $week > $block->to_week, 422,
                    'Week is outside the current assignment.');
                $start = $this->weekStart($rotation->start_date, $week, (int) $version->id);
                $end = $start->copy()->addDays(6);
            } else {
                abort_if(isset($data['evaluation_week']), 422, 'A period assessment must not specify a week.');
                $related = StudentClinicalAssignment::query()->where('distribution_version_id', $version->id)
                    ->where('student_id', $assignment->student_id)
                    ->where('supervisor_id', $assignment->supervisor_id)
                    ->where('student_subgroup_id', $assignment->student_subgroup_id)
                    ->where('training_site_id', $assignment->training_site_id)
                    ->whereHas('rotationBlock', fn ($q) => $q->where('rotation_id', $rotation->id))
                    ->with('rotationBlock')->get();
                $period = app(ClinicalAssessmentPeriods::class)->groups($related)
                    ->first(fn (array $item) => $item['assignments']->contains('id', $assignment->id));
                abort_unless($period, 409);
                $assignment = $period['assignments']->firstWhere('rotation_block_id', $period['primary_block_id']);
                $start = $this->weekStart($rotation->start_date, $period['start_week'], (int) $version->id);
                $end = $this->weekStart($rotation->start_date, $period['end_week'], (int) $version->id)->addDays(6);
                $week = null;
            }
            abort_if($start->isFuture(), 422, 'Assessment period has not begun.');
            $slot = app(ClinicalAssessmentContinuity::class)->forSlot($assignment, $assignment->student_id,
                $assignment->supervisor_id, $kind, $week, $start, $end);
            abort_if($slot->exists(), 409, 'A current assessment already exists for this student and slot. Inspect it instead.');
            $oldMarks = ClinicalAssessment::query()->where('student_id', $assignment->student_id)
                ->where('evaluator_person_id', $assignment->supervisor_id)
                ->where('assessment_kind', $kind)->where('evaluation_week', $week)
                ->whereIn('status', ['submitted', 'approved'])->whereNotNull('score')
                ->whereHas('clinicalAssignment', fn ($q) => $q
                    ->whereHas('distributionVersion', fn ($v) => $v->where('status', 'published')->where('is_current', false))
                    ->whereHas('rotationBlock', fn ($b) => $b->where('rotation_id', $rotation->id)))
                ->when($kind === 'period', fn ($q) => $q->whereDate('week_start', '<=', $end->toDateString())
                    ->whereDate('week_end', '>=', $start->toDateString()))
                ->get();
            foreach ($oldMarks as $oldMark) {
                $plan = $service->restorePlan($oldMark);
                if ($plan['reason'] === null && (int) $plan['current_version_id'] === (int) $version->id)
                    abort(409, 'A restorable historical assessment exists. Restore it instead of entering a new mark.');
            }
            $mark = ClinicalAssessment::create([
                'student_id' => $assignment->student_id, 'evaluator_person_id' => $assignment->supervisor_id,
                'student_clinical_assignment_id' => $assignment->id, 'assessment_template_id' => $template?->id,
                'evaluation_week' => $week, 'assessment_kind' => $kind,
                'period_guard' => $kind === 'period' ? 1 : null,
                'week_start' => $start->toDateString(), 'week_end' => $end->toDateString(),
                'score' => round((float) $data['score'], 2), 'max_score' => $max,
                'status' => 'submitted', 'submitted_at' => now(),
                'notes' => 'Administrative entry; reason and actor in audit log.',
            ]);
            WorkflowTransitionLog::create([
                'entity_type' => ClinicalAssessment::class, 'entity_id' => $mark->id,
                'from_state' => null, 'to_state' => 'submitted', 'user_id' => $request->user()->id,
            ]);
            $service->syncGrade($mark->student_id, $rotation->course_id, $rotation->academic_year_id,
                $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
            $service->audit($request->user(), 'assessment.admin_created', ClinicalAssessment::class,
                $mark->id, $mark->student_id, $version->id,
                ['assignment_id' => $assignment->id, 'evaluator_person_id' => $assignment->supervisor_id,
                    'entered_by_admin_user_id' => $request->user()->id,
                    'assessment_kind' => $kind, 'evaluation_week' => $week, 'score' => $mark->score,
                    'max_score' => $max], $data['reason']);
            return $mark->id;
        }, 3);
        return ApiResponse::success(['id' => $createdId, 'type' => $data['kind']],
            'Administrative assessment created with an audit trail.', [], 201);
    }

    public function restore(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce'], true), 404);
        $data = $request->validate([
            'expected_updated_at' => ['required', 'string'], 'expected_current_version_id' => ['required', 'integer'],
            'snapshot' => ['required', 'string', 'size:64'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
            'acknowledge_approved_grade' => ['nullable', 'boolean'],
        ]);
        DB::transaction(function () use ($request, $type, $id, $data, $service): void {
            if ($type === 'clinical') {
                $mark = ClinicalAssessment::query()->findOrFail($id);
                $oldAssignment = $mark->student_clinical_assignment_id;
                $versionIds = DistributionVersion::query()->whereHas('rotation', fn ($q) => $q->whereKey(
                    $mark->clinicalAssignment?->rotationBlock?->rotation_id))->pluck('id');
                DistributionVersion::query()->whereIn('id', $versionIds)->orderBy('id')->lockForUpdate()->get();
                $mark = ClinicalAssessment::query()->lockForUpdate()->findOrFail($id);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mark->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
                $plan = $service->restorePlan($mark);
                abort_if($plan['reason'] !== null || $plan['current_version_id'] !== $data['expected_current_version_id'], 409,
                    'The distribution or assessment changed. Refresh and review the conflict before retrying.');
                $source = $mark->clinicalAssignment;
                $mark->student_clinical_assignment_id = $plan['target']->id;
                $mark->save();
                $service->syncGrade($mark->student_id, $source->rotationBlock->rotation->course_id,
                    $source->rotationBlock->rotation->academic_year_id, $request->user(), $data['reason'],
                    (bool) ($data['acknowledge_approved_grade'] ?? false));
                $service->audit($request->user(), 'assessment.admin_relinked', ClinicalAssessment::class, $mark->id,
                    $mark->student_id, $plan['current_version_id'], [
                        'from_assignment_id' => $oldAssignment, 'to_assignment_id' => $mark->student_clinical_assignment_id,
                        'from_version_id' => $source->distribution_version_id, 'to_version_id' => $plan['current_version_id'],
                        'score' => $mark->score, 'evaluator_person_id' => $mark->evaluator_person_id,
                    ], $data['reason']);
            } else {
                $mini = DB::table('clinical_mini_osce_scores')->where('id', $id)->first();
                abort_unless($mini, 404);
                $rotation = DB::table('rotation_blocks as b')->join('rotations as r', 'r.id', '=', 'b.rotation_id')
                    ->where('b.id', $mini->rotation_block_id)->first(['r.course_id', 'r.academic_year_id', 'r.id']);
                DistributionVersion::query()->where('rotation_id', $rotation->id)->orderBy('id')->lockForUpdate()->get();
                $mini = DB::table('clinical_mini_osce_scores')->where('id', $id)->lockForUpdate()->first();
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mini->updated_at, $data['expected_updated_at']);
                $plan = $service->miniRestorePlan($mini);
                abort_if($plan['reason'] !== null || $plan['current_version_id'] !== $data['expected_current_version_id'], 409,
                    'The distribution or mini-OSCE score changed. Refresh and review the conflict.');
                DB::table('clinical_mini_osce_scores')->where('id', $id)->update([
                    'distribution_version_id' => $plan['current_version_id'], 'updated_at' => now(),
                ]);
                $service->syncGrade($mini->student_id, $rotation->course_id, $rotation->academic_year_id,
                    $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
                $service->audit($request->user(), 'grade.mini_osce.admin_relinked', 'clinical_mini_osce_scores', $id,
                    $mini->student_id, $plan['current_version_id'], [
                        'from_version_id' => $mini->distribution_version_id,
                        'to_version_id' => $plan['current_version_id'], 'score' => $mini->score,
                    ], $data['reason']);
            }
        }, 3);
        return ApiResponse::success(null, 'Assessment restored with a complete audit record.');
    }

    public function correct(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce', 'final_osce'], true), 404);
        $data = $request->validate([
            'score' => ['required', 'numeric', 'min:0'], 'expected_updated_at' => ['required', 'string'],
            'snapshot' => ['required', 'string', 'size:64'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
            'acknowledge_approved_grade' => ['nullable', 'boolean'],
        ]);
        DB::transaction(function () use ($request, $type, $id, $data, $service): void {
            $ack = (bool) ($data['acknowledge_approved_grade'] ?? false);
            if ($type === 'clinical') {
                $mark = ClinicalAssessment::query()->lockForUpdate()->findOrFail($id);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mark->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
                $mark->loadMissing('clinicalAssignment.distributionVersion', 'clinicalAssignment.rotationBlock.rotation');
                $assignment = $mark->clinicalAssignment;
                abort_if(! $assignment || ! $assignment->distributionVersion?->is_current
                    || $assignment->distributionVersion->status !== 'published'
                    || (int) $assignment->student_id !== (int) $mark->student_id
                    || (int) $assignment->supervisor_id !== (int) $mark->evaluator_person_id
                    || ! in_array($mark->status, ['submitted', 'approved'], true), 409,
                    'Only an official assessment on the current assigned supervisor can be corrected.');
                abort_if((float) $mark->max_score <= 0 || (float) $data['score'] > (float) $mark->max_score,
                    422, 'The assessment maximum is invalid or the score exceeds it.');
                $peer = ClinicalAssessment::query()->whereKeyNot($mark->id)
                    ->where('status', '<>', 'superseded')
                    ->where('student_id', $mark->student_id)->where('evaluator_person_id', $mark->evaluator_person_id)
                    ->where('assessment_kind', $mark->assessment_kind)->where('evaluation_week', $mark->evaluation_week)
                    ->when($mark->assessment_kind === 'period' && $mark->week_start && $mark->week_end,
                        fn ($q) => $q->whereDate('week_start', '<=', $mark->week_end->toDateString())
                            ->whereDate('week_end', '>=', $mark->week_start->toDateString()))
                    ->whereHas('clinicalAssignment', fn ($q) => $q
                        ->where('distribution_version_id', $assignment->distribution_version_id)
                        ->whereHas('rotationBlock', fn ($b) => $b->where('rotation_id', $assignment->rotationBlock->rotation_id)))
                    ->exists();
                abort_if($peer, 409, 'Multiple current assessments exist for this slot. Resolve the duplicate first.');
                $before = ['score' => $mark->score, 'criteria_scores' => $mark->criteria_scores];
                $mark->score = round((float) $data['score'], 2);
                // Criteria totals must never contradict an administrative override.
                $mark->criteria_scores = null;
                $mark->save();
                $rotation = $assignment->rotationBlock->rotation;
                $service->syncGrade($mark->student_id, $rotation->course_id, $rotation->academic_year_id,
                    $request->user(), $data['reason'], $ack);
                $service->audit($request->user(), 'assessment.admin_score_corrected', ClinicalAssessment::class,
                    $mark->id, $mark->student_id, $assignment->distribution_version_id,
                    ['before' => $before, 'after' => ['score' => $mark->score, 'criteria_scores' => null]], $data['reason']);
            } elseif ($type === 'mini_osce') {
                $mini = DB::table('clinical_mini_osce_scores')->where('id', $id)->lockForUpdate()->first();
                abort_unless($mini, 404);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mini->updated_at, $data['expected_updated_at']);
                $version = DistributionVersion::query()->find($mini->distribution_version_id);
                $assignments = StudentClinicalAssignment::query()->where('distribution_version_id', $mini->distribution_version_id)
                    ->where('student_id', $mini->student_id)->where('rotation_block_id', $mini->rotation_block_id)
                    ->where('supervisor_id', $mini->entered_by_person_id)->get();
                abort_if(! $version || $version->status !== 'published' || ! $version->is_current
                    || $mini->superseded_at || $assignments->count() !== 1,
                    409, 'Mini-OSCE is not uniquely assigned to the current supervisor.');
                abort_if((float) $mini->max_score <= 0 || (float) $data['score'] > (float) $mini->max_score,
                    422, 'The mini-OSCE maximum is invalid or the score exceeds it.');
                $duplicate = DB::table('clinical_mini_osce_scores')->where('id', '<>', $id)
                    ->where('distribution_version_id', $mini->distribution_version_id)
                    ->where('student_id', $mini->student_id)
                    ->where('rotation_block_id', $mini->rotation_block_id)
                    ->whereNull('superseded_at')->exists();
                abort_if($duplicate, 409, 'Multiple mini-OSCE scores exist for this slot. Review the conflict before correction.');
                $rotation = $assignments->first()->rotationBlock->rotation;
                DB::table('clinical_mini_osce_scores')->where('id', $id)->update(['score' => round((float) $data['score'], 2), 'updated_at' => now()]);
                $service->syncGrade($mini->student_id, $rotation->course_id, $rotation->academic_year_id,
                    $request->user(), $data['reason'], $ack);
                $service->audit($request->user(), 'grade.mini_osce.admin_score_corrected', 'clinical_mini_osce_scores',
                    $id, $mini->student_id, $mini->distribution_version_id,
                    ['before' => ['score' => $mini->score], 'after' => ['score' => round((float) $data['score'], 2)]], $data['reason']);
            } else {
                $grade = GradeEntry::query()->lockForUpdate()->findOrFail($id);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($grade->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
                $grade->loadMissing('enrollment');
                abort_if($grade->status === 'approved' && ! $ack, 422, 'Confirm amendment of the approved grade sheet.');
                $max = (float) CourseAssessmentComponent::query()->where('course_id', $grade->enrollment->course_id)
                    ->where('code', 'osce')->value('max_score');
                abort_if($max <= 0 || (float) $data['score'] > $max, 422, 'Score exceeds the configured final OSCE maximum.');
                $before = ['osce_score' => $grade->osce_score, 'total_score' => $grade->score];
                $grade->osce_score = round((float) $data['score'], 2);
                $grade->score = $grade->clinical_score === null || $grade->written_score === null
                    ? null : round((float) $grade->clinical_score + (float) $grade->osce_score + (float) $grade->written_score, 2);
                if (in_array($grade->status, ['submitted', 'approved'], true) && $grade->score === null)
                    throw ValidationException::withMessages(['grade' => ['The approved/submitted total cannot be recalculated.']]);
                $grade->save();
                $service->audit($request->user(), 'grade.final_osce.admin_score_corrected', GradeEntry::class,
                    $grade->id, $grade->enrollment->student_id, null,
                    ['before' => $before, 'after' => ['osce_score' => $grade->osce_score, 'total_score' => $grade->score,
                        'status' => $grade->status]], $data['reason']);
            }
        }, 3);
        return ApiResponse::success(null, 'Score corrected; affected grade total and audit trail updated.');
    }

    public function choose(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce'], true), 404);
        $data = $request->validate([
            'expected_updated_at' => ['required', 'string'],
            'snapshot' => ['required', 'string', 'size:64'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
            'acknowledge_approved_grade' => ['nullable', 'boolean'],
        ]);
        if ($type === 'mini_osce') {
            DB::transaction(function () use ($request, $id, $data, $service): void {
                $winner = DB::table('clinical_mini_osce_scores')->where('id', $id)->first();
                abort_unless($winner, 404);
                $rotationId = DB::table('rotation_blocks')->where('id', $winner->rotation_block_id)->value('rotation_id');
                abort_unless($rotationId, 409, 'The mini OSCE has no valid rotation.');
                DistributionVersion::query()->where('rotation_id', $rotationId)->orderBy('id')->lockForUpdate()->get();
                DB::table('students')->where('id', $winner->student_id)->lockForUpdate()->first();
                $winner = DB::table('clinical_mini_osce_scores')->where('id', $id)->lockForUpdate()->first();
                $this->assertFingerprint($service, 'mini_osce', $id, $data['snapshot']);
                $this->assertSnapshot($winner->updated_at, $data['expected_updated_at']);
                $scope = $this->currentMiniPeriod($winner);
                abort_if(! $scope || (int) $winner->entered_by_person_id !== (int) $scope['supervisor_id']
                    || (float) $winner->score < 0 || (float) $winner->max_score <= 0
                    || (float) $winner->score > (float) $winner->max_score,
                    409, 'Only the currently assigned supervisor’s valid mini OSCE mark can be chosen.');
                $peers = DB::table('clinical_mini_osce_scores')->where('student_id', $winner->student_id)
                    ->where('distribution_version_id', $winner->distribution_version_id)
                    ->whereIn('rotation_block_id', $scope['period']['block_ids']->all())
                    ->whereNull('superseded_at')->orderBy('id')->lockForUpdate()->get();
                abort_if($peers->count() < 2 || $peers->where('id', $id)->isEmpty(), 409,
                    'No duplicate current mini OSCE marks remain. Refresh the record.');
                foreach ($peers as $peer) {
                    if ((int) $peer->id === $id) continue;
                    DB::table('clinical_mini_osce_scores')->where('id', $peer->id)->update([
                        'superseded_at' => now(), 'superseded_by_score_id' => $id,
                        'superseded_by_user_id' => $request->user()->id, 'updated_at' => now(),
                    ]);
                    $service->audit($request->user(), 'grade.mini_osce.admin_superseded_duplicate',
                        'clinical_mini_osce_scores', $peer->id, $peer->student_id, $peer->distribution_version_id,
                        ['authoritative_score_id' => $id, 'score_preserved' => $peer->score], $data['reason']);
                }
                $rotation = DB::table('rotations')->where('id', $scope['rotation_id'])->firstOrFail();
                $service->syncGrade($winner->student_id, $rotation->course_id, $rotation->academic_year_id,
                    $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
                $service->audit($request->user(), 'grade.mini_osce.admin_chosen_authoritative',
                    'clinical_mini_osce_scores', $id, $winner->student_id, $winner->distribution_version_id,
                    ['superseded_score_ids' => $peers->where('id', '!=', $id)->pluck('id')->all(),
                        'score' => $winner->score], $data['reason']);
            }, 3);
            return ApiResponse::success(null, 'The assigned supervisor’s mini OSCE mark is authoritative; duplicates remain as audited history.');
        }
        DB::transaction(function () use ($request, $type, $id, $data, $service): void {
            $winner = ClinicalAssessment::query()->with('clinicalAssignment.rotationBlock')->findOrFail($id);
            $rotationId = $winner->clinicalAssignment?->rotationBlock?->rotation_id;
            abort_unless($rotationId, 409, 'The assessment has no valid rotation.');
            DistributionVersion::query()->where('rotation_id', $rotationId)->orderBy('id')->lockForUpdate()->get();
            DB::table('students')->where('id', $winner->student_id)->lockForUpdate()->first();
            $winner = ClinicalAssessment::query()->lockForUpdate()->findOrFail($id);
            $this->assertFingerprint($service, $type, $id, $data['snapshot']);
            $this->assertSnapshot($winner->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
            $winner->loadMissing('clinicalAssignment.distributionVersion', 'clinicalAssignment.rotationBlock.rotation');
            $assignment = $winner->clinicalAssignment;
            abort_if(! $assignment || ! $assignment->distributionVersion?->is_current
                || $assignment->distributionVersion->status !== 'published'
                || (int) $assignment->student_id !== (int) $winner->student_id
                || (int) $assignment->supervisor_id !== (int) $winner->evaluator_person_id
                || ! in_array($winner->status, ['submitted', 'approved'], true) || $winner->score === null,
                409, 'Only a valid current official assessment can be chosen.');
            $peers = ClinicalAssessment::query()->where('student_id', $winner->student_id)
                ->where('assessment_kind', $winner->assessment_kind)
                ->where('evaluation_week', $winner->evaluation_week)
                ->when($winner->assessment_kind === 'period' && $winner->week_start && $winner->week_end,
                    fn ($q) => $q->whereDate('week_start', '<=', $winner->week_end->toDateString())
                        ->whereDate('week_end', '>=', $winner->week_start->toDateString()))
                ->whereHas('clinicalAssignment', fn ($q) => $q
                    ->where('distribution_version_id', $assignment->distribution_version_id)
                    ->whereHas('rotationBlock', fn ($b) => $b->where('rotation_id', $assignment->rotationBlock->rotation_id)))
                ->orderBy('id')->lockForUpdate()->get();
            abort_if($peers->where('status', '!=', 'superseded')->count() < 2, 409,
                'No duplicate current assessments remain. Refresh the record.');
            foreach ($peers as $peer) {
                if ($peer->id === $winner->id) continue;
                if ($peer->status === 'superseded') continue;
                $oldStatus = $peer->status;
                $peer->status = 'superseded';
                $peer->save();
                $service->audit($request->user(), 'assessment.admin_superseded_duplicate', ClinicalAssessment::class,
                    $peer->id, $peer->student_id, $assignment->distribution_version_id,
                    ['before_status' => $oldStatus, 'after_status' => 'superseded', 'authoritative_assessment_id' => $winner->id,
                        'score_preserved' => $peer->score], $data['reason']);
            }
            $rotation = $assignment->rotationBlock->rotation;
            $service->syncGrade($winner->student_id, $rotation->course_id, $rotation->academic_year_id,
                $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
            $service->audit($request->user(), 'assessment.admin_chosen_authoritative', ClinicalAssessment::class,
                $winner->id, $winner->student_id, $assignment->distribution_version_id,
                ['other_assessment_ids' => $peers->where('id', '!=', $winner->id)->pluck('id')->all(),
                    'score' => $winner->score], $data['reason']);
        }, 3);
        return ApiResponse::success(null, 'The selected mark is authoritative; all other records remain preserved as superseded history.');
    }

    public function review(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce'], true), 404);
        $data = $request->validate([
            'expected_updated_at' => ['required', 'string'],
            'snapshot' => ['required', 'string', 'size:64'],
            'decision' => ['required', 'in:historical_only,requires_new_assessment'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);
        DB::transaction(function () use ($request, $type, $id, $data, $service): void {
            if ($type === 'clinical') {
                $mark = ClinicalAssessment::query()->lockForUpdate()->findOrFail($id);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mark->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
                $mark->loadMissing('clinicalAssignment.distributionVersion');
                abort_if(! $mark->clinicalAssignment || $mark->clinicalAssignment->distributionVersion?->is_current,
                    409, 'This record is not historical.');
                $service->audit($request->user(), 'assessment.admin_historical_reviewed', ClinicalAssessment::class,
                    $id, $mark->student_id, $mark->clinicalAssignment->distribution_version_id,
                    ['decision' => $data['decision'], 'score_preserved' => $mark->score], $data['reason']);
            } else {
                $mini = DB::table('clinical_mini_osce_scores')->where('id', $id)->lockForUpdate()->first();
                abort_unless($mini, 404);
                $this->assertFingerprint($service, $type, $id, $data['snapshot']);
                $this->assertSnapshot($mini->updated_at, $data['expected_updated_at']);
                $version = DistributionVersion::query()->find($mini->distribution_version_id);
                abort_if(! $version || $version->is_current, 409, 'This record is not historical.');
                $service->audit($request->user(), 'grade.mini_osce.admin_historical_reviewed', 'clinical_mini_osce_scores',
                    $id, $mini->student_id, $mini->distribution_version_id,
                    ['decision' => $data['decision'], 'score_preserved' => $mini->score], $data['reason']);
            }
        }, 3);
        return ApiResponse::success(null, 'Academic decision documented. No historical score was altered.');
    }

    public function confirmCurrent(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce'], true), 404);
        $data = $request->validate([
            'expected_updated_at' => ['required', 'string'],
            'snapshot' => ['required', 'string', 'size:64'],
            'expected_current_assessment_id' => ['required', 'integer'],
            'expected_current_snapshot' => ['required', 'string', 'size:64'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
        ]);
        if ($type === 'mini_osce') {
            DB::transaction(function () use ($request, $id, $data, $service): void {
                $historical = DB::table('clinical_mini_osce_scores')->where('id', $id)->first();
                abort_unless($historical, 404);
                $rotationId = DB::table('rotation_blocks')->where('id', $historical->rotation_block_id)->value('rotation_id');
                abort_unless($rotationId, 409, 'The historical mini-OSCE has no valid rotation.');
                DistributionVersion::query()->where('rotation_id', $rotationId)->orderBy('id')->lockForUpdate()->get();
                DB::table('students')->where('id', $historical->student_id)->lockForUpdate()->first();
                $historical = DB::table('clinical_mini_osce_scores')->where('id', $id)->lockForUpdate()->first();
                $this->assertFingerprint($service, 'mini_osce', $id, $data['snapshot']);
                $this->assertSnapshot($historical->updated_at, $data['expected_updated_at']);
                $candidate = $service->currentMiniForHistorical($historical);
                abort_if(! $candidate || (int) $candidate['score']->id !== (int) $data['expected_current_assessment_id'], 409,
                    'The currently assigned supervisor does not have one unique mini-OSCE mark for this period.');
                DB::table('clinical_mini_osce_scores')->where('id', $candidate['score']->id)->lockForUpdate()->first();
                $this->assertFingerprint($service, 'mini_osce', $candidate['score']->id, $data['expected_current_snapshot']);
                $candidate = $service->currentMiniForHistorical($historical);
                abort_if(! $candidate || (int) $candidate['score']->id !== (int) $data['expected_current_assessment_id'], 409,
                    'The current mini-OSCE mark changed. Refresh and review the records.');
                $period = $candidate['period'];
                $oldScores = DB::table('clinical_mini_osce_scores as m')
                    ->join('rotation_blocks as b', 'b.id', '=', 'm.rotation_block_id')
                    ->join('distribution_versions as v', 'v.id', '=', 'm.distribution_version_id')
                    ->where('m.student_id', $historical->student_id)
                    ->where('b.rotation_id', $rotationId)
                    ->where('v.status', 'published')->where('v.is_current', false)
                    ->whereNull('m.superseded_at')
                    ->where('b.from_week', '<=', $period['end_week'])
                    ->where('b.to_week', '>=', $period['start_week'])
                    ->orderBy('m.id')->lockForUpdate()->get(['m.*']);
                abort_if(! $oldScores->contains('id', $id), 409, 'This mini-OSCE no longer belongs to the unresolved period.');
                foreach ($oldScores as $oldScore) {
                    DB::table('clinical_mini_osce_scores')->where('id', $oldScore->id)->update([
                        'superseded_at' => now(), 'superseded_by_score_id' => $candidate['score']->id,
                        'superseded_by_user_id' => $request->user()->id, 'updated_at' => now(),
                    ]);
                    $service->audit($request->user(), 'grade.mini_osce.admin_historical_closed_for_current',
                        'clinical_mini_osce_scores', $oldScore->id, $oldScore->student_id,
                        $oldScore->distribution_version_id, [
                            'authoritative_score_id' => $candidate['score']->id,
                            'source_supervisor_id' => $oldScore->entered_by_person_id,
                            'current_supervisor_id' => $candidate['score']->entered_by_person_id,
                            'source_score_preserved' => $oldScore->score,
                            'current_score' => $candidate['score']->score,
                        ], $data['reason']);
                }
                $service->audit($request->user(), 'grade.mini_osce.admin_current_confirmed',
                    'clinical_mini_osce_scores', $candidate['score']->id, $candidate['score']->student_id,
                    $candidate['version_id'], ['historical_score_ids' => $oldScores->pluck('id')->all(),
                        'score_unchanged' => $candidate['score']->score], $data['reason']);
            }, 3);
            return ApiResponse::success(null, 'The current assigned supervisor’s mini-OSCE remains authoritative; historical marks are preserved and closed.');
        }
        DB::transaction(function () use ($request, $id, $data, $service): void {
            $historical = ClinicalAssessment::query()->with('clinicalAssignment.rotationBlock')->findOrFail($id);
            $rotationId = $historical->clinicalAssignment?->rotationBlock?->rotation_id;
            abort_unless($rotationId, 409, 'The historical assessment has no valid rotation.');
            DistributionVersion::query()->where('rotation_id', $rotationId)->orderBy('id')->lockForUpdate()->get();
            DB::table('students')->where('id', $historical->student_id)->lockForUpdate()->first();
            $historical = ClinicalAssessment::query()->lockForUpdate()->findOrFail($id);
            $this->assertFingerprint($service, 'clinical', $id, $data['snapshot']);
            $this->assertSnapshot($historical->updated_at?->format('Y-m-d H:i:s'), $data['expected_updated_at']);
            $current = $service->currentOfficialMarkForHistorical($historical);
            abort_if(! $current || $current->id !== (int) $data['expected_current_assessment_id'], 409,
                'The current assigned supervisor does not have one unique official mark. Refresh and inspect the slot.');
            ClinicalAssessment::query()->whereKey($current->id)->lockForUpdate()->first();
            $this->assertFingerprint($service, 'clinical', $current->id, $data['expected_current_snapshot']);
            $current = $service->currentOfficialMarkForHistorical($historical);
            abort_if(! $current || $current->id !== (int) $data['expected_current_assessment_id'], 409,
                'The current mark changed. Refresh before confirming it.');

            $oldMarks = ClinicalAssessment::query()->where('student_id', $historical->student_id)
                ->where('assessment_kind', $historical->assessment_kind)
                ->where('evaluation_week', $historical->evaluation_week)
                ->whereIn('status', ['submitted', 'approved'])
                ->whereHas('clinicalAssignment', fn ($assignment) => $assignment
                    ->whereHas('distributionVersion', fn ($version) => $version
                        ->where('status', 'published')->where('is_current', false))
                    ->whereHas('rotationBlock', fn ($block) => $block->where('rotation_id', $rotationId)))
                ->when($historical->assessment_kind === 'period', fn ($query) => $query
                    ->whereDate('week_start', '<=', $current->week_end?->toDateString())
                    ->whereDate('week_end', '>=', $current->week_start?->toDateString()))
                ->orderBy('id')->lockForUpdate()->get();
            abort_if(! $oldMarks->contains('id', $historical->id), 409,
                'The historical record no longer belongs to this unresolved slot.');
            foreach ($oldMarks as $oldMark) {
                $oldStatus = $oldMark->status;
                $oldMark->status = 'superseded';
                $oldMark->save();
                $service->audit($request->user(), 'assessment.admin_historical_closed_for_current', ClinicalAssessment::class,
                    $oldMark->id, $oldMark->student_id, $oldMark->clinicalAssignment->distribution_version_id,
                    ['before_status' => $oldStatus, 'after_status' => 'superseded',
                        'authoritative_assessment_id' => $current->id, 'source_evaluator_person_id' => $oldMark->evaluator_person_id,
                        'current_evaluator_person_id' => $current->evaluator_person_id,
                        'source_score_preserved' => $oldMark->score, 'current_score' => $current->score], $data['reason']);
            }
            $service->audit($request->user(), 'assessment.admin_current_confirmed', ClinicalAssessment::class,
                $current->id, $current->student_id, $current->clinicalAssignment->distribution_version_id,
                ['historical_assessment_ids' => $oldMarks->pluck('id')->all(), 'score_unchanged' => $current->score,
                    'max_score_unchanged' => $current->max_score], $data['reason']);
        }, 3);
        return ApiResponse::success(null, 'The current assigned supervisor’s assessment remains authoritative; historical marks for this slot are preserved and closed.');
    }

    public function resync(Request $request, string $type, int $id, ClinicalAssessmentAdminService $service): JsonResponse
    {
        $this->authorizeAdmin($request);
        abort_unless(in_array($type, ['clinical', 'mini_osce'], true), 404);
        $data = $request->validate([
            'expected_grade_updated_at' => ['required', 'string'],
            'grade_snapshot' => ['required', 'string', 'size:64'],
            'reason' => ['required', 'string', 'min:10', 'max:2000'],
            'acknowledge_approved_grade' => ['nullable', 'boolean'],
        ]);
        DB::transaction(function () use ($request, $type, $id, $data, $service): void {
            if ($type === 'clinical') {
                $mark = ClinicalAssessment::query()->with('clinicalAssignment.rotationBlock.rotation')->findOrFail($id);
                $rotation = $mark->clinicalAssignment?->rotationBlock?->rotation;
                $studentId = $mark->student_id;
            } else {
                $mini = DB::table('clinical_mini_osce_scores')->where('id', $id)->first();
                abort_unless($mini, 404);
                $rotation = DB::table('rotation_blocks as b')->join('rotations as r', 'r.id', '=', 'b.rotation_id')
                    ->where('b.id', $mini->rotation_block_id)->first(['r.course_id', 'r.academic_year_id']);
                $studentId = $mini->student_id;
            }
            abort_unless($rotation, 409);
            $grade = GradeEntry::query()->whereHas('enrollment', fn ($q) => $q
                ->where('student_id', $studentId)->where('course_id', $rotation->course_id)
                ->where('academic_year_id', $rotation->academic_year_id))->lockForUpdate()->first();
            abort_unless($grade, 409, 'No grade entry exists to resynchronize.');
            $this->assertFingerprint($service, 'final_osce', $grade->id, $data['grade_snapshot']);
            $this->assertSnapshot($grade->updated_at?->format('Y-m-d H:i:s'), $data['expected_grade_updated_at']);
            $service->syncGrade($studentId, $rotation->course_id, $rotation->academic_year_id,
                $request->user(), $data['reason'], (bool) ($data['acknowledge_approved_grade'] ?? false));
        }, 3);
        return ApiResponse::success(null, 'Grade sheet synchronized with the current official clinical assessments.');
    }

    private function assertSnapshot(?string $actual, string $expected): void
    {
        abort_if($actual !== $expected, 409, 'This record changed since it was opened. Refresh before making any correction.');
    }

    private function assertFingerprint(ClinicalAssessmentAdminService $service, string $type, int $id, string $expected): void
    {
        abort_if(! hash_equals($expected, $service->fingerprint($type, $id)), 409,
            'The record changed after opening. Refresh and inspect it before saving.');
    }

    private function clinicalQuery()
    {
        return DB::table('clinical_assessments as ca')
            ->leftJoin('student_clinical_assignments as a', 'a.id', '=', 'ca.student_clinical_assignment_id')
            ->leftJoin('distribution_versions as v', 'v.id', '=', 'a.distribution_version_id')
            ->leftJoin('rotation_blocks as b', 'b.id', '=', 'a.rotation_block_id')
            ->leftJoin('rotations as r', 'r.id', '=', 'b.rotation_id')
            ->leftJoin('courses as c', 'c.id', '=', 'r.course_id')
            ->leftJoin('students as s', 's.id', '=', 'ca.student_id')
            ->leftJoin('people as p', 'p.id', '=', 'ca.evaluator_person_id')
            ->leftJoin('student_subgroups as sg', 'sg.id', '=', 'a.student_subgroup_id')
            ->leftJoin('student_groups as g', 'g.id', '=', 'sg.student_group_id')
            ->select('ca.id as record_id', 'ca.student_id', 'ca.evaluator_person_id as supervisor_id',
                'ca.student_clinical_assignment_id as assignment_id', 'ca.assessment_kind', 'ca.evaluation_week',
                'ca.week_start', 'ca.week_end', 'ca.score', 'ca.max_score', 'ca.status', 'ca.submitted_at',
                'ca.created_at', 'ca.updated_at', 's.full_name_ar as student_name', 's.university_number',
                'p.full_name_ar as supervisor_name', 'a.supervisor_id as assigned_supervisor_id',
                'a.student_id as assigned_student_id', 'v.id as version_id', 'v.is_current', 'v.status as version_status',
                'r.id as rotation_id', 'r.academic_year_id', 'b.from_week', 'b.to_week',
                'c.id as course_id', 'c.code as course_code',
                'c.name_ar as course_name', 'g.id as group_id', 'g.name as group_name',
                'sg.id as subgroup_id', 'sg.name as subgroup_name');
    }

    private function miniQuery()
    {
        return DB::table('clinical_mini_osce_scores as m')
            ->leftJoin('distribution_versions as v', 'v.id', '=', 'm.distribution_version_id')
            ->join('rotation_blocks as b', 'b.id', '=', 'm.rotation_block_id')
            ->join('rotations as r', 'r.id', '=', 'b.rotation_id')
            ->join('courses as c', 'c.id', '=', 'r.course_id')
            ->join('students as s', 's.id', '=', 'm.student_id')
            ->join('people as p', 'p.id', '=', 'm.entered_by_person_id')
            ->select('m.id as record_id', 'm.student_id', 'm.rotation_block_id', 'm.entered_by_person_id as supervisor_id',
                'm.score', 'm.max_score', 'm.superseded_at', 'm.superseded_by_score_id',
                'm.created_at', 'm.updated_at', 's.full_name_ar as student_name',
                's.university_number', 'p.full_name_ar as supervisor_name', 'v.id as version_id',
                'v.is_current', 'v.status as version_status', 'r.id as rotation_id', 'r.academic_year_id',
                'c.id as course_id', 'c.code as course_code', 'c.name_ar as course_name',
                'b.from_week', 'b.to_week');
    }

    /** @return array{period: array, supervisor_id: int, rotation_id: int}|null */
    private function currentMiniPeriod(object $mini): ?array
    {
        if ($mini->superseded_at) return null;
        $block = DB::table('rotation_blocks')->where('id', $mini->rotation_block_id)->first();
        $version = DistributionVersion::query()->find($mini->distribution_version_id);
        if (! $block || ! $version || $version->status !== 'published' || ! $version->is_current
            || (int) $version->rotation_id !== (int) $block->rotation_id) return null;
        $assignments = StudentClinicalAssignment::query()->where('student_id', $mini->student_id)
            ->where('distribution_version_id', $mini->distribution_version_id)
            ->whereHas('rotationBlock', fn ($q) => $q->where('rotation_id', $block->rotation_id))
            ->with(['rotationBlock', 'student:id,batch_year'])->get();
        $periods = app(ClinicalAssessmentPeriods::class)->groups($assignments)
            ->filter(fn (array $period) => $period['block_ids']->contains((int) $mini->rotation_block_id))->values();
        if ($periods->count() !== 1) return null;
        $period = $periods->first();
        $supervisors = $period['assignments']->pluck('supervisor_id')->filter()->unique();
        if ($supervisors->count() !== 1) return null;
        return ['period' => $period, 'supervisor_id' => (int) $supervisors->first(),
            'rotation_id' => (int) $block->rotation_id];
    }

    private function osceQuery()
    {
        return DB::table('grade_entries as ge')
            ->join('student_course_enrollments as e', 'e.id', '=', 'ge.student_course_enrollment_id')
            ->join('students as s', 's.id', '=', 'e.student_id')
            ->join('courses as c', 'c.id', '=', 'e.course_id')
            ->leftJoin('course_assessment_components as oc', function ($join) {
                $join->on('oc.course_id', '=', 'c.id')->where('oc.code', '=', 'osce');
            })
            ->leftJoin('users as u', 'u.id', '=', 'ge.osce_recorded_by_user_id')
            ->select('ge.id as record_id', 'e.student_id', 'e.academic_year_id', 'e.course_id',
                'ge.osce_score as score', 'oc.max_score', 'ge.status', 'ge.score as total_score', 'ge.clinical_score',
                'ge.written_score', 'ge.created_at', 'ge.updated_at', 's.full_name_ar as student_name',
                's.university_number', 'c.code as course_code', 'c.name_ar as course_name',
                'u.name as supervisor_name', 'ge.osce_recorded_by_user_id as supervisor_id');
    }

    private function applyFilters($query, string $type, array $filters): void
    {
        if (! empty($filters['course_id'])) $query->where($type === 'clinical' ? 'r.course_id' : ($type === 'mini_osce' ? 'r.course_id' : 'e.course_id'), $filters['course_id']);
        if (! empty($filters['student'])) {
            $needle = str_replace(['%', '_'], ['\\%', '\\_'], trim($filters['student']));
            $query->where(fn ($q) => $q->where('s.full_name_ar', 'like', "%{$needle}%")
                ->orWhere('s.university_number', 'like', "%{$needle}%"));
        }
        if ($type === 'final_osce') {
            if (! empty($filters['status'])) $query->where('ge.status', $filters['status']);
            if (! empty($filters['issues_only'])) $query->where(fn ($q) => $q->whereNull('ge.osce_score')
                ->orWhereColumn('ge.osce_score', '>', 'oc.max_score')
                ->orWhere(fn ($sub) => $sub->whereNotNull('ge.osce_score')->where(fn ($max) => $max
                    ->whereNull('oc.max_score')->orWhere('oc.max_score', '<=', 0)))
                ->orWhereRaw('(ge.clinical_score IS NOT NULL AND ge.osce_score IS NOT NULL AND ge.written_score IS NOT NULL AND ge.score IS NOT NULL AND ABS(ge.score - ge.clinical_score - ge.osce_score - ge.written_score) > 0.01)'));
            return;
        }
        if (! empty($filters['supervisor_id'])) $query->where($type === 'clinical' ? 'ca.evaluator_person_id' : 'm.entered_by_person_id', $filters['supervisor_id']);
        if (! empty($filters['group_id']) || ! empty($filters['subgroup_id'])) {
            if ($type === 'clinical') {
                if (! empty($filters['group_id'])) $query->where('g.id', $filters['group_id']);
                if (! empty($filters['subgroup_id'])) $query->where('sg.id', $filters['subgroup_id']);
            } else {
                $query->whereExists(function ($sub) use ($filters) {
                    $sub->selectRaw('1')->from('student_clinical_assignments as ma')
                        ->join('student_subgroups as msg', 'msg.id', '=', 'ma.student_subgroup_id')
                        ->whereColumn('ma.student_id', 'm.student_id')
                        ->whereColumn('ma.rotation_block_id', 'm.rotation_block_id')
                        ->whereColumn('ma.distribution_version_id', 'm.distribution_version_id');
                    if (! empty($filters['group_id'])) $sub->where('msg.student_group_id', $filters['group_id']);
                    if (! empty($filters['subgroup_id'])) $sub->where('msg.id', $filters['subgroup_id']);
                });
            }
        }
        if ($type === 'clinical') {
            if (! empty($filters['week'])) $query->where('ca.evaluation_week', $filters['week']);
            if (! empty($filters['status'])) $query->where('ca.status', $filters['status']);
        } elseif (! empty($filters['week'])) $query->where('b.from_week', '<=', $filters['week'])->where('b.to_week', '>=', $filters['week']);
        if (($filters['version'] ?? 'all') === 'current') $query->where('v.status', 'published')->where('v.is_current', true);
        if (($filters['version'] ?? 'all') === 'historical') $query->where('v.status', 'published')->where('v.is_current', false);
        if (! empty($filters['issues_only'])) {
            if ($type === 'clinical') $query->where('ca.status', '<>', 'superseded');
            else $query->whereNull('m.superseded_at');
            $query->where(function ($q) use ($type) {
                $q->whereNull('v.id')->orWhere('v.status', '<>', 'published')->orWhere('v.is_current', false);
                if ($type === 'clinical') {
                    $q->orWhereColumn('ca.student_id', '<>', 'a.student_id')
                        ->orWhereColumn('ca.evaluator_person_id', '<>', 'a.supervisor_id')
                        ->orWhere('ca.score', '<', 0)->orWhereNull('ca.max_score')->orWhere('ca.max_score', '<=', 0)
                        ->orWhereColumn('ca.score', '>', 'ca.max_score')
                        ->orWhere(fn ($sub) => $sub->whereIn('ca.status', ['submitted', 'approved'])->whereNull('ca.score'))
                        ->orWhere(fn ($sub) => $sub->where('ca.assessment_kind', 'weekly')
                            ->where(fn ($weeks) => $weeks->whereNull('ca.evaluation_week')
                                ->orWhereColumn('ca.evaluation_week', '<', 'b.from_week')
                                ->orWhereColumn('ca.evaluation_week', '>', 'b.to_week')))
                        ->orWhere(fn ($sub) => $sub->where('ca.assessment_kind', 'period')
                            ->where(fn ($dates) => $dates->whereNull('ca.week_start')->orWhereNull('ca.week_end')
                                ->orWhereColumn('ca.week_start', '>', 'ca.week_end')))
                        ->orWhereExists(fn ($sub) => $sub->selectRaw('1')
                            ->from('clinical_assessments as ca2')
                            ->join('student_clinical_assignments as a2', 'a2.id', '=', 'ca2.student_clinical_assignment_id')
                            ->join('rotation_blocks as b2', 'b2.id', '=', 'a2.rotation_block_id')
                            ->whereColumn('ca2.student_id', 'ca.student_id')
                            ->whereColumn('ca2.assessment_kind', 'ca.assessment_kind')
                            ->whereColumn('b2.rotation_id', 'b.rotation_id')
                            ->whereRaw('(ca2.evaluation_week = ca.evaluation_week OR (ca2.evaluation_week IS NULL AND ca.evaluation_week IS NULL))')
                            ->whereRaw("(ca.assessment_kind <> 'period' OR (ca2.week_start <= ca.week_end AND ca2.week_end >= ca.week_start))")
                            ->whereColumn('ca2.id', '<>', 'ca.id')
                            ->where('ca2.status', '<>', 'superseded')
                            ->whereColumn('a2.distribution_version_id', 'a.distribution_version_id'));
                } else {
                    $q->orWhere('m.score', '<', 0)->orWhereNull('m.max_score')->orWhere('m.max_score', '<=', 0)
                        ->orWhereColumn('m.score', '>', 'm.max_score')
                        ->orWhereNull('m.score');
                    $q->orWhereNotExists(fn ($sub) => $sub->selectRaw('1')
                        ->from('student_clinical_assignments as ma')
                        ->whereColumn('ma.distribution_version_id', 'm.distribution_version_id')
                        ->whereColumn('ma.student_id', 'm.student_id')
                        ->whereColumn('ma.rotation_block_id', 'm.rotation_block_id')
                        ->whereColumn('ma.supervisor_id', 'm.entered_by_person_id'))
                        ->orWhereExists(fn ($sub) => $sub->selectRaw('1')
                            ->from('clinical_mini_osce_scores as m2')
                            ->whereColumn('m2.student_id', 'm.student_id')
                            ->whereColumn('m2.rotation_block_id', 'm.rotation_block_id')
                            ->whereColumn('m2.distribution_version_id', 'm.distribution_version_id')
                            ->whereNull('m2.superseded_at')
                            ->whereColumn('m2.id', '<>', 'm.id'));
                }
            });
        }
    }

    private function present(object $row, string $type): array
    {
        $data = (array) $row;
        $data['type'] = $type;
        $data['finding'] = match (true) {
            $type === 'final_osce' && $row->score === null => 'missing_osce',
            $type === 'final_osce' && ($row->max_score === null || (float) $row->max_score <= 0
                || (float) $row->score < 0 || (float) $row->score > (float) $row->max_score) => 'invalid_score',
            $type === 'final_osce' && $row->total_score !== null && $row->clinical_score !== null
                && $row->written_score !== null
                && abs((float) $row->total_score - (float) $row->clinical_score
                    - (float) $row->score - (float) $row->written_score) > 0.01 => 'grade_total_mismatch',
            $type === 'final_osce' => 'current',
            $row->version_id === null => 'unlinked',
            $row->version_status !== 'published' => 'unpublished',
            $type === 'clinical' && $row->status === 'superseded' => 'superseded',
            $type === 'mini_osce' && $row->superseded_at !== null => 'superseded',
            ! (bool) $row->is_current => 'historical',
            $type === 'clinical' && ((int) $row->student_id !== (int) $row->assigned_student_id
                || (int) $row->supervisor_id !== (int) $row->assigned_supervisor_id) => 'assignment_mismatch',
            $type === 'clinical' && ! in_array($row->status, ['submitted', 'approved'], true) => 'not_submitted',
            $type === 'clinical' && $row->assessment_kind === 'weekly'
                && ($row->evaluation_week === null || $row->evaluation_week < $row->from_week
                    || $row->evaluation_week > $row->to_week) => 'week_outside_assignment',
            $type === 'clinical' && $row->assessment_kind === 'period'
                && (! $row->week_start || ! $row->week_end || $row->week_start > $row->week_end) => 'period_dates_missing',
            $row->score === null || $row->max_score === null || (float) $row->max_score <= 0
                || (float) $row->score < 0 || (float) $row->score > (float) $row->max_score => 'invalid_score',
            default => 'current',
        };
        if ($data['finding'] === 'historical') {
            $service = app(ClinicalAssessmentAdminService::class);
            $plan = $type === 'clinical'
                ? $service->restorePlan(ClinicalAssessment::findOrFail($row->record_id))
                : $service->miniRestorePlan(DB::table('clinical_mini_osce_scores')->where('id', $row->record_id)->first());
            $data['finding'] = $plan['reason'] ?? 'restorable';
        } elseif ($data['finding'] === 'current' && $type === 'clinical') {
            $duplicate = ClinicalAssessment::query()->whereKeyNot($row->record_id)
                ->where('status', '<>', 'superseded')
                ->where('student_id', $row->student_id)
                ->where('assessment_kind', $row->assessment_kind)->where('evaluation_week', $row->evaluation_week)
                ->when($row->assessment_kind === 'period' && $row->week_start && $row->week_end,
                    fn ($q) => $q->whereDate('week_start', '<=', $row->week_end)
                        ->whereDate('week_end', '>=', $row->week_start))
                ->whereHas('clinicalAssignment', fn ($q) => $q
                    ->where('distribution_version_id', $row->version_id)
                    ->whereHas('rotationBlock', fn ($b) => $b->where('rotation_id', $row->rotation_id)))
                ->exists();
            if ($duplicate) $data['finding'] = 'duplicate_current';
        } elseif ($data['finding'] === 'current' && $type === 'mini_osce') {
            $scope = $this->currentMiniPeriod(DB::table('clinical_mini_osce_scores')->where('id', $row->record_id)->first());
            $duplicate = DB::table('clinical_mini_osce_scores')->where('id', '<>', $row->record_id)
                ->where('distribution_version_id', $row->version_id)->where('student_id', $row->student_id)
                ->whereIn('rotation_block_id', $scope['period']['block_ids']->all() ?? [$row->rotation_block_id])
                ->whereNull('superseded_at')->exists();
            if (! $scope || (int) $scope['supervisor_id'] !== (int) $row->supervisor_id) $data['finding'] = 'assignment_mismatch';
            elseif ($duplicate) $data['finding'] = 'duplicate_current';
        }
        return $data;
    }
    private function weekStart($rotationStart, int $week, int $versionId): Carbon
    {
        return Carbon::parse($this->dateCalculator->calculateBlockStartDate(
            $rotationStart,
            $week,
            $this->breaksForVersion($versionId),
        ));
    }

    private function breaksForVersion(int $versionId): array
    {
        return $this->breakCache[$versionId] ??= DB::table('distribution_version_breaks')
            ->where('distribution_version_id', $versionId)
            ->orderBy('start_date')->get(['start_date', 'end_date'])
            ->map(fn ($break) => ['start_date' => $break->start_date, 'end_date' => $break->end_date])->all();
    }
}
