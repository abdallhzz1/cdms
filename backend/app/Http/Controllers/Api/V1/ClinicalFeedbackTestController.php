<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\Rotation;
use App\Models\Student;
use App\Services\ClinicalStudentFeedback;
use App\Services\DepartmentHeadCourseScope;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ClinicalFeedbackTestController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function __construct(private ClinicalStudentFeedback $feedback) {}

    private function studentsQuery()
    {
        $q = app(DepartmentHeadCourseScope::class)->students(Student::query())
            ->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])->where('registration_status', 'active')->where('academic_registration_status', 'registered');
        $levels = $this->getEffectiveAcademicLevelScope();

        return $levels === null ? $q : $q->whereIn('academic_level', $levels);
    }

    private function rotationIds()
    {
        $q = app(DepartmentHeadCourseScope::class)->rotations(Rotation::query());
        $levels = $this->getEffectiveAcademicLevelScope();

        return ($levels === null ? $q : $q->whereIn('academic_level', $levels))->pluck('rotations.id');
    }

    private function run(Request $request, string $run, bool $active = true, bool $lock = false)
    {
        $q = DB::table('clinical_feedback_test_runs')->where('id', $run)->where('created_by', $request->user()->id);
        if ($active) {
            $q->where('expires_at', '>', now())->whereIn('student_id', $this->studentsQuery()->select('students.id'));
        }

        return ($lock ? $q->lockForUpdate() : $q)->firstOrFail();
    }

    private function audit(Request $request, string $action, string $run): void
    {
        AuditLog::create(['user_id' => $request->user()->id, 'action' => 'clinical_feedback.test_'.$action, 'entity_type' => 'clinical_feedback_test_actor', 'entity_id' => $request->user()->id, 'changes' => ['is_test' => true, 'test_run_id' => $run]]);
    }

    public function students(Request $request)
    {
        $data = $request->validate(['search' => ['required', 'string', 'min:2', 'max:100']]);
        $term = addcslashes(trim($data['search']), '%_\\');
        $rows = $this->studentsQuery()->where(fn ($q) => $q->where('university_number', 'like', '%'.$term.'%')->orWhere('full_name_ar', 'like', '%'.$term.'%')->orWhere('full_name_en', 'like', '%'.$term.'%'))
            ->orderBy('university_number')->limit(20)->get(['id', 'university_number', 'full_name_ar', 'full_name_en']);

        return ApiResponse::success($rows);
    }

    public function index(Request $request)
    {
        $request->validate(['page' => ['sometimes', 'integer', 'min:1', 'max:10000']]);
        $rows = DB::table('clinical_feedback_test_runs as runs')->join('students', 'students.id', '=', 'runs.student_id')
            ->where('runs.created_by', $request->user()->id)->whereIn('runs.student_id', $this->studentsQuery()->select('students.id'))
            ->orderByDesc('runs.created_at')->orderBy('runs.id')->paginate(20, ['runs.id', 'runs.expires_at', 'students.university_number', 'students.full_name_ar', 'students.full_name_en']);
        $items = collect($rows->items());
        $counts = DB::table('clinical_feedback_test_answers')->whereIn('test_run_id', $items->pluck('id'))->selectRaw('test_run_id, COUNT(*) as count')->groupBy('test_run_id')->pluck('count', 'test_run_id');

        return ApiResponse::success(['runs' => $items->map(fn ($r) => (array) $r + ['answers_count' => (int) ($counts[$r->id] ?? 0), 'is_active' => now()->lt($r->expires_at)]), 'current_page' => $rows->currentPage(), 'last_page' => $rows->lastPage()]);
    }

    public function create(Request $request)
    {
        $data = $request->validate(['student_id' => ['required', 'integer']]);
        $student = $this->studentsQuery()->findOrFail($data['student_id']);
        $id = Str::uuid()->toString();
        DB::transaction(function () use ($request, $student, $id) {
            DB::table('clinical_feedback_test_runs')->insert(['id' => $id, 'student_id' => $student->id, 'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now(), 'expires_at' => now()->addHours(8)]);
            $this->audit($request, 'started', $id);
        });

        return ApiResponse::success(['id' => $id]);
    }

    public function identity(Request $request, string $run)
    {
        $row = $this->run($request, $run);

        return ApiResponse::success(['student' => $this->studentsQuery()->findOrFail($row->student_id)->only(['university_number', 'full_name_ar', 'full_name_en'])]);
    }

    public function marks(Request $request, string $run)
    {
        $row = $this->run($request, $run);
        $answers = DB::table('clinical_feedback_test_answers')->where('test_run_id', $run)->get()->keyBy(fn ($a) => $a->window_id.'|'.$a->slot_key);
        $student = $this->studentsQuery()->findOrFail($row->student_id);
        $rotationIds = $this->rotationIds();
        $catalog = $this->feedback->catalog($student)->keyBy('key');
        $slots = collect($this->feedback->forStudent($student, $answers))->filter(fn ($s) => $rotationIds->contains($s['rotation_id']))->map(function ($s) use ($catalog, $answers) {
            $slot = $catalog->get($s['key']);
            if (! $slot) {
                return $s;
            }
            $a = $answers->get($slot['window']->id.'|'.$slot['slot_key']);

            return $s + ($a ? ['test_response' => ['id' => $a->id, 'experience' => $a->experience, 'supervision' => $a->supervision, 'comment' => $a->private_comment ? Crypt::decryptString($a->private_comment) : null]] : []);
        })->values();

        return ApiResponse::success(['slots' => $slots, 'is_test' => true]);
    }

    public function participate(Request $request, string $run)
    {
        $data = $request->validate(['key' => ['required', 'string', 'size:64'], 'experience' => ['required', 'integer', 'between:0,5'], 'supervision' => ['required', 'integer', 'between:0,5'], 'comment' => ['nullable', 'string', 'max:2000']]);
        DB::transaction(function () use ($request, $run, $data) {
            $row = $this->run($request, $run, true, true);
            $student = $this->studentsQuery()->findOrFail($row->student_id);
            $slot = $this->feedback->readySlot($student, $data['key']);
            abort_unless($this->rotationIds()->contains($slot['rotation']->id), 404);
            $scope = ['test_run_id' => $run, 'window_id' => $slot['window']->id, 'slot_key' => $slot['slot_key']];
            if (DB::table('clinical_feedback_test_answers')->where($scope)->exists()) {
                return;
            }
            DB::table('clinical_feedback_test_answers')->insert($scope + ['id' => Str::uuid()->toString(), 'experience' => $data['experience'] ?: null, 'supervision' => $data['supervision'] ?: null, 'private_comment' => filled($data['comment'] ?? null) ? Crypt::encryptString(trim($data['comment'])) : null]);
            $this->audit($request, 'answered', $run);
        }, 3);

        return ApiResponse::success(null);
    }

    public function deleteAnswer(Request $request, string $run, string $answer)
    {
        DB::transaction(function () use ($request, $run, $answer) {
            $this->run($request, $run, false, true);
            $row = DB::table('clinical_feedback_test_answers')->where('test_run_id', $run)->where('id', $answer)->firstOrFail();
            DB::table('clinical_feedback_test_answers')->where('id', $row->id)->delete();
            $this->audit($request, 'answer_deleted', $run);
        }, 3);

        return ApiResponse::success(null);
    }

    public function destroy(Request $request, string $run)
    {
        DB::transaction(function () use ($request, $run) {
            $this->run($request, $run, false, true);
            DB::table('clinical_feedback_test_runs')->where('id', $run)->delete();
            $this->audit($request, 'deleted', $run);
        }, 3);

        return ApiResponse::success(null);
    }
}
