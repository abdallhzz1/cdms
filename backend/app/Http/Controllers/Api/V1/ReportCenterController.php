<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BrandedReportExport;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Services\Reports\ReportCenterService;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Maatwebsite\Excel\Facades\Excel;

class ReportCenterController extends Controller
{
    public function __construct(private readonly ReportCenterService $reports) {}

    public function summary(Request $request): JsonResponse
    {
        $filters = $this->filters($request);

        return ApiResponse::success([
            'academic_years' => AcademicYear::query()->orderByDesc('start_date')->get(['id', 'code', 'is_current', 'status']),
            'metrics' => $this->reports->summary($filters),
            'reports' => $this->reports->catalog(),
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    public function preview(Request $request, string $report): JsonResponse
    {
        $filters = $this->filters($request, true);
        $payload = $this->reports->report($report, $filters);
        $total = count($payload['rows']);
        $payload['rows'] = array_slice($payload['rows'], 0, 20);
        $payload['total'] = $total;
        $payload['preview_limit'] = 20;

        return ApiResponse::success($payload, null, ['generated_at' => now()->toIso8601String()]);
    }

    public function export(Request $request, string $report)
    {
        $filters = $this->filters($request, true);
        $format = $request->validate(['format' => ['required', 'in:xlsx,pdf']])['format'];
        $payload = $this->reports->report($report, $filters);
        $title = $payload['definition']['title'];
        $fileBase = $report . '-' . now()->format('Y-m-d-His');
        $filterLabel = $this->reports->filterLabel($filters);

        if ($format === 'pdf') {
            $logoPath = base_path('../frontend/src/assets/hebron.png');
            $pdf = Pdf::loadView('reports.branded_report', [
                'title' => $title,
                'columns' => $payload['columns'],
                'rows' => $payload['rows'],
                'filterLabel' => $filterLabel,
                'logoData' => is_file($logoPath) ? base64_encode(file_get_contents($logoPath)) : null,
            ])->setPaper('a4', count($payload['columns']) > 6 ? 'landscape' : 'portrait');

            return $pdf->download($fileBase . '.pdf');
        }

        return Excel::download(
            new BrandedReportExport($title, $payload['columns'], $payload['rows'], $filterLabel),
            $fileBase . '.xlsx',
        );
    }

    private function filters(Request $request, bool $withSearch = false): array
    {
        $rules = [
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'academic_level' => ['nullable', 'in:fourth,fifth,sixth'],
        ];
        if ($withSearch) {
            $rules['search'] = ['nullable', 'string', 'max:100'];
        }

        return array_filter($request->validate($rules), fn ($value) => $value !== null && $value !== '');
    }
}
