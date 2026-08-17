<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Models\Student;
use App\Models\Person;
use App\Models\AttendanceRecord;
use App\Models\GradeEntry;
use App\Models\ClinicalAssessment;
use App\Models\Correspondence;
use App\Models\OperationalTask;
use App\Models\QualityImprovementPlan;
use App\Models\SupervisorAnnualWorkload;
use App\Models\WeeklySupervisorAllocation;

class CsvExportController extends Controller
{
    private function streamCsv($filename, $headers, $dataCallback)
    {
        $callback = function () use ($headers, $dataCallback) {
            $out = fopen('php://output', 'w');
            
            // Add UTF-8 BOM for Arabic support
            fwrite($out, "\xEF\xBB\xBF");
            
            fputcsv($out, $headers);
            $dataCallback($out);
            
            fclose($out);
        };

        return response()->streamDownload($callback, $filename, [
            'Content-Type' => 'text/csv; charset=UTF-8'
        ]);
    }

    public function students()
    {
        return $this->streamCsv('students.csv', [
            'University Number', 'Full Name (Ar)', 'Full Name (En)', 'Academic Level', 'GPA', 'Registration Status', 'Batch Year'
        ], function ($out) {
            Student::query()->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->university_number,
                        $record->full_name_ar,
                        $record->full_name_en,
                        $record->academic_level,
                        $record->gpa,
                        $record->registration_status,
                        $record->batch_year
                    ]);
                }
            });
        });
    }

    public function staff()
    {
        return $this->streamCsv('staff.csv', [
            'Staff Code', 'Full Name (Ar)', 'Full Name (En)', 'Email', 'Specialty', 'Department Name'
        ], function ($out) {
            Person::with('department')->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->staff_code,
                        $record->full_name_ar,
                        $record->full_name_en,
                        $record->email,
                        $record->specialty,
                        $record->department?->name
                    ]);
                }
            });
        });
    }

    public function attendance()
    {
        return $this->streamCsv('attendance.csv', [
            'ID', 'Student', 'Session Date', 'Status', 'Notes'
        ], function ($out) {
            AttendanceRecord::with(['student', 'session'])->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->id,
                        $record->student?->full_name_en ?? $record->student?->full_name_ar,
                        $record->session?->session_date,
                        $record->status,
                        $record->notes
                    ]);
                }
            });
        });
    }

    public function grades()
    {
        return $this->streamCsv('grades.csv', [
            'ID', 'Student', 'Course', 'Score', 'Max Score', 'Status'
        ], function ($out) {
            GradeEntry::with(['enrollment.student', 'enrollment.course'])->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->id,
                        $record->enrollment?->student?->full_name_en ?? $record->enrollment?->student?->full_name_ar,
                        $record->enrollment?->course?->name,
                        $record->score,
                        $record->max_score,
                        $record->status
                    ]);
                }
            });
        });
    }

    public function assessments()
    {
        return $this->streamCsv('assessments.csv', [
            'ID', 'Student', 'Evaluator', 'Score', 'Max Score', 'Status'
        ], function ($out) {
            ClinicalAssessment::with(['student', 'evaluator'])->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->id,
                        $record->student?->full_name_en ?? $record->student?->full_name_ar,
                        $record->evaluator?->full_name_en ?? $record->evaluator?->full_name_ar,
                        $record->score,
                        $record->max_score,
                        $record->status
                    ]);
                }
            });
        });
    }

    public function correspondence()
    {
        return $this->streamCsv('correspondence.csv', [
            'Reference Number', 'Direction', 'Subject', 'Date', 'Status'
        ], function ($out) {
            Correspondence::query()->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->reference_number,
                        $record->direction,
                        $record->subject,
                        $record->correspondence_date,
                        $record->status
                    ]);
                }
            });
        });
    }

    public function tasks()
    {
        return $this->streamCsv('tasks.csv', [
            'Title', 'Priority', 'Status', 'Due Date'
        ], function ($out) {
            OperationalTask::query()->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->title,
                        $record->priority,
                        $record->status,
                        $record->due_date
                    ]);
                }
            });
        });
    }

    public function quality()
    {
        return $this->streamCsv('quality_plans.csv', [
            'Academic Year', 'Observation', 'Improvement Action', 'Priority', 'Due Date'
        ], function ($out) {
            QualityImprovementPlan::query()->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->academic_year,
                        $record->observation,
                        $record->improvement_action,
                        $record->priority,
                        $record->due_date
                    ]);
                }
            });
        });
    }

    public function workloads()
    {
        return $this->streamCsv('workloads.csv', [
            'Academic Year', 'Semester', 'Department', 'Total Hours'
        ], function ($out) {
            SupervisorAnnualWorkload::with('department')->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->academic_year,
                        $record->semester,
                        $record->department?->name,
                        $record->total_teaching_hours
                    ]);
                }
            });
        });
    }

    public function allocations()
    {
        return $this->streamCsv('allocations.csv', [
            'Day', 'Time Start', 'Time End', 'Department', 'Location'
        ], function ($out) {
            WeeklySupervisorAllocation::with('department')->chunk(100, function ($records) use ($out) {
                foreach ($records as $record) {
                    fputcsv($out, [
                        $record->day_of_week,
                        $record->time_start,
                        $record->time_end,
                        $record->department?->name,
                        $record->location
                    ]);
                }
            });
        });
    }
}
