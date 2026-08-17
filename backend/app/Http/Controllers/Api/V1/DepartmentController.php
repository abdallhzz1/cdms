<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreDepartmentRequest;
use App\Http\Requests\V1\UpdateDepartmentRequest;
use App\Http\Resources\V1\DepartmentResource;
use App\Http\Responses\ApiResponse;
use App\Models\Department;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class DepartmentController extends Controller
{
    /**
     * GET /api/v1/departments
     * Permission: departments.view
     */
    public function index(Request $request): JsonResponse
    {
        $departments = Department::query()
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->query('search');
                $q->where(fn ($query) => $query->where('name_ar', 'like', "%{$term}%")->orWhere('name_en', 'like', "%{$term}%")->orWhere('code', 'like', "%{$term}%"));
            })
            ->when($request->query('type'), fn ($q, $t) => $q->where('dept_type', $t))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('name_ar')
            ->paginate($request->integer('per_page', 50));

        return ApiResponse::success(
            DepartmentResource::collection($departments),
            null,
            [
                'current_page' => $departments->currentPage(),
                'last_page'    => $departments->lastPage(),
                'total'        => $departments->total(),
            ]
        );
    }

    /**
     * POST /api/v1/departments
     * Permission: departments.manage
     */
    public function store(StoreDepartmentRequest $request): JsonResponse
    {
        $department = Department::create($request->validated());

        return ApiResponse::success(new DepartmentResource($department), 'Department created.', [], 201);
    }

    /**
     * GET /api/v1/departments/{department}
     * Permission: departments.view
     */
    public function show(Department $department): JsonResponse
    {
        return ApiResponse::success(new DepartmentResource($department));
    }

    /**
     * PUT /api/v1/departments/{department}
     * Permission: departments.manage
     */
    public function update(UpdateDepartmentRequest $request, Department $department): JsonResponse
    {
        $department->update($request->validated());

        return ApiResponse::success(new DepartmentResource($department->fresh()));
    }
}
