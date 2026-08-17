<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRotationRequest;
use App\Http\Requests\UpdateRotationRequest;
use App\Http\Responses\ApiResponse;
use App\Models\Rotation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class RotationController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = Rotation::query()->with(['academicYear', 'departments']);

        if ($request->has('academic_year_id')) {
            $query->where('academic_year_id', $request->academic_year_id);
        }

        if ($request->has('academic_level')) {
            $query->where('academic_level', $request->academic_level);
        }

        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        return ApiResponse::success($query->get());
    }

    public function store(StoreRotationRequest $request): JsonResponse
    {
        $rotation = DB::transaction(function () use ($request) {
            $rotation = Rotation::create($request->validated());

            if ($request->has('departments')) {
                $rotation->departments()->sync($request->departments);
            }

            if ($request->has('blocks')) {
                $rotation->blocks()->createMany($request->blocks);
            }

            return $rotation->load(['blocks', 'departments']);
        });

        return ApiResponse::success($rotation, 'Rotation created successfully', [], 201);
    }

    public function show(Rotation $rotation): JsonResponse
    {
        $rotation->load(['academicYear', 'blocks', 'departments', 'siteCapacityRules']);

        return ApiResponse::success($rotation);
    }

    public function update(UpdateRotationRequest $request, Rotation $rotation): JsonResponse
    {
        $updatedRotation = DB::transaction(function () use ($request, $rotation) {
            $rotation->update($request->validated());

            if ($request->has('departments')) {
                $rotation->departments()->sync($request->departments);
            }

            if ($request->has('blocks')) {
                $rotation->blocks()->delete();
                $rotation->blocks()->createMany($request->blocks);
            }

            return $rotation->load(['blocks', 'departments', 'siteCapacityRules']);
        });

        return ApiResponse::success($updatedRotation, 'Rotation updated successfully');
    }

    public function destroy(Rotation $rotation): JsonResponse
    {
        $rotation->delete();
        return ApiResponse::success(null, 'Rotation deleted successfully');
    }

    public function validateDistribution(
        \App\Http\Requests\ValidateDistributionRequest $request,
        Rotation $rotation,
        \App\Services\Distribution\DistributionValidationService $validationService,
        \App\Services\Distribution\DistributionValidationContextBuilder $contextBuilder
    ): JsonResponse {
        $dtos = array_map(
            fn($data) => \App\DTOs\CandidateAssignmentDTO::fromArray($data),
            $request->validated('assignments')
        );

        $context = $contextBuilder->buildForValidation($rotation, $dtos);
        $result = $validationService->validate($context, $dtos);

        return ApiResponse::success($result);
    }

    public function generateCandidates(
        Rotation $rotation,
        \App\Services\Distribution\DistributionCandidateGeneratorService $generatorService
    ): JsonResponse {
        $result = $generatorService->generate($rotation);

        return ApiResponse::success([
            'valid_candidates' => $result->validCandidates,
            'rejected_candidates' => $result->rejectedCandidates,
        ]);
    }

    public function generateDistribution(
        Rotation $rotation,
        \App\Services\Distribution\DistributionGenerationService $generationService
    ): JsonResponse {
        $result = $generationService->generate($rotation);
        
        return ApiResponse::success($result, 'Distribution generated successfully');
    }
}
