<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreStudentGroupRequest;
use App\Http\Resources\V1\StudentGroupResource;
use App\Http\Responses\ApiResponse;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StudentGroupController extends Controller
{
    /**
     * GET /api/v1/student-groups
     * Permission: groups.view
     */
    public function index(Request $request): JsonResponse
    {
        $groups = StudentGroup::with(['academicYear', 'subgroups'])
            ->when($request->query('academic_year_id'), fn ($q, $y) => $q->where('academic_year_id', $y))
            ->when($request->query('academic_level'), fn ($q, $l) => $q->where('academic_level', $l))
            ->orderBy('academic_level')
            ->orderBy('name')
            ->paginate($request->integer('per_page', 50));

        return ApiResponse::success(
            StudentGroupResource::collection($groups),
            null,
            [
                'current_page' => $groups->currentPage(),
                'last_page'    => $groups->lastPage(),
                'total'        => $groups->total(),
            ]
        );
    }

    /**
     * POST /api/v1/student-groups
     * Permission: groups.manage
     * Supports creating main group + subgroups in one request.
     */
    public function store(StoreStudentGroupRequest $request): JsonResponse
    {
        $data = $request->validated();
        $subgroupsData = $data['subgroups'] ?? [];
        unset($data['subgroups']);

        $group = DB::transaction(function () use ($data, $subgroupsData) {
            $group = StudentGroup::create($data);

            foreach ($subgroupsData as $sg) {
                $group->subgroups()->create($sg);
            }

            return $group;
        });

        return ApiResponse::success(
            new StudentGroupResource($group->load('subgroups', 'academicYear')),
            'Student group created.',
            [],
            201
        );
    }

    /**
     * GET /api/v1/student-groups/{student_group}
     * Permission: groups.view
     */
    public function show(StudentGroup $student_group): JsonResponse
    {
        return ApiResponse::success(
            new StudentGroupResource(
                $student_group->load('subgroups', 'academicYear')
            )
        );
    }
}
