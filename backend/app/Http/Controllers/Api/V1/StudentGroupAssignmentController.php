<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentGroupAssignmentRequest;
use App\Http\Responses\ApiResponse;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class StudentGroupAssignmentController extends Controller
{
    /**
     * Assign a student to a group while retaining the previous membership.
     * A current assignment is never deleted: it is closed with valid_until.
     */
    public function store(StoreStudentGroupAssignmentRequest $request): JsonResponse
    {
        $data = $request->validated();
        $group = StudentGroup::findOrFail($data['student_group_id']);

        if ((int) $group->academic_year_id !== (int) $data['academic_year_id']) {
            throw ValidationException::withMessages([
                'student_group_id' => ['The selected group does not belong to the selected academic year.'],
            ]);
        }

        if (! empty($data['student_subgroup_id'])) {
            $subgroup = StudentSubgroup::findOrFail($data['student_subgroup_id']);
            if ((int) $subgroup->student_group_id !== (int) $group->id) {
                throw ValidationException::withMessages([
                    'student_subgroup_id' => ['The selected subgroup does not belong to the selected group.'],
                ]);
            }
        }

        $approvedBy = $request->user()?->name;
        $assignment = DB::transaction(function () use ($data, $approvedBy) {
            $effectiveFrom = $data['valid_from'] ?? now()->toDateString();

            // Lock the stable parent row to serialize assignments even when
            // no current assignment exists yet for this student/year.
            Student::whereKey($data['student_id'])->lockForUpdate()->firstOrFail();

            $currentAssignments = StudentGroupAssignment::query()
                ->where('student_id', $data['student_id'])
                ->where('academic_year_id', $data['academic_year_id'])
                ->whereNull('valid_until')
                ->lockForUpdate()
                ->get();

            if ($currentAssignments->contains(
                fn (StudentGroupAssignment $current) => $current->valid_from?->gt($effectiveFrom)
            )) {
                throw ValidationException::withMessages([
                    'valid_from' => ['The effective date cannot precede the current assignment start date.'],
                ]);
            }

            StudentGroupAssignment::query()
                ->whereIn('id', $currentAssignments->pluck('id')->all())
                ->update(['valid_until' => $effectiveFrom]);

            return StudentGroupAssignment::create([
                ...$data,
                'valid_from' => $effectiveFrom,
                'approved_by' => $approvedBy,
            ]);
        });

        return ApiResponse::success(
            $assignment->load(['student', 'academicYear', 'group', 'subgroup']),
            'Student group assignment saved.',
            [],
            201,
        );
    }
}
