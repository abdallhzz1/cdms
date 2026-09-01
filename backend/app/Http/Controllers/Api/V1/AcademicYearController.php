<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\V1\StoreAcademicYearRequest;
use App\Http\Requests\V1\UpdateAcademicYearRequest;
use App\Http\Resources\V1\AcademicYearResource;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Models\ClinicalPeriod;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Academic Years — CRUD foundation.
 *
 * Business rule: only one academic year should have is_current = true.
 * When a new "current" year is set, the store/update methods clear the flag
 * on existing rows within a transaction.
 */
class AcademicYearController extends Controller
{
    /**
     * GET /api/v1/academic-years
     * Permission: academic_years.view
     */
    public function index(Request $request): JsonResponse
    {
        $years = AcademicYear::query()
            ->when($request->query('status'), fn ($q, $s) => $q->where('status', $s))
            ->when($request->boolean('current'), fn ($q) => $q->where('is_current', true))
            ->orderByDesc('start_date')
            ->paginate($request->integer('per_page', 20));

        return ApiResponse::success(
            AcademicYearResource::collection($years),
            null,
            [
                'current_page' => $years->currentPage(),
                'last_page'    => $years->lastPage(),
                'total'        => $years->total(),
                'per_page'     => $years->perPage(),
            ]
        );
    }

    /**
     * POST /api/v1/academic-years
     * Permission: academic_years.manage
     */
    public function store(StoreAcademicYearRequest $request): JsonResponse
    {
        $data = $request->validated();

        $year = DB::transaction(function () use ($data) {
            if (! empty($data['is_current'])) {
                AcademicYear::where('is_current', true)->update(['is_current' => false]);
            }

            $year = AcademicYear::create($data);
            $this->createDefaultClinicalPeriods($year);

            return $year;
        });

        return ApiResponse::success(
            new AcademicYearResource($year),
            'Academic year created.',
            [],
            201
        );
    }

    /**
     * GET /api/v1/academic-years/{academic_year}
     * Permission: academic_years.view
     */
    public function show(AcademicYear $academic_year): JsonResponse
    {
        return ApiResponse::success(new AcademicYearResource($academic_year));
    }

    /**
     * PUT /api/v1/academic-years/{academic_year}
     * Permission: academic_years.manage
     */
    public function update(UpdateAcademicYearRequest $request, AcademicYear $academic_year): JsonResponse
    {
        $data = $request->validated();

        DB::transaction(function () use ($data, $academic_year) {
            if (! empty($data['is_current'])) {
                AcademicYear::where('is_current', true)
                    ->where('id', '!=', $academic_year->id)
                    ->update(['is_current' => false]);
            }

            $academic_year->update($data);
        });

        return ApiResponse::success(new AcademicYearResource($academic_year->fresh()));
    }

    private function createDefaultClinicalPeriods(AcademicYear $year): void
    {
        $yearStart = Carbon::parse($year->start_date);
        $yearEnd = Carbon::parse($year->end_date);

        foreach ([1, 2, 3] as $sequence) {
            $start = $yearStart->copy()->addWeeks(($sequence - 1) * 12);
            if ($start->gt($yearEnd)) {
                break;
            }
            $end = $start->copy()->addWeeks(12)->subDay();
            if ($end->gt($yearEnd)) {
                $end = $yearEnd->copy();
            }

            ClinicalPeriod::create([
                'academic_year_id' => $year->id,
                'code' => 'P'.$sequence,
                'name_ar' => 'الفترة السريرية '.$sequence,
                'name_en' => 'Clinical Period '.$sequence,
                'sequence' => $sequence,
                'start_date' => $start->toDateString(),
                'end_date' => $end->toDateString(),
                'weeks_count' => min(12, max(1, (int) ceil($start->diffInDays($end->copy()->addDay()) / 7))),
                'status' => $year->is_current ? 'active' : 'planned',
            ]);
        }
    }
}
