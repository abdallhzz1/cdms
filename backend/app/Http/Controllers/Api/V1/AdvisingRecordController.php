<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AdvisingRecord;
use App\Models\Student;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AdvisingRecordController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $studentIds = $this->applyStudentAccessScope(Student::query())->select('students.id');

        $items = AdvisingRecord::with(['student', 'advisor'])
            ->whereIn('student_id', $studentIds)
            ->when($request->filled('student_id'), fn ($query) => $query->where('student_id', $request->integer('student_id')))
            ->latest('meeting_date')->paginate($request->integer('per_page', 25));
        return ApiResponse::success($items->items(), null, ['current_page' => $items->currentPage(), 'last_page' => $items->lastPage(), 'total' => $items->total()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'student_id' => ['required', 'exists:students,id'],
            'advisor_person_id' => ['nullable'],
            'meeting_date' => ['required', 'date'],
            'category' => ['required', Rule::in(['general', 'academic', 'risk'])],
            'notes' => ['required', 'string', 'max:5000'],
            'action_plan' => ['nullable', 'string', 'max:5000'],
        ]);

        $student = Student::findOrFail($data['student_id']);
        $this->authorizeStudentAccess($student);

        if (!empty($data['advisor_person_id'])) {
            $val = $data['advisor_person_id'];
            $person = \App\Models\Person::find($val);
            if ($person) {
                $data['advisor_person_id'] = $person->id;
            } else {
                $user = \App\Models\User::find($val);
                if ($user && $user->person_id) {
                    $data['advisor_person_id'] = $user->person_id;
                } else {
                    $personFromUser = \App\Models\Person::where('user_id', $val)->first();
                    $data['advisor_person_id'] = $personFromUser ? $personFromUser->id : null;
                }
            }
        }

        $record = AdvisingRecord::create($data);
        return ApiResponse::success($record->load(['student', 'advisor']), 'Advising record created.', [], 201);
    }

    public function update(Request $request, AdvisingRecord $advisingRecord): JsonResponse
    {
        $this->authorizeStudentAccess($advisingRecord->student);

        $data = $request->validate(['notes' => ['sometimes', 'string', 'max:5000'], 'action_plan' => ['nullable', 'string', 'max:5000'], 'status' => ['sometimes', Rule::in(['open', 'closed'])]]);
        $advisingRecord->update($data);
        return ApiResponse::success($advisingRecord->fresh());
    }
    public function show(AdvisingRecord $advisingRecord): JsonResponse
    {
        $this->authorizeStudentAccess($advisingRecord->student);

        return ApiResponse::success($advisingRecord->load(['student','advisor','participants.student']));
    }
}
