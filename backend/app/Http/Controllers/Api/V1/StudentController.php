<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentRequest;
use App\Http\Requests\V1\UpdateStudentRequest;
use App\Http\Resources\V1\StudentResource;
use App\Http\Responses\ApiResponse;
use App\Models\Student;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class StudentController extends Controller
{
    /**
     * GET /api/v1/students
     * Permission: students.view
     *
     * Supports filtering: academic_level, academic_year_id, registration_status,
     * academic_advisor_id, warning_count_min, search (name/number).
     */
    public function index(Request $request): JsonResponse
    {
        $students = Student::with(['academicYear', 'academicAdvisor', 'currentGroupAssignments.group'])
            ->when(
                $request->query('academic_level'),
                fn ($q, $l) => $q->where('academic_level', $l)
            )
            ->when(
                $request->query('academic_year_id'),
                fn ($q, $y) => $q->where('academic_year_id', $y)
            )
            ->when(
                $request->query('registration_status'),
                fn ($q, $s) => $q->where('registration_status', $s)
            )
            ->when(
                $request->query('academic_advisor_id'),
                fn ($q, $a) => $q->where('academic_advisor_id', $a)
            )
            ->when(
                $request->integer('warning_count_min'),
                fn ($q, $w) => $q->where('warning_count', '>=', $w)
            )
            ->when($request->query('search'), function ($q, $s) {
                $q->where(function ($sub) use ($s) {
                    $sub->where('university_number', 'like', "%{$s}%")
                        ->orWhere('full_name_ar', 'like', "%{$s}%")
                        ->orWhere('full_name_en', 'like', "%{$s}%")
                        ->orWhere('university_email', 'like', "%{$s}%");
                });
            })
            ->orderBy('full_name_ar')
            ->paginate($request->integer('per_page', 25));

        return ApiResponse::success(
            StudentResource::collection($students),
            null,
            [
                'current_page' => $students->currentPage(),
                'last_page'    => $students->lastPage(),
                'total'        => $students->total(),
                'per_page'     => $students->perPage(),
            ]
        );
    }

    /**
     * POST /api/v1/students
     * Permission: students.create
     */
    public function store(StoreStudentRequest $request): JsonResponse
    {
        $student = Student::create($request->validated());

        return ApiResponse::success(
            new StudentResource($student->load('academicYear', 'academicAdvisor')),
            'Student created.',
            [],
            201
        );
    }

    /**
     * GET /api/v1/students/{student}
     * Permission: students.view
     */
    public function show(Student $student): JsonResponse
    {
        return ApiResponse::success(
            new StudentResource(
                $student->load('academicYear', 'academicAdvisor', 'currentGroupAssignments.group', 'currentGroupAssignments.subgroup')
            )
        );
    }

    /**
     * PUT /api/v1/students/{student}
     * Permission: students.update
     */
    public function update(UpdateStudentRequest $request, Student $student): JsonResponse
    {
        $student->update($request->validated());

        return ApiResponse::success(
            new StudentResource($student->fresh()->load('academicYear', 'academicAdvisor'))
        );
    }
}
