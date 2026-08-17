<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StorePartnershipRequest;
use App\Http\Requests\V1\UpdatePartnershipRequest;
use App\Http\Resources\V1\PartnershipResource;
use App\Http\Responses\ApiResponse;
use App\Models\Partnership;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PartnershipController extends Controller
{
    /**
     * GET /api/v1/partnerships
     * Permission: partnerships.view
     */
    public function index(Request $request): JsonResponse
    {
        $partnerships = Partnership::query()
            ->when($request->query('scope'), fn ($q, $s) => $q->where('scope', $s))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('institution_name')
            ->paginate($request->integer('per_page', 30));

        return ApiResponse::success(
            PartnershipResource::collection($partnerships),
            null,
            [
                'current_page' => $partnerships->currentPage(),
                'last_page'    => $partnerships->lastPage(),
                'total'        => $partnerships->total(),
            ]
        );
    }

    /**
     * POST /api/v1/partnerships
     * Permission: partnerships.manage
     */
    public function store(StorePartnershipRequest $request): JsonResponse
    {
        $partnership = Partnership::create($request->validated());

        return ApiResponse::success(new PartnershipResource($partnership), 'Partnership created.', [], 201);
    }

    /**
     * GET /api/v1/partnerships/{partnership}
     * Permission: partnerships.view
     */
    public function show(Partnership $partnership): JsonResponse
    {
        return ApiResponse::success(new PartnershipResource($partnership));
    }

    /**
     * PUT /api/v1/partnerships/{partnership}
     * Permission: partnerships.manage
     */
    public function update(UpdatePartnershipRequest $request, Partnership $partnership): JsonResponse
    {
        $partnership->update($request->validated());

        return ApiResponse::success(new PartnershipResource($partnership->fresh()));
    }
}
