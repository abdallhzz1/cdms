<?php

namespace App\Http\Controllers\Api\V1;

use App\Exports\BrandedReportExport;
use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AcademicYear;
use App\Models\ClinicalPeriod;
use App\Models\Student;
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
            'clinical_periods' => ClinicalPeriod::query()->orderBy('academic_year_id')->orderBy('sequence')->get(['id', 'academic_year_id', 'code', 'name_ar', 'name_en', 'sequence']),
            'metrics' => $this->reports->summary($filters),
            'reports' => $this->reports->catalog(),
            'generated_at' => now()->toIso8601String(),
        ]);
    }

    public function studentGenderSummary(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'academic_level' => ['nullable', 'in:fourth,fifth,sixth'],
        ]);

        $students = Student::query()
            ->when($filters['academic_year_id'] ?? null, fn ($query, $yearId) => $query->where('academic_year_id', $yearId))
            ->when($filters['academic_level'] ?? null, fn ($query, $level) => $query->where('academic_level', $level));

        $counts = (clone $students)
            ->selectRaw("SUM(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) AS female")
            ->selectRaw("SUM(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) AS male")
            ->selectRaw("SUM(CASE WHEN gender IS NULL OR gender NOT IN ('female', 'male') THEN 1 ELSE 0 END) AS unspecified")
            ->first();

        $female = (int) ($counts?->female ?? 0);
        $male = (int) ($counts?->male ?? 0);
        $unspecified = (int) ($counts?->unspecified ?? 0);
        $batches = (clone $students)
            ->select('academic_level', 'batch_year')
            ->selectRaw("SUM(CASE WHEN gender = 'female' THEN 1 ELSE 0 END) AS female")
            ->selectRaw("SUM(CASE WHEN gender = 'male' THEN 1 ELSE 0 END) AS male")
            ->selectRaw("SUM(CASE WHEN gender IS NULL OR gender NOT IN ('female', 'male') THEN 1 ELSE 0 END) AS unspecified")
            ->groupBy('academic_level', 'batch_year')
            ->orderByRaw("FIELD(academic_level, 'fourth', 'fifth', 'sixth')")
            ->orderBy('batch_year')
            ->get()
            ->map(fn ($batch) => [
                'academic_level' => $batch->academic_level,
                'batch_year' => $batch->batch_year,
                'female' => (int) $batch->female,
                'male' => (int) $batch->male,
                'unspecified' => (int) $batch->unspecified,
                'total' => (int) $batch->female + (int) $batch->male + (int) $batch->unspecified,
            ])
            ->values();

        return ApiResponse::success([
            'female' => $female,
            'male' => $male,
            'unspecified' => $unspecified,
            'total' => $female + $male + $unspecified,
            'batches' => $batches,
        ]);
    }

    public function studentGenderStudents(Request $request)
    {
        $filters = $request->validate([
            'academic_year_id' => ['nullable', 'integer', 'exists:academic_years,id'],
            'academic_level' => ['required', 'in:fourth,fifth,sixth'],
            'batch_year' => ['required', 'regex:/^(unknown|[0-9]{4})$/'],
            'gender' => ['required', 'in:male,female'],
        ]);

        $students = Student::query()
            ->where('academic_level', $filters['academic_level'])
            ->where('gender', $filters['gender'])
            ->when($filters['batch_year'] === 'unknown', fn ($query) => $query->whereNull('batch_year'), fn ($query) => $query->where('batch_year', (int) $filters['batch_year']))
            ->when($filters['academic_year_id'] ?? null, fn ($query, $yearId) => $query->where('academic_year_id', $yearId))
            ->orderBy('full_name_ar')
            ->cursor();

        $levelLabel = ['fourth' => 'fourth', 'fifth' => 'fifth', 'sixth' => 'sixth'][$filters['academic_level']];
        $batchLabel = $filters['batch_year'] === 'unknown' ? 'unspecified' : $filters['batch_year'];
        $fileName = sprintf('students-%s-%s-%s.csv', $filters['gender'], $levelLabel, $batchLabel);

        return response()->streamDownload(function () use ($students): void {
            $output = fopen('php://output', 'w');
            fwrite($output, "\xEF\xBB\xBF");
            fputcsv($output, ['الرقم الجامعي', 'اسم الطالب بالعربية', 'اسم الطالب بالإنجليزية', 'السنة السريرية', 'سنة الدفعة', 'الجنس']);
            foreach ($students as $student) {
                fputcsv($output, [
                    $student->university_number,
                    $student->full_name_ar,
                    $student->full_name_en,
                    $student->academic_level,
                    $student->batch_year,
                    $student->gender,
                ]);
            }
            fclose($output);
        }, $fileName, ['Content-Type' => 'text/csv; charset=UTF-8']);
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

    public function clinicalTrainingSiteDetails(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'training_site_id' => ['required', 'integer', 'exists:training_sites,id'],
            'month' => ['required', 'date_format:Y-m'],
        ]);

        return ApiResponse::success($this->reports->clinicalTrainingSiteMonthlyDetails(
            (int) $validated['training_site_id'],
            $validated['month'],
            $this->filters($request),
        ));
    }

    public function export(Request $request, string $report)
    {
        $filters = $this->filters($request, true);
        $format = $request->validate(['format' => ['required', 'in:xlsx,pdf']])['format'];
        $payload = $this->reports->exportReport($report, $filters);
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
            'clinical_period_id' => ['nullable', 'integer', 'exists:clinical_periods,id'],
            'month_from' => ['nullable', 'date_format:Y-m'],
            'month_to' => ['nullable', 'date_format:Y-m', 'after_or_equal:month_from'],
        ];
        if ($withSearch) {
            $rules['search'] = ['nullable', 'string', 'max:100'];
        }

        return array_filter($request->validate($rules), fn ($value) => $value !== null && $value !== '');
    }
}
