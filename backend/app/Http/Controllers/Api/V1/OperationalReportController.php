<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Rotation;
use App\Services\Distribution\Reports\OperationalReportService;
use App\Exports\DistributionReportExport;
use App\Exports\GenericArrayExport;
use Illuminate\Http\Request;
use Maatwebsite\Excel\Facades\Excel;
use Barryvdh\DomPDF\Facade\Pdf;

class OperationalReportController extends Controller
{
    public function __construct(
        private OperationalReportService $reportService
    ) {}

    private function getFormat(Request $request): string
    {
        return strtolower($request->query('format', 'excel'));
    }

    private function getVersion(Rotation $rotation): \App\Models\DistributionVersion
    {
        $version = $this->reportService->resolveCurrentVersion($rotation->id);
        if (!$version) {
            abort(409, 'No current published distribution exists for this rotation.');
        }
        return $version;
    }

    private function excelDownload(object $export, string $baseName, string $format)
    {
        $isCsv = $format === 'csv';
        if ($isCsv) {
            $headings = $export->headings();
            $rows = $export instanceof DistributionReportExport
                ? $export->csvRows()
                : $export->array();

            return response()->streamDownload(function () use ($headings, $rows) {
                $stream = fopen('php://output', 'wb');
                fwrite($stream, "\xEF\xBB\xBF");
                $writeRow = static function ($stream, array $row): void {
                    fwrite($stream, implode(',', array_map(
                        static fn ($value) => '"'.str_replace('"', '""', (string) $value).'"',
                        $row,
                    ))."\n");
                };
                $writeRow($stream, $headings);
                foreach ($rows as $row) {
                    $writeRow($stream, array_values((array) $row));
                }
                fclose($stream);
            }, $baseName.'.csv', ['Content-Type' => 'text/csv; charset=UTF-8']);
        }

        $response = Excel::download(
            $export,
            $baseName.'.xlsx',
            \Maatwebsite\Excel\Excel::XLSX,
        );
        return $response;
    }

    public function studentDistribution(Request $request)
    {
        $request->validate(['rotation_id' => 'required|exists:rotations,id']);
        $rotation = Rotation::find($request->rotation_id);
        $version = $this->getVersion($rotation);
        
        $format = $this->getFormat($request);
        $query = $this->reportService->getStudentDistributionQuery($version->id, $request->all());

        if ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.distribution_roster', ['assignments' => $query->get(), 'title' => 'Master Student Distribution Report'])->setPaper('a4', 'landscape');
            return $pdf->download('student_distribution.pdf');
        }

        $export = new DistributionReportExport($query);
        return $this->excelDownload($export, 'student_distribution', $format);
    }

    public function departmentDistribution(Request $request, int $departmentId)
    {
        $request->validate(['rotation_id' => 'required|exists:rotations,id']);
        $rotation = Rotation::find($request->rotation_id);
        $version = $this->getVersion($rotation);
        
        $format = $this->getFormat($request);
        $query = $this->reportService->getDepartmentDistributionQuery($version->id, $departmentId, $request->all());

        if ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.distribution_roster', ['assignments' => $query->get(), 'title' => 'Department Distribution Report'])->setPaper('a4', 'landscape');
            return $pdf->download('department_distribution.pdf');
        }

        $export = new DistributionReportExport($query);
        return $this->excelDownload($export, 'department_distribution', $format);
    }

    public function supervisorDistribution(Request $request, int $supervisorId)
    {
        $request->validate(['rotation_id' => 'required|exists:rotations,id']);
        $rotation = Rotation::find($request->rotation_id);
        $version = $this->getVersion($rotation);
        
        $format = $this->getFormat($request);
        $query = $this->reportService->getSupervisorDistributionQuery($version->id, $supervisorId, $request->all());

        if ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.distribution_roster', ['assignments' => $query->get(), 'title' => 'Supervisor Assignments Report'])->setPaper('a4', 'landscape');
            return $pdf->download('supervisor_distribution.pdf');
        }

        $export = new DistributionReportExport($query);
        return $this->excelDownload($export, 'supervisor_distribution', $format);
    }

    public function trainingSiteCapacity(Request $request)
    {
        $request->validate(['rotation_id' => 'required|exists:rotations,id']);
        $rotation = Rotation::find($request->rotation_id);
        $version = $this->getVersion($rotation);
        
        $format = $this->getFormat($request);
        $data = $this->reportService->getTrainingSiteCapacityData($version->id, $rotation->id, $request->training_site_id, $request->all());

        if ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.training_site_capacity', ['sites' => $data, 'title' => 'Training Site Capacity Report'])->setPaper('a4', 'landscape');
            return $pdf->download('training_site_capacity.pdf');
        }

        $export = new GenericArrayExport($data, [
            'Site Name (EN)', 'Site Name (AR)', 'Capacity Limit', 'Assigned Count', 'Remaining', 'Utilization %', 'Status'
        ]);
        return $this->excelDownload($export, 'training_site_capacity', $format);
    }

    public function unassignedStudents(Request $request)
    {
        $request->validate(['rotation_id' => 'required|exists:rotations,id']);
        $rotation = Rotation::find($request->rotation_id);
        $version = $this->getVersion($rotation);
        
        $format = $this->getFormat($request);
        $data = $this->reportService->getUnassignedStudentsData($version, $request->all());

        if ($format === 'pdf') {
            $pdf = Pdf::loadView('reports.unassigned_students', ['students' => $data, 'title' => 'Unassigned Students Report']);
            return $pdf->download('unassigned_students.pdf');
        }

        $export = new GenericArrayExport($data, [
            'Student Name (EN)', 'Student Name (AR)', 'Univ. Number', 'Status'
        ]);
        return $this->excelDownload($export, 'unassigned_students', $format);
    }
}
