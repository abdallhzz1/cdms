<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AdvisingRecord;
use App\Models\Person;
use App\Models\Student;
use App\Models\User;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AdvisingRecordController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function overview(Request $request): JsonResponse
    {
        $base = $this->applyStudentAccessScope(Student::query())
            ->where('registration_status', 'active')
            ->when($request->filled('academic_level'), fn ($query) => $query->where('academic_level', (string) $request->query('academic_level')))
            ->when($request->filled('advisor_id'), function ($query) use ($request) {
                $advisorIds = $this->resolveAdvisorPersonIds($request->integer('advisor_id'));
                $advisorIds->isEmpty() ? $query->whereRaw('1 = 0') : $query->whereIn('academic_advisor_id', $advisorIds);
            })
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim((string) $request->query('search'));
                $query->where(fn ($student) => $student
                    ->where('university_number', 'like', "%{$search}%")
                    ->orWhere('full_name_ar', 'like', "%{$search}%")
                    ->orWhere('full_name_en', 'like', "%{$search}%"));
            });

        $studentIds = (clone $base)->select('students.id');
        $totalStudents = (clone $base)->count();
        $atRiskStudents = (clone $base)->where(fn ($query) => $query
            ->where('warning_count', '>', 0)
            ->orWhere(fn ($gpa) => $gpa->whereNotNull('gpa')->where('gpa', '>', 0)->where('gpa', '<', 65)))
            ->count();
        $withoutAdvisor = (clone $base)->whereNull('academic_advisor_id')->count();

        $recordQuery = AdvisingRecord::query()->whereIn('student_id', $studentIds);
        $openCases = (clone $recordQuery)->where('status', 'open')->count();
        $sessionsThisMonth = (clone $recordQuery)
            ->whereBetween('meeting_date', [now()->startOfMonth()->toDateString(), now()->endOfMonth()->toDateString()])
            ->count();

        $students = (clone $base)
            ->with('academicAdvisor:id,full_name_ar,full_name_en,user_id')
            ->withCount(['advisingRecords as open_advising_count' => fn ($query) => $query->where('status', 'open')])
            ->withMax('advisingRecords', 'meeting_date')
            ->orderByDesc('warning_count')
            ->orderByRaw('CASE WHEN gpa IS NULL THEN 1 ELSE 0 END')
            ->orderBy('gpa')
            ->limit(40)
            ->get([
                'id', 'university_number', 'full_name_ar', 'full_name_en', 'photo_url',
                'academic_level', 'gpa', 'warning_count', 'academic_advisor_id',
            ]);

        $recentRecords = (clone $recordQuery)
            ->with(['student:id,university_number,full_name_ar,full_name_en', 'advisor:id,full_name_ar,full_name_en'])
            ->latest('meeting_date')
            ->limit(6)
            ->get();

        $levelCounts = (clone $base)
            ->select('academic_level', DB::raw('COUNT(*) as total'))
            ->groupBy('academic_level')
            ->pluck('total', 'academic_level');
        $statusCounts = (clone $recordQuery)
            ->select('status', DB::raw('COUNT(*) as total'))
            ->groupBy('status')
            ->pluck('total', 'status');

        return ApiResponse::success([
            'metrics' => [
                'students' => $totalStudents,
                'at_risk' => $atRiskStudents,
                'without_advisor' => $withoutAdvisor,
                'open_cases' => $openCases,
                'sessions_this_month' => $sessionsThisMonth,
            ],
            'level_counts' => [
                'fourth' => (int) ($levelCounts['fourth'] ?? 0),
                'fifth' => (int) ($levelCounts['fifth'] ?? 0),
                'sixth' => (int) ($levelCounts['sixth'] ?? 0),
            ],
            'status_counts' => $statusCounts,
            'students' => $students,
            'recent_records' => $recentRecords,
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $studentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');

        $items = AdvisingRecord::with(['student', 'advisor'])
            ->whereIn('student_id', $studentIds)
            ->when($request->filled('student_id'), fn ($query) => $query->where('student_id', $request->integer('student_id')))
            ->when($request->filled('status'), fn ($query) => $query->where('status', (string) $request->query('status')))
            ->when($request->filled('category'), fn ($query) => $query->where('category', (string) $request->query('category')))
            ->when($request->filled('search'), function ($query) use ($request) {
                $search = trim((string) $request->query('search'));
                $query->whereHas('student', fn ($student) => $student
                    ->where('university_number', 'like', "%{$search}%")
                    ->orWhere('full_name_ar', 'like', "%{$search}%")
                    ->orWhere('full_name_en', 'like', "%{$search}%"));
            })
            ->latest('meeting_date')->paginate(max(1, min(100, $request->integer('per_page', 25))));

        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'],
            'advisor_person_id' => ['nullable', 'integer', 'exists:people,id'],
            'meeting_date' => ['required', 'date'],
            'category' => ['required', Rule::in(['general', 'academic', 'risk'])],
            'notes' => ['required', 'string', 'max:5000'],
            'action_plan' => ['nullable', 'string', 'max:5000'],
        ]);

        $student = Student::findOrFail($data['student_id']);
        $this->authorizeStudentAccess($student);

        if ($request->user()->hasRole('ACADEMIC_ADVISOR')) {
            $advisor = Person::firstOrCreate(
                ['user_id' => $request->user()->id],
                [
                    'full_name_ar' => $request->user()->name,
                    'full_name_en' => $request->user()->name,
                    'email' => $request->user()->email,
                    'is_active' => true,
                ],
            );
            $data['advisor_person_id'] = $advisor->id;
        }

        if (! empty($data['advisor_person_id'])) {
            $val = $data['advisor_person_id'];
            $person = Person::find($val);
            if ($person) {
                $data['advisor_person_id'] = $person->id;
            } else {
                $user = User::find($val);
                if ($user && $user->person_id) {
                    $data['advisor_person_id'] = $user->person_id;
                } else {
                    $personFromUser = Person::where('user_id', $val)->first();
                    $data['advisor_person_id'] = $personFromUser ? $personFromUser->id : null;
                }
            }
        }

        $record = AdvisingRecord::create($data + ['status' => 'open']);
        if (! $record->meeting_number) {
            $record->update(['meeting_number' => sprintf('ADV-%s-%05d', $record->meeting_date->format('Y'), $record->id)]);
        }

        return ApiResponse::success($record->load(['student', 'advisor']), 'Advising record created.', [], 201);
    }

    public function update(Request $request, AdvisingRecord $advisingRecord): JsonResponse
    {
        $this->authorizeStudentAccess($advisingRecord->student);

        $data = $request->validate([
            'meeting_date' => ['sometimes', 'date'],
            'category' => ['sometimes', Rule::in(['general', 'academic', 'risk'])],
            'notes' => ['sometimes', 'string', 'max:5000'],
            'action_plan' => ['nullable', 'string', 'max:5000'],
            'status' => ['sometimes', Rule::in(['open', 'closed'])],
            'follow_up_status' => ['nullable', Rule::in(['pending', 'in_progress', 'completed'])],
        ]);
        $advisingRecord->update($data);

        return ApiResponse::success($advisingRecord->fresh());
    }

    public function show(AdvisingRecord $advisingRecord): JsonResponse
    {
        $this->authorizeStudentAccess($advisingRecord->student);

        return ApiResponse::success($advisingRecord->load(['student', 'advisor', 'participants.student']));
    }

    private function resolveAdvisorPersonIds(int $candidateId): Collection
    {
        $user = User::find($candidateId);

        if ($user) {
            return Person::where('user_id', $user->id)
                ->pluck('id')
                ->map(fn ($id) => (int) $id)
                ->values();
        }

        return collect([Person::whereKey($candidateId)->value('id')])
            ->filter()
            ->map(fn ($id) => (int) $id)
            ->values();
    }
}
