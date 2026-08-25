<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AttendanceRecord;
use App\Models\StudentClinicalAssignment;
use App\Models\Student;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class AttendanceRecordController extends Controller
{
    use ScopesByDepartmentAndLevel;

    public function index(Request $request): JsonResponse
    {
        $query = AttendanceRecord::with(['student', 'session.trainingSite', 'session.rotationBlock.rotation.course', 'recorder:id,name,email']);

        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        $isSupervisorOnly = $this->isSupervisorOnly($roles);
        if ($isSupervisorOnly) {
            $personId = $user?->person?->id;
            $studentIds = StudentClinicalAssignment::query()
                ->where('supervisor_id', $personId ?: 0)
                ->whereHas('distributionVersion', fn ($distribution) => $distribution->where('status', 'published')->where('is_current', true))
                ->pluck('student_id');
            $query->whereIn('student_id', $studentIds);
        }

        $allowedStudentIds = $this->applyStudentAccessScope(Student::query())
            ->select('students.id');
        $query->whereIn('student_id', $allowedStudentIds);

        $userDeptId = $this->getUserDepartmentId();
        if ($userDeptId) {
            $query->whereHas('session.rotationBlock', function ($q) use ($userDeptId) {
                $q->where('department_id', $userDeptId);
            });
        }

        $records = $query
            ->when($request->filled('clinical_session_id'), fn ($q) => $q->where('clinical_session_id', $request->integer('clinical_session_id')))
            ->when($request->filled('student_id'), fn ($q) => $q->where('student_id', $request->integer('student_id')))
            ->when($request->filled('status'), fn ($q) => $q->where('status', $request->string('status')))
            ->when($request->filled('date'), fn ($q) => $q->whereHas('session', fn ($session) => $session->whereDate('session_date', $request->string('date'))))
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

        $student = Student::findOrFail($data['student_id']);
        $this->authorizeStudentAccess($student);
        $session = \App\Models\ClinicalSession::with('rotationBlock.rotation')->findOrFail($data['clinical_session_id']);
        $levelScope = $this->getEffectiveAcademicLevelScope();
        if ($levelScope !== null) {
            $sessionLevel = (string) $session->rotationBlock?->rotation?->academic_level;
            abort_unless(! empty($levelScope) && in_array($sessionLevel, $levelScope, true), 403, 'This session is outside your assigned cohort.');
        }

        $user = $request->user();
        $roles = $user?->roles()->pluck('code') ?? collect();
        if ($this->isSupervisorOnly($roles)) {
            $personId = $user?->person?->id;
            $ownsStudent = StudentClinicalAssignment::query()
                ->where('supervisor_id', $personId ?: 0)
                ->where('student_id', $data['student_id'])
                ->where('rotation_block_id', $session->rotation_block_id)
                ->where(function ($query) use ($session) {
                    $session->training_site_id
                        ? $query->where('training_site_id', $session->training_site_id)
                        : $query->whereNull('training_site_id');
                })
                ->whereHas('distributionVersion', fn ($distribution) => $distribution->where('status', 'published')->where('is_current', true))
                ->exists();
            abort_unless($ownsStudent, 403, 'You may only record attendance for students currently assigned to you.');
        }

        $data['recorded_by_user_id'] = $user?->id;

        $record = AttendanceRecord::updateOrCreate(
            ['clinical_session_id' => $data['clinical_session_id'], 'student_id' => $data['student_id']],
            $data,
        );

        return ApiResponse::success($record, 'Attendance recorded.');
    }

    private function isSupervisorOnly($roles): bool
    {
        return $roles->contains('CLINICAL_SUPERVISOR')
            && ! $roles->intersect(['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEPARTMENT_HEAD', 'DEAN', 'VICE_DEAN'])->count();
    }
}
