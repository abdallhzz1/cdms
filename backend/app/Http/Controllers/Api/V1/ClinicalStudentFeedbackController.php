<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\ClinicalFeedbackWindow;
use App\Models\Person;
use App\Models\Rotation;
use App\Services\ClinicalStudentFeedback;
use App\Services\DepartmentHeadCourseScope;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class ClinicalStudentFeedbackController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(private ClinicalStudentFeedback $service) {}

    private function rotations()
    {
        $q = app(DepartmentHeadCourseScope::class)->rotations(Rotation::query())->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])->whereNotNull('course_id');
        $levels = $this->getEffectiveAcademicLevelScope();
        if ($levels !== null) {
            $q->whereIn('academic_level', $levels);
        }

        return $q;
    }

    private function window(int $id): ClinicalFeedbackWindow
    {
        return ClinicalFeedbackWindow::whereIn('rotation_id', $this->rotations()->select('rotations.id'))->findOrFail($id);
    }

    public function options()
    {
        $rotations = $this->rotations()->where(fn ($q) => $q->whereHas('distributionVersions', fn ($v) => $v->where('is_current', true)->where('status', 'published'))
            ->orWhereIn('rotations.id', ClinicalFeedbackWindow::query()->select('rotation_id')))
            ->with(['academicYear', 'clinicalPeriod', 'course'])->orderByDesc('academic_year_id')->orderByDesc('start_date')->get();
        $windows = ClinicalFeedbackWindow::whereIn('rotation_id', $rotations->pluck('id'))->get()->keyBy('rotation_id');

        return ApiResponse::success(['student_url' => '/portal/clinical-assessments', 'minimum_responses' => 1,
            'rotations' => $rotations->map(function ($r) use ($windows) {
                $w = $windows->get($r->id);

                return ['id' => $r->id, 'course_ar' => $r->course->name_ar, 'course_en' => $r->course->name_en, 'year' => $r->academicYear?->code,
                    'clinical_period_id' => $r->clinical_period_id, 'period_key' => $r->academic_year_id.'|'.($r->clinical_period_id ?: 'unlinked'),
                    'period_ar' => $r->clinicalPeriod?->name_ar ?: __('clinical_feedback.unassigned_period', [], 'ar'), 'period_en' => $r->clinicalPeriod?->name_en ?: __('clinical_feedback.unassigned_period', [], 'en'),
                    'academic_level' => $r->academic_level, 'window_id' => $w?->id, 'is_enabled' => (bool) $w?->is_enabled, 'from_week' => $w?->from_week ?? 1,
                    'ends_on' => ($r->clinicalPeriod?->end_date ?: $r->end_date)?->toDateString(), 'weeks' => min(60, max(1, $r->duration_weeks))];
            })->values()]);
    }

    public function configure(Request $request, Rotation $rotation)
    {
        $this->rotations()->whereKey($rotation->id)->firstOrFail();
        $data = $request->validate(['is_enabled' => ['required', 'boolean'], 'from_week' => ['required', 'integer', 'between:1,'.min(60, max(1, $rotation->duration_weeks))]]);
        $window = DB::transaction(function () use ($rotation, $data, $request) {
            Rotation::whereKey($rotation->id)->lockForUpdate()->firstOrFail();

            return ClinicalFeedbackWindow::updateOrCreate(['rotation_id' => $rotation->id], $data + ['updated_by' => $request->user()->id]);
        });
        $this->service->audit($request->user(), 'clinical_feedback.configured', $window->id, $data);

        return ApiResponse::success(['window_id' => $window->id]);
    }

    public function publishMarks(Request $request, int $window)
    {
        $data = $request->validate(['from_week' => ['required', 'integer', 'between:1,60'], 'to_week' => ['required', 'integer', 'gte:from_week', 'max:60']]);

        return ApiResponse::success(['published' => $this->service->publishMarks($this->window($window), $request->user(), $data['from_week'], $data['to_week'])]);
    }

    public function publishReports(Request $request, int $window)
    {
        $this->window($window);

        // Compatibility for previously deployed clients; responses are already visible.
        return ApiResponse::success(['published_batches' => 0, 'automatic' => true]);
    }

    private function visibleAnswers(Request $request)
    {
        $own = Person::where(function ($q) use ($request) {
            $q->where('user_id', $request->user()->id);
            if ($request->user()->person_id) {
                $q->orWhereKey($request->user()->person_id);
            }
        })->pluck('id');
        $windows = ClinicalFeedbackWindow::whereIn('rotation_id', $this->rotations()->select('rotations.id'))->select('id');

        return DB::table('clinical_feedback_answers')->whereIn('window_id', $windows)->whereNotIn('supervisor_id', $own)
            ->when($request->filled('window_id'), fn ($q) => $q->where('window_id', $request->integer('window_id')));
    }

    public function reports(Request $request)
    {
        $data = $request->validate(['window_id' => ['required', 'integer', 'min:1']]);
        $this->window((int) $data['window_id']);
        $groups = $this->visibleAnswers($request)->select('window_id', 'supervisor_id', 'slot_key', 'from_week', 'to_week')
            ->selectRaw('COUNT(*) as responses, AVG(experience) as experience, AVG(supervision) as supervision')
            ->groupBy('window_id', 'supervisor_id', 'slot_key', 'from_week', 'to_week')->orderBy('from_week')->orderBy('supervisor_id')->get();
        $people = Person::whereIn('id', $groups->pluck('supervisor_id'))->get()->keyBy('id');

        return ApiResponse::success($groups->map(function ($b) use ($people) {
            // Aggregate all responses for this assessment and supervisor, including legacy batches.
            $average = fn ($key) => $b->$key === null ? null : round((float) $b->$key, 2);

            return ['id' => hash('sha256', $b->window_id.'|'.$b->slot_key.'|'.$b->supervisor_id), 'window_id' => $b->window_id, 'from_week' => $b->from_week, 'to_week' => $b->to_week, 'responses' => (int) $b->responses,
                'supervisor_ar' => $people->get($b->supervisor_id)?->full_name_ar, 'supervisor_en' => $people->get($b->supervisor_id)?->full_name_en,
                'experience' => $average('experience'), 'supervision' => $average('supervision')];
        })->values());
    }

    public function comments(Request $request)
    {
        $data = $request->validate(['window_id' => ['required', 'integer', 'min:1']]);
        $this->window((int) $data['window_id']);
        $moderator = $request->user()->can('permission', 'clinical_feedback.moderate');
        $rows = $this->visibleAnswers($request)
            ->whereNotNull($moderator ? 'private_comment' : 'reviewed_comment')->orderBy('id')->paginate(25);
        // No answer bundles, ratings, precise times, student IDs or participation lists.
        $people = Person::whereIn('id', collect($rows->items())->pluck('supervisor_id'))->get()->keyBy('id');
        $items = collect($rows->items())->map(fn ($a) => ['id' => $a->id, 'window_id' => $a->window_id, 'from_week' => $a->from_week, 'to_week' => $a->to_week,
            'supervisor_ar' => $people->get($a->supervisor_id)?->full_name_ar, 'supervisor_en' => $people->get($a->supervisor_id)?->full_name_en, 'text' => Crypt::decryptString($moderator ? $a->private_comment : $a->reviewed_comment), 'version' => hash('sha256', ($a->reviewed_comment ?? '').'|'.$a->follow_up), 'reviewed_text' => $a->reviewed_comment ? Crypt::decryptString($a->reviewed_comment) : null, 'follow_up' => $a->follow_up]);
        if ($items->isNotEmpty()) {
            $this->service->audit($request->user(), 'clinical_feedback.comments_viewed', (int) $items->first()['window_id'], ['count' => $items->count()]);
        }

        return ApiResponse::success($items, null, ['current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage()]);
    }

    public function moderate(Request $request, string $answer)
    {
        $data = $request->validate(['version' => ['required', 'string', 'size:64'], 'text' => ['nullable', 'string', 'max:2000'], 'follow_up' => ['required', 'in:new,reviewed,resolved']]);

        return DB::transaction(function () use ($request, $answer, $data) {
            $row = $this->visibleAnswers($request)->where('id', $answer)->lockForUpdate()->first();
            abort_unless($row, 404);
            $current = hash('sha256', ($row->reviewed_comment ?? '').'|'.$row->follow_up);
            if (! hash_equals($current, $data['version'])) {
                throw ValidationException::withMessages(['version' => [__('clinical_feedback.comment_changed')]]);
            }
            $text = filled($data['text'] ?? null) ? Crypt::encryptString(trim($data['text'])) : null;
            DB::table('clinical_feedback_answers')->where('id', $row->id)->update(['reviewed_comment' => $text, 'follow_up' => $data['follow_up']]);
            $this->service->audit($request->user(), 'clinical_feedback.comment_moderated', $row->window_id, ['answer_id' => $row->id, 'follow_up' => $data['follow_up']]);

            return ApiResponse::success(['version' => hash('sha256', ($text ?? '').'|'.$data['follow_up'])]);
        }, 3);
    }
}
