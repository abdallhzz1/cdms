<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentGroupAssignmentRequest;
use App\Http\Responses\ApiResponse;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
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

        $assignment = DB::transaction(function () use ($data) {
            $effectiveFrom = $data['valid_from'] ?? now()->toDateString();

            StudentGroupAssignment::query()
                ->where('student_id', $data['student_id'])
                ->where('academic_year_id', $data['academic_year_id'])
                ->whereNull('valid_until')
                ->update(['valid_until' => $effectiveFrom]);

            return StudentGroupAssignment::create([
                ...$data,
                'valid_from' => $effectiveFrom,
                'approved_by' => optional($request->user())->name,
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
