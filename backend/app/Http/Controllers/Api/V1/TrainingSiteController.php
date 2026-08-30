<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreTrainingSiteRequest;
use App\Http\Requests\V1\UpdateTrainingSiteRequest;
use App\Http\Resources\V1\TrainingSiteResource;
use App\Http\Responses\ApiResponse;
use App\Models\TrainingSite;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class TrainingSiteController extends Controller
{
    /**
     * GET /api/v1/training-sites
     * Permission: training_sites.view
     */
    public function index(Request $request): JsonResponse
    {
        $sites = TrainingSite::with('department')
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = $request->query('search');
                $q->where(fn ($query) => $query->where('name_ar', 'like', "%{$term}%")->orWhere('name_en', 'like', "%{$term}%")->orWhere('site_code', 'like', "%{$term}%"));
            })
            ->when($request->query('type'), fn ($q, $t) => $q->where('site_type', $t))
            ->when($request->query('department_id'), fn ($q, $d) => $q->where('department_id', $d))
            ->when($request->filled('active'), fn ($q) => $q->where('is_active', $request->boolean('active')))
            ->orderBy('name_ar')
            ->paginate($request->integer('per_page', 30));

        return ApiResponse::success(
            TrainingSiteResource::collection($sites),
            null,
            [
                'current_page' => $sites->currentPage(),
                'last_page'    => $sites->lastPage(),
                'total'        => $sites->total(),
            ]
        );
    }

    /**
     * POST /api/v1/training-sites
     * Permission: training_sites.manage
     */
    public function store(StoreTrainingSiteRequest $request): JsonResponse
    {
        $data = $request->validated();
        unset($data['site_code']);

        $site = DB::transaction(function () use ($data) {
            $data['site_code'] = $this->nextSiteCode($data['site_type'] ?? 'hospital_public');

            return TrainingSite::create($data);
        });

        return ApiResponse::success(
            new TrainingSiteResource($site->load('department')),
            "تم إنشاء الموقع التدريبي بالرمز {$site->site_code}.",
            [],
            201
        );
    }

    /**
     * GET /api/v1/training-sites/{training_site}
     * Permission: training_sites.view
     */
    public function show(TrainingSite $training_site): JsonResponse
    {
        return ApiResponse::success(
            new TrainingSiteResource($training_site->load('department', 'supervisors'))
        );
    }

    /**
     * PUT /api/v1/training-sites/{training_site}
     * Permission: training_sites.manage
     */
    public function update(UpdateTrainingSiteRequest $request, TrainingSite $training_site): JsonResponse
    {
        $training_site->update($request->validated());

        return ApiResponse::success(new TrainingSiteResource($training_site->fresh()->load('department')));
    }

    private function nextSiteCode(string $siteType): string
    {
        $prefix = $siteType === 'online' ? 'ONLINE' : 'SITE';
        $highestNumber = TrainingSite::query()
            ->where('site_code', 'like', "{$prefix}-%")
            ->lockForUpdate()
            ->pluck('site_code')
            ->map(function (string $code) use ($prefix): int {
                return (int) substr($code, strlen($prefix) + 1);
            })
            ->max() ?? 0;

        return sprintf('%s-%03d', $prefix, $highestNumber + 1);
    }
}
