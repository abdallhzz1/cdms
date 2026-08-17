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
        $ext = $format === 'csv' ? \Maatwebsite\Excel\Excel::CSV : \Maatwebsite\Excel\Excel::XLSX;
        return Excel::download($export, 'student_distribution.' . ($format === 'csv' ? 'csv' : 'xlsx'), $ext);
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
        $ext = $format === 'csv' ? \Maatwebsite\Excel\Excel::CSV : \Maatwebsite\Excel\Excel::XLSX;
        return Excel::download($export, 'department_distribution.' . ($format === 'csv' ? 'csv' : 'xlsx'), $ext);
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
        $ext = $format === 'csv' ? \Maatwebsite\Excel\Excel::CSV : \Maatwebsite\Excel\Excel::XLSX;
        return Excel::download($export, 'supervisor_distribution.' . ($format === 'csv' ? 'csv' : 'xlsx'), $ext);
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
        $ext = $format === 'csv' ? \Maatwebsite\Excel\Excel::CSV : \Maatwebsite\Excel\Excel::XLSX;
        return Excel::download($export, 'training_site_capacity.' . ($format === 'csv' ? 'csv' : 'xlsx'), $ext);
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
        $ext = $format === 'csv' ? \Maatwebsite\Excel\Excel::CSV : \Maatwebsite\Excel\Excel::XLSX;
        return Excel::download($export, 'unassigned_students.' . ($format === 'csv' ? 'csv' : 'xlsx'), $ext);
    }
}
