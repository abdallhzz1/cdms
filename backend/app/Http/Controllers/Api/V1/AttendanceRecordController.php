<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AttendanceRecordController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceRecord::with(['student', 'session.trainingSite']);

        $userDeptId = $this->getUserDepartmentId();
        if ($userDeptId) {
            $query->whereHas('session.course', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }

        $records = $query
            ->when($request->filled('clinical_session_id'), fn ($q) => $q->where('clinical_session_id', $request->integer('clinical_session_id')))
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->latest()
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success($records->items(), null, [
            'current_page' => $records->currentPage(),
            'last_page' => $records->lastPage(),
            'total' => $records->total(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'clinical_session_id' => ['required', 'exists:clinical_sessions,id'],
            'student_id' => ['required', 'exists:students,id'],
            'status' => ['required', Rule::in(AttendanceRecord::STATUSES)],
            'excuse_note' => ['nullable', 'string', 'max:2000'],
        ]);

        $record = AttendanceRecord::updateOrCreate(
            ['clinical_session_id' => $data['clinical_session_id'], 'student_id' => $data['student_id']],
            $data,
        );

        return ApiResponse::success($record, 'Attendance recorded.');
    }
}
