<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class AuditOperationalWorkflow extends Command
{
    protected $signature = 'cdms:workflow-readiness {--json : Print machine-readable JSON}';

    protected $description = 'Audit the data required for the end-to-end clinical workflow without changing it.';

    /** @var array<int, array{code:string,status:string,message:string,value:int|string|null}> */
    private array $checks = [];

    public function handle(): int
    {
        $requiredTables = [
            'academic_years', 'students', 'student_group_assignments', 'courses', 'rotations',
            'distribution_versions', 'student_clinical_assignments', 'people', 'supervisor_availabilities',
            'clinical_assessment_templates', 'clinical_assessment_criteria', 'approval_workflows',
            'approval_workflow_steps', 'course_schedule_rows', 'course_schedule_cells',
            'users', 'roles', 'user_roles', 'training_sites',
        ];
        $missingTables = collect($requiredTables)->reject(fn (string $table) => Schema::hasTable($table))->values();
        if ($missingTables->isNotEmpty()) {
            $this->add('database.migrations', 'FAIL', 'Migrations are incomplete: '.$missingTables->join(', '), $missingTables->count());
            return $this->finish();
        }

        $currentYears = DB::table('academic_years')->where('is_current', true)->get(['id', 'code']);
        $this->add(
            'academic_year.current',
            $currentYears->count() === 1 ? 'PASS' : 'FAIL',
            $currentYears->count() === 1 ? "Current academic year: {$currentYears->first()->code}" : 'Exactly one current academic year is required.',
            $currentYears->count(),
        );
        $yearId = $currentYears->count() === 1 ? (int) $currentYears->first()->id : null;

        $activeSites = DB::table('training_sites')->where('is_active', true)->count();
        $this->add('training_sites.active', $activeSites > 0 ? 'PASS' : 'FAIL', 'Active hospitals/training locations.', $activeSites);

        foreach (['CLINICAL_DIRECTOR', 'RTA', 'CLINICAL_SUPERVISOR', 'DEAN'] as $roleCode) {
            $users = DB::table('users')
                ->join('user_roles', 'user_roles.user_id', '=', 'users.id')
                ->join('roles', 'roles.id', '=', 'user_roles.role_id')
                ->where('roles.code', $roleCode)->where('users.is_active', true)
                ->distinct()->count('users.id');
            $this->add("users.role.{$roleCode}", $users > 0 ? 'PASS' : 'FAIL', "Active users with {$roleCode} role.", $users);
        }

        if ($yearId) {
            foreach (['fourth', 'fifth', 'sixth'] as $level) {
                $students = DB::table('students')->where('academic_year_id', $yearId)
                    ->where('academic_level', $level)->where('registration_status', 'active')->count();
                $this->add("students.{$level}", $students > 0 ? 'PASS' : 'FAIL', "Active {$level}-year students in the current academic year.", $students);
            }

            $activeStudentQuery = DB::table('students')->where('academic_year_id', $yearId)->where('registration_status', 'active');
            $missingEnglish = (clone $activeStudentQuery)->where(fn ($query) => $query->whereNull('full_name_en')->orWhere('full_name_en', ''))->count();
            $this->add('students.english_names', $missingEnglish === 0 ? 'PASS' : 'WARN', 'Active students missing an English name.', $missingEnglish);
            $missingEmail = (clone $activeStudentQuery)->where(fn ($query) => $query->whereNull('university_email')->orWhere('university_email', ''))->count();
            $this->add('students.email', $missingEmail === 0 ? 'PASS' : 'WARN', 'Active students missing a university email.', $missingEmail);
            $withoutCurrentGroup = (clone $activeStudentQuery)->whereNotExists(function ($query) use ($yearId) {
                $query->selectRaw('1')->from('student_group_assignments')
                    ->whereColumn('student_group_assignments.student_id', 'students.id')
                    ->where('student_group_assignments.academic_year_id', $yearId)
                    ->whereNull('student_group_assignments.valid_until');
            })->count();
            $this->add('students.current_groups', $withoutCurrentGroup === 0 ? 'PASS' : 'FAIL', 'Active students without a current subgroup.', $withoutCurrentGroup);

            $activeCourses = DB::table('courses')->where('is_active', true)->count();
            $this->add('courses.active', $activeCourses > 0 ? 'PASS' : 'FAIL', 'Active clinical courses.', $activeCourses);
            $rotations = DB::table('rotations')->where('academic_year_id', $yearId)->count();
            $this->add('rotations.current_year', $rotations > 0 ? 'PASS' : 'FAIL', 'Clinical rotations in the current academic year.', $rotations);

            $currentVersions = DB::table('distribution_versions')
                ->join('rotations', 'rotations.id', '=', 'distribution_versions.rotation_id')
                ->where('rotations.academic_year_id', $yearId)
                ->where('distribution_versions.status', 'published')
                ->where('distribution_versions.is_current', true)
                ->pluck('distribution_versions.id');
            $this->add('distribution.current_published', $currentVersions->isNotEmpty() ? 'PASS' : 'FAIL', 'Current published clinical distributions.', $currentVersions->count());

            if ($currentVersions->isNotEmpty()) {
                $assignments = DB::table('student_clinical_assignments')->whereIn('distribution_version_id', $currentVersions)->count();
                $this->add('distribution.assignments', $assignments > 0 ? 'PASS' : 'FAIL', 'Student assignments in current published distributions.', $assignments);
                $incompleteAssignments = DB::table('student_clinical_assignments')->whereIn('distribution_version_id', $currentVersions)
                    ->where(fn ($query) => $query->whereNull('supervisor_id')->orWhereNull('training_site_id')->orWhereNull('student_subgroup_id'))
                    ->count();
                $this->add('distribution.complete_assignments', $incompleteAssignments === 0 ? 'PASS' : 'FAIL', 'Published assignments missing a supervisor, training site, or subgroup.', $incompleteAssignments);
                $scheduleCells = DB::table('course_schedule_cells')->whereIn('distribution_version_id', $currentVersions)->count();
                $this->add('distribution.schedule_cells', $scheduleCells > 0 ? 'PASS' : 'FAIL', 'Scheduled supervisor/group cells in current published distributions.', $scheduleCells);

                $assignedWithoutAccount = DB::table('student_clinical_assignments as assignments')
                    ->join('people', 'people.id', '=', 'assignments.supervisor_id')
                    ->whereIn('assignments.distribution_version_id', $currentVersions)
                    ->whereNull('people.user_id')->distinct()->count('people.id');
                $this->add('supervisors.accounts', $assignedWithoutAccount === 0 ? 'PASS' : 'FAIL', 'Assigned supervisors without a linked system account.', $assignedWithoutAccount);

                $assignedWithoutWorkDays = DB::table('student_clinical_assignments as assignments')
                    ->whereIn('assignments.distribution_version_id', $currentVersions)
                    ->whereNotNull('assignments.supervisor_id')
                    ->whereNotExists(function ($query) {
                        $query->selectRaw('1')->from('supervisor_availabilities')
                            ->whereColumn('supervisor_availabilities.person_id', 'assignments.supervisor_id')
                            ->whereColumn('supervisor_availabilities.training_site_id', 'assignments.training_site_id')
                            ->where('supervisor_availabilities.status', 'work');
                    })->distinct()->count('assignments.supervisor_id');
                $this->add('supervisors.work_days', $assignedWithoutWorkDays === 0 ? 'PASS' : 'FAIL', 'Assigned supervisors without configured work places and days.', $assignedWithoutWorkDays);
            }
        }

        $templates = DB::table('clinical_assessment_templates')->where('is_active', true)->count();
        $criteria = DB::table('clinical_assessment_criteria')->count();
        $this->add('assessments.templates', $templates > 0 && $criteria > 0 ? 'PASS' : 'FAIL', 'Active weekly assessment templates and criteria.', "{$templates} / {$criteria}");

        foreach (['clinical_distribution', 'grade_sheet'] as $workflowCode) {
            $workflow = DB::table('approval_workflows')->where('code', $workflowCode)->where('is_active', true)->first();
            $steps = $workflow ? DB::table('approval_workflow_steps')->where('approval_workflow_id', $workflow->id)->count() : 0;
            $this->add("approvals.{$workflowCode}", $workflow && $steps > 0 ? 'PASS' : 'FAIL', "Active {$workflowCode} approval workflow with configured stages.", $steps);
        }

        return $this->finish();
    }

    private function add(string $code, string $status, string $message, int|string|null $value = null): void
    {
        $this->checks[] = compact('code', 'status', 'message', 'value');
    }

    private function finish(): int
    {
        $summary = collect($this->checks)->countBy('status');
        if ($this->option('json')) {
            $this->line(json_encode(['summary' => $summary, 'checks' => $this->checks], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
        } else {
            $this->table(['Status', 'Check', 'Value', 'Description'], array_map(
                fn (array $check) => [$check['status'], $check['code'], $check['value'] ?? '—', $check['message']],
                $this->checks,
            ));
            $this->newLine();
            $this->line(sprintf('PASS: %d | WARN: %d | FAIL: %d', $summary['PASS'] ?? 0, $summary['WARN'] ?? 0, $summary['FAIL'] ?? 0));
        }

        return ($summary['FAIL'] ?? 0) > 0 ? self::FAILURE : self::SUCCESS;
    }
}
