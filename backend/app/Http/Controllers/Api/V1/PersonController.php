<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StorePersonRequest;
use App\Http\Requests\V1\UpdatePersonRequest;
use App\Http\Resources\V1\PersonResource;
use App\Http\Responses\ApiResponse;
use App\Models\Person;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PersonController extends Controller
{
    /**
     * GET /api/v1/people
     * Permission: people.view
     */
    public function index(Request $request): JsonResponse
    {
        $people = Person::with('department')
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->query('search');
                $q->where(fn ($query) => $query->where('full_name_ar', 'like', "%{$term}%")->orWhere('full_name_en', 'like', "%{$term}%")->orWhere('staff_code', 'like', "%{$term}%"));
            })
            ->when($request->query('department_id'), fn ($q, $d) => $q->where('department_id', $d))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('full_name_ar')
            ->paginate($request->integer('per_page', 30));

        return ApiResponse::success(
            PersonResource::collection($people),
            null,
            [
                'current_page' => $people->currentPage(),
                'last_page'    => $people->lastPage(),
                'total'        => $people->total(),
            ]
        );
    }

    /**
     * POST /api/v1/people
     * Permission: people.manage
     */
    public function store(StorePersonRequest $request): JsonResponse
    {
        $person = Person::create($request->validated());

        return ApiResponse::success(
            new PersonResource($person->load('department')),
            'Person created.',
            [],
            201
        );
    }

    /**
     * GET /api/v1/people/{person}
     * Permission: people.view
     */
    public function show(Person $person): JsonResponse
    {
        return ApiResponse::success(
            new PersonResource($person->load(['department', 'primarySite', 'headAssignments.department', 'activityRecords', 'availabilities']))
        );
    }

    /**
     * PUT /api/v1/people/{person}
     * Permission: people.manage
     */
    public function update(UpdatePersonRequest $request, Person $person): JsonResponse
    {
        $person->update($request->validated());

        return ApiResponse::success(new PersonResource($person->fresh()->load('department')));
    }
}
