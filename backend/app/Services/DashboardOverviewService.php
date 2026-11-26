<?php

namespace App\Services;

use App\Models\AcademicYear;
use App\Models\ApprovalRequest;
use App\Models\AttendanceRecord;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\Student;
use App\Models\StudentGroupRoster;
use App\Models\User;
use App\Services\Approvals\ApprovalWorkflowService;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardOverviewService
{
    use ScopesByDepartmentAndLevel;

    private ?AcademicYear $academicYear = null;

    /** @return array<string, mixed> */
    public function forUser(User $user): array
    {
        abort_unless($user->is_active, 403);
        $this->academicYear = AcademicYear::where('is_current', true)->orderByDesc('start_date')->first()
            ?? AcademicYear::whereDate('start_date', '<=', today())->whereDate('end_date', '>=', today())->orderByDesc('start_date')->first();
        $roleCodes = $user->roles()->pluck('code')->unique()->values();
        $permissions = $this->permissionCodes($user);
        $focus = $this->focus($roleCodes);
        $levels = collect($user->assigned_levels ?? [])->values()->all();
        $metrics = collect();
        $charts = collect();
        $attention = collect();

        $studentIds = $this->studentIds($permissions);
        if ($permissions->intersect(['students.view', 'attendance.view', 'attendance.review', 'grades.view', 'assessment.view', 'assessment.review', 'distribution.view', 'clinical_schedule.view', 'advising.view', 'university_lectures.manage', 'university_lectures.attendance.view', 'university_lectures.attendance.manage', 'university_lectures.attendance.correct_approved'])->isNotEmpty()) {
            $this->addStudentSection($studentIds, $metrics, $charts);
        }
        if ($permissions->contains('attendance.review')) {
            $this->addAttendanceSection($studentIds, $metrics, $charts, $attention);
        }
        if ($permissions->intersect(['university_lectures.manage', 'university_lectures.attendance.view', 'university_lectures.attendance.manage', 'university_lectures.attendance.correct_approved'])->isNotEmpty()) {
            $this->addUniversityAttendanceSection($studentIds, $charts);
        }
        if ($permissions->contains('grades.view')) {
            $this->addGradesSection($studentIds, $metrics, $charts);
        }
        if ($permissions->contains('assessment.review')) {
            $this->addAssessmentSection($studentIds, $metrics, $charts);
        }
        if ($permissions->intersect(['distribution.view', 'clinical_schedule.view'])->isNotEmpty()) {
            $this->addDistributionSection($studentIds, $metrics, $charts, $attention, $permissions);
        }
        if ($permissions->contains('courses.view')) {
            $this->addCourseSection($metrics);
        }
        if ($permissions->contains('group_registration.view')) {
            $this->addGroupRegistrationSection($metrics, $charts);
        }
        if ($permissions->contains('tasks.view')) {
            $this->addTaskSection($user, $metrics, $charts, $attention);
        }
        if ($permissions->contains('correspondence.view')) {
            $this->addCorrespondenceSection($user, $metrics, $charts, $attention);
        }
        if ($permissions->contains('meetings.manage')) {
            $this->addMeetingSection($metrics, $charts, $attention);
        }
        if ($permissions->contains('approvals.view')) {
            $this->addApprovalSection($user, $metrics, $attention);
        }
        if ($permissions->contains('quality.view')) {
            $this->addQualitySection($metrics, $charts, $attention);
        }
        if ($permissions->contains('advising.view')) {
            $this->addAdvisingSection($studentIds, $metrics, $charts, $attention);
        }
        if ($permissions->intersect(['users.manage', 'audit.view', 'settings.manage'])->isNotEmpty()) {
            $this->addSystemSection($metrics, $charts, $attention, $permissions);
        }

        return [
            'profile' => [
                'name' => $user->name,
                'focus' => $focus,
                'roles' => $roleCodes->all(),
                'assigned_levels' => $levels,
                'scope_student_count' => $studentIds->count(),
                'academic_year' => $this->academicYear?->only(['id', 'code']),
                'attendance_domain' => 'clinical',
            ],
            'metrics' => $metrics->unique('key')->values()->all(),
            'charts' => $charts->unique('key')->map(fn (array $chart) => $chart + ['route' => $this->chartRoute($chart['key'], $permissions)])->values()->all(),
            'attention' => $attention->filter(fn (array $item) => $item['count'] > 0)->unique('key')->sortBy(fn ($item) => ['urgent' => 0, 'review' => 1, 'notice' => 2][$item['severity']] ?? 3)->values()->all(),
            'activity' => $this->recentActivity($user, $permissions),
            'generated_at' => now()->toIso8601String(),
        ];
    }

    private function permissionCodes(User $user): Collection
    {
        return DB::table('permissions')
            ->join('role_permissions', 'role_permissions.permission_id', '=', 'permissions.id')
            ->join('user_roles', 'user_roles.role_id', '=', 'role_permissions.role_id')
            ->where('user_roles.user_id', $user->id)
            ->where('role_permissions.scope_type', 'global')
            ->pluck('permissions.code')
            ->merge($user->directPermissions()->pluck('code'))
            ->unique()
            ->values();
    }

    private function studentIds(Collection $permissions): Collection
    {
        if ($permissions->intersect(['students.view', 'attendance.view', 'attendance.review', 'grades.view', 'assessment.view', 'assessment.review', 'distribution.view', 'clinical_schedule.view', 'advising.view', 'university_lectures.manage', 'university_lectures.attendance.view', 'university_lectures.attendance.manage', 'university_lectures.attendance.correct_approved'])->isEmpty()) {
            return collect();
        }

        return $this->applyStudentAccessScope(Student::query())
            ->where('registration_status', 'active')
            ->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])
            ->pluck('students.id');
    }

    private function addStudentSection(Collection $studentIds, Collection $metrics, Collection $charts): void
    {
        $query = Student::query()->whereIn('id', $studentIds);
        $total = (clone $query)->count();
        $registered = (clone $query)->where('academic_registration_status', 'registered')->count();
        $metrics->push($this->metric('students_total', 'الطلبة ضمن نطاقك', 'Students in your scope', $total, null, '/directory'));
        $metrics->push($this->metric('students_registered', 'المسجلون أكاديمياً', 'Academically registered', $registered, null, '/directory'));

        $levelCounts = (clone $query)
            ->select('academic_level', DB::raw('COUNT(*) as total'))
            ->groupBy('academic_level')
            ->pluck('total', 'academic_level');
        $charts->push($this->chart('students_by_level', 'bar', 'توزيع الطلبة حسب الدفعة', 'Students by cohort', collect(['fourth', 'fifth', 'sixth'])->map(
            fn (string $level) => $this->chartItem($this->levelAr($level), ucfirst($level).' year', (int) ($levelCounts[$level] ?? 0)),
        )->all()));

        $charts->push($this->chart('academic_registration', 'donut', 'حالة التسجيل الأكاديمي', 'Academic registration status', [
            $this->chartItem('مسجل', 'Registered', $registered),
            $this->chartItem('غير مسجل', 'Not registered', max(0, $total - $registered)),
        ]));
    }

    private function addAttendanceSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = $this->clinicalAttendance($studentIds);
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $recorded = (int) $counts->sum();
        $absent = (int) ($counts['absent'] ?? 0);
        $attendanceRate = $recorded > 0 ? round((((int) ($counts['present'] ?? 0) + (int) ($counts['late'] ?? 0)) / $recorded) * 100, 1) : 0;
        $metrics->push($this->metric('attendance_rate', 'نسبة حضور التدريب السريري', 'Clinical training attendance rate', $attendanceRate, '%', '/attendance'));
        $metrics->push($this->metric('attendance_absent', 'غيابات التدريب السريري المسجلة', 'Recorded clinical training absences', $absent, null, '/attendance'));

        $charts->push($this->chart('attendance_status', 'donut', 'حضور التدريب السريري بالمراكز', 'Clinical training attendance at sites', collect(['present', 'absent', 'late', 'excused'])->map(
            fn (string $status) => $this->chartItem($this->attendanceAr($status), ucfirst($status), (int) ($counts[$status] ?? 0)),
        )->all()));

        $months = collect(range(5, 0))->map(fn (int $offset) => Carbon::now()->startOfMonth()->subMonths($offset));
        $trendRows = DB::table('attendance_records')
            ->whereIn('attendance_records.id', (clone $query)->select('attendance_records.id'))
            ->join('clinical_sessions', 'clinical_sessions.id', '=', 'attendance_records.clinical_session_id')
            ->whereIn('attendance_records.student_id', $studentIds)
            ->where('attendance_records.status', 'absent')
            ->whereBetween('clinical_sessions.session_date', [$months->first()->toDateString(), today()->toDateString()])
            ->get(['clinical_sessions.session_date']);
        $trendCounts = $trendRows->countBy(fn ($row) => Carbon::parse($row->session_date)->format('Y-m'));
        $charts->push($this->chart('absence_trend', 'line', 'غياب التدريب السريري خلال 6 أشهر', 'Six-month clinical training absence trend', $months->map(
            fn (Carbon $month) => $this->chartItem($month->copy()->locale('ar')->translatedFormat('M Y'), $month->format('M Y'), (int) ($trendCounts[$month->format('Y-m')] ?? 0)),
        )->all()));

        [$initial, $urgent] = $this->absenceRiskCounts($studentIds);
        $attention->push($this->attention('attendance_initial', 'غياب ميداني يتجاوز 10% للمراجعة', 'Review clinical training absence above 10%', $initial, '/attendance', 'notice'));
        $attention->push($this->attention('attendance_urgent', 'غياب ميداني يتجاوز 20% للمراجعة', 'Review clinical training absence above 20%', $urgent, '/attendance', 'urgent'));
    }

    private function addUniversityAttendanceSection(Collection $studentIds, Collection $charts): void
    {
        $campus = ClinicalUniversityAttendanceRecord::query()->whereIn('student_id', $studentIds)
            ->whereHas('session', fn ($session) => $session->whereBetween('session_date', [$this->academicYear?->start_date?->toDateString() ?? '9999-01-01', min(today()->toDateString(), $this->academicYear?->end_date?->toDateString() ?? today()->toDateString())])
                ->where(fn ($final) => $final->whereNull('qr_state')->orWhere('qr_state', 'closed')->orWhereNotNull('approved_at')))
            ->whereHas('session.lecture.group', fn ($group) => $group->where('academic_year_id', $this->academicYear?->id ?? 0)->whereIn('academic_level', ['fourth', 'fifth', 'sixth']))
            ->whereNotNull('status')->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $charts->push($this->chart('university_attendance_status', 'donut', 'حضور محاضرات الجامعة للسريري', 'Clinical university lecture attendance', collect(AttendanceRecord::STATUSES)->map(fn ($status) => $this->chartItem($this->attendanceAr($status), ucfirst($status), (int) ($campus[$status] ?? 0)))->all()));
    }

    private function addGradesSection(Collection $studentIds, Collection $metrics, Collection $charts): void
    {
        $query = DB::table('grade_entries')
            ->join('student_course_enrollments', 'student_course_enrollments.id', '=', 'grade_entries.student_course_enrollment_id')
            ->whereIn('student_course_enrollments.student_id', $studentIds)
            ->where('student_course_enrollments.academic_year_id', $this->academicYear?->id ?? 0);
        $courseIds = app(DepartmentHeadCourseScope::class)->courseIds();
        if ($courseIds !== null) {
            $query->whereIn('student_course_enrollments.course_id', $courseIds);
        }
        $counts = (clone $query)->select('grade_entries.status', DB::raw('COUNT(*) as total'))->groupBy('grade_entries.status')->pluck('total', 'grade_entries.status');
        $total = (int) $counts->sum();
        $approved = (int) (($counts['approved'] ?? 0) + ($counts['published'] ?? 0));
        $metrics->push($this->metric('grades_completion', 'نسبة اعتماد سجلات العلامات المحفوظة', 'Approved share of saved grade records', $total > 0 ? round(($approved / $total) * 100, 1) : 0, '%', '/grades'));
        $charts->push($this->chart('grade_workflow', 'bar', 'حالة سجلات العلامات المحفوظة', 'Saved grade record status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
    }

    private function addAssessmentSection(Collection $studentIds, Collection $metrics, Collection $charts): void
    {
        $query = app(DepartmentHeadCourseScope::class)->assessments(ClinicalAssessment::query())->whereIn('student_id', $studentIds)
            ->whereHas('clinicalAssignment.distributionVersion', fn ($version) => $version->where('status', 'published')->where('is_current', true))
            ->whereHas('clinicalAssignment.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $this->academicYear?->id ?? 0));
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('assessments_total', 'سجلات تقييم التوزيع الحالي', 'Current distribution assessment records', (int) $counts->sum(), null, '/assessments'));
        $charts->push($this->chart('assessment_workflow', 'donut', 'حالة تقييمات التوزيع السريري الحالي', 'Current clinical distribution assessment status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
    }

    private function addDistributionSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention, Collection $permissions): void
    {
        $route = $permissions->contains('clinical_schedule.view') ? '/clinical/schedule' : '/distribution';
        $query = DB::table('student_clinical_assignments')
            ->join('distribution_versions', 'distribution_versions.id', '=', 'student_clinical_assignments.distribution_version_id')
            ->where('distribution_versions.status', 'published')
            ->where('distribution_versions.is_current', true)
            ->whereIn('distribution_versions.rotation_id', DB::table('rotations')->where('academic_year_id', $this->academicYear?->id ?? 0)->select('id'))
            ->whereIn('student_clinical_assignments.student_id', $studentIds);
        if (app(DepartmentHeadCourseScope::class)->departmentIds() !== null) {
            $query->whereIn('student_clinical_assignments.id', app(DepartmentHeadCourseScope::class)->publishedAssignments()->select('student_clinical_assignments.id'));
        }
        $placements = (clone $query)->count();
        $assignedStudents = (clone $query)->distinct()->count('student_clinical_assignments.student_id');
        $unsupervised = (clone $query)->whereNull('student_clinical_assignments.supervisor_id')->count();
        $metrics->push($this->metric('published_placements', 'التعيينات السريرية المنشورة', 'Published clinical placements', $placements, null, $route));
        $metrics->push($this->metric('distribution_coverage', 'تغطية التوزيع السريري', 'Clinical distribution coverage', $studentIds->count() > 0 ? round(($assignedStudents / $studentIds->count()) * 100, 1) : 0, '%', $route));
        $attention->push($this->attention('unsupervised', 'تعيينات بدون مشرف سريري', 'Placements without a supervisor', $unsupervised, $route, 'urgent'));

        $departmentRows = (clone $query)
            ->leftJoin('departments', 'departments.id', '=', 'student_clinical_assignments.department_id')
            ->select('departments.name_ar', 'departments.name_en', DB::raw('COUNT(*) as total'))
            ->groupBy('departments.id', 'departments.name_ar', 'departments.name_en')
            ->orderByDesc('total')->limit(8)->get();
        $charts->push($this->chart('distribution_departments', 'bar', 'مقارنة التعيينات حسب القسم', 'Placements by department', $departmentRows->map(
            fn ($row) => $this->chartItem($row->name_ar ?: 'غير محدد', $row->name_en ?: 'Unspecified', (int) $row->total),
        )->all()));
    }

    private function addCourseSection(Collection $metrics): void
    {
        $levels = $this->getEffectiveAcademicLevelScope();
        $query = DB::table('courses')->where('is_active', true)->whereIn('academic_level', ['fourth', 'fifth', 'sixth']);
        $courseIds = app(DepartmentHeadCourseScope::class)->courseIds();
        if ($courseIds !== null) {
            $query->whereIn('id', $courseIds);
        }
        if ($levels !== null) {
            $english = collect($levels)->intersect(['fourth', 'fifth', 'sixth'])->values();
            $english->isEmpty() ? $query->whereRaw('1 = 0') : $query->whereIn('academic_level', $english);
        }
        $metrics->push($this->metric('active_courses', 'المساقات السريرية الفعالة', 'Active clinical courses', $query->count(), null, '/courses'));
    }

    private function addGroupRegistrationSection(Collection $metrics, Collection $charts): void
    {
        $levels = $this->getEffectiveAcademicLevelScope();
        $query = DB::table('group_registration_cycles')->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])->where('academic_year_id', $this->academicYear?->id ?? 0);
        if (app(DepartmentHeadCourseScope::class)->departmentIds() !== null) {
            $query->whereIn('id', app(DepartmentHeadCourseScope::class)->rosters(StudentGroupRoster::query())->select('group_registration_cycle_id'));
        }
        if ($levels !== null) {
            $english = collect($levels)->intersect(['fourth', 'fifth', 'sixth'])->values();
            $english->isEmpty() ? $query->whereRaw('1 = 0') : $query->whereIn('academic_level', $english);
        }
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('registration_cycles', 'دورات تسجيل المجموعات السريرية', 'Clinical group-registration cycles', (int) $counts->sum(), null, '/distribution/groups'));
        $charts->push($this->chart('registration_cycles_status', 'donut', 'حالة تسجيل المجموعات', 'Group-registration cycle status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
    }

    private function addTaskSection(User $user, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = DB::table('operational_tasks')->where(fn (Builder $q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id));
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $open = (int) (($counts['open'] ?? 0) + ($counts['in_progress'] ?? 0));
        $overdue = (clone $query)->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled'])->count();
        $metrics->push($this->metric('my_open_tasks', 'مهامي والتكليفات المفتوحة', 'My open tasks and assignments', $open, null, '/tasks'));
        $charts->push($this->chart('my_tasks_status', 'bar', 'حالة مهامي وتكليفاتي', 'My task status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('overdue_tasks', 'مهام متأخرة عن موعدها', 'Overdue tasks', $overdue, '/tasks', 'urgent'));
    }

    private function addCorrespondenceSection(User $user, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = $this->visibleCorrespondence($user);
        $counts = (clone $query)->select('status', DB::raw('COUNT(DISTINCT correspondence.id) as total'))->groupBy('status')->pluck('total', 'status');
        $unread = DB::table('correspondence_participants')
            ->join('correspondence', 'correspondence.id', '=', 'correspondence_participants.correspondence_id')
            ->where('correspondence_participants.user_id', $user->id)
            ->where(fn ($inbox) => $inbox->where('correspondence_participants.participant_role', '!=', 'sender')->orWhereExists(fn ($replies) => $replies->selectRaw('1')->from('correspondence_messages')->whereColumn('correspondence_messages.correspondence_id', 'correspondence.id')->where('correspondence_messages.sender_id', '!=', $user->id)))
            ->whereNull('correspondence_participants.deleted_at')
            ->whereNull('correspondence_participants.archived_at')
            ->where('correspondence.status', 'sent')
            ->where(fn (Builder $query) => $query->whereNull('correspondence_participants.read_at')->orWhereColumn('correspondence_participants.read_at', '<', 'correspondence.last_message_at'))
            ->distinct()->count('correspondence.id');
        $metrics->push($this->metric('correspondence_active', 'رسائل غير مقروءة', 'Unread mail', $unread, null, '/inbox'));
        $charts->push($this->chart('correspondence_status', 'donut', 'حالة المراسلات', 'Correspondence status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('unread_correspondence', 'مراسلات واردة غير مقروءة', 'Unread incoming correspondence', $unread, '/inbox', 'notice'));
    }

    private function addMeetingSection(Collection $metrics, Collection $charts, Collection $attention): void
    {
        $counts = DB::table('meetings')->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $upcoming = DB::table('meetings')->whereDate('meeting_date', '>=', now()->toDateString())->where('status', 'scheduled')->count();
        $metrics->push($this->metric('upcoming_meetings', 'الاجتماعات القادمة', 'Upcoming meetings', $upcoming, null, '/meetings'));
        $charts->push($this->chart('meeting_status', 'bar', 'حالة الاجتماعات والمحاضر', 'Meeting and minutes status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('minutes_pending', 'محاضر بانتظار الاعتماد', 'Minutes awaiting approval', (int) ($counts['minutes_draft'] ?? 0), '/meetings', 'review'));
    }

    private function addApprovalSection(User $user, Collection $metrics, Collection $attention): void
    {
        $roles = $user->roles()->pluck('code')->all();
        $query = app(DepartmentHeadCourseScope::class)->approvals(ApprovalRequest::query())
            ->where('status', 'pending')->whereHas('workflow', fn ($workflow) => $workflow->where('code', '!=', 'correspondence'))
            ->whereHas('workflow.steps', fn ($step) => $step->whereColumn('approval_workflow_steps.step_order', 'approval_requests.current_step_order')
                ->where(function ($rolesQuery) use ($roles) {
                    if (! $roles) {
                        $rolesQuery->whereRaw('1 = 0');
                    }
                    foreach ($roles as $role) {
                        $rolesQuery->orWhereJsonContains('role_codes', $role);
                    }
                }))
            ->with(['workflow.steps', 'actions']);
        $count = $query->get()->filter(fn ($request) => app(ApprovalWorkflowService::class)->canApproveCurrentStep($request, $user))->count();
        $metrics->push($this->metric('approval_queue', 'طلبات الاعتماد المتاحة لمرحلتك', 'Approval requests available for your stage', $count, null, '/approvals'));
        $attention->push($this->attention('approval_queue', 'طلبات اعتماد متاحة لمرحلتك', 'Approval requests available for your stage', $count, '/approvals', 'review'));
    }

    private function addQualitySection(Collection $metrics, Collection $charts, Collection $attention): void
    {
        $activeSurveys = DB::table('quality_surveys')->where('is_active', true)->count();
        $openPlans = DB::table('quality_improvement_plans')->whereNotIn('status', ['closed', 'completed'])->count();
        $kpis = DB::table('quality_kpis')->count();
        $responses = DB::table('quality_survey_responses')->count();
        $metrics->push($this->metric('quality_surveys', 'الاستبيانات الفعالة', 'Active quality surveys', $activeSurveys, null, '/quality/surveys'));
        $metrics->push($this->metric('quality_kpis', 'مؤشرات الجودة', 'Quality KPIs', $kpis, null, '/quality/kpis'));
        $charts->push($this->chart('quality_overview', 'bar', 'مقارنة بيانات الجودة', 'Quality data comparison', [
            $this->chartItem('استبيانات فعالة', 'Active surveys', $activeSurveys),
            $this->chartItem('استجابات', 'Responses', $responses),
            $this->chartItem('خطط مفتوحة', 'Open plans', $openPlans),
            $this->chartItem('مؤشرات', 'KPIs', $kpis),
        ]));
        $attention->push($this->attention('quality_open_plans', 'خطط تحسين ما زالت مفتوحة', 'Open improvement plans', $openPlans, '/quality/improvement', 'review'));
    }

    private function addAdvisingSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = DB::table('advising_records')->whereIn('student_id', $studentIds);
        $this->academicYear
            ? $query->whereBetween('meeting_date', [$this->academicYear->start_date->toDateString(), $this->academicYear->end_date->toDateString()])
            : $query->whereRaw('1 = 0');
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('advising_records', 'سجلات الإرشاد', 'Advising records', (int) $counts->sum(), null, '/advising'));
        $charts->push($this->chart('advising_status', 'donut', 'حالة ملفات الإرشاد', 'Advising case status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), $this->workflowEn((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('advising_open', 'حالات إرشاد مفتوحة', 'Open advising cases', (int) ($counts['open'] ?? 0), '/advising', 'notice'));
    }

    private function addSystemSection(Collection $metrics, Collection $charts, Collection $attention, Collection $permissions): void
    {
        $activeUsers = DB::table('users')->where('is_active', true)->count();
        $activeSessions = DB::table(config('session.table', 'sessions'))->whereNotNull('user_id')->where('last_activity', '>=', now()->subMinutes((int) config('session.lifetime'))->timestamp)->count();
        $auditCount = DB::table('audit_logs')->count();
        $failedJobs = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;
        if ($permissions->contains('users.manage')) {
            $metrics->prepend($this->metric('system_users', 'الحسابات الفعالة', 'Active user accounts', $activeUsers, null, '/users'));
            $metrics->prepend($this->metric('system_sessions', 'جلسات الحسابات النشطة', 'Active authenticated sessions', $activeSessions, null, '/admin/sessions'));
        }
        if ($permissions->contains('audit.view')) {
            $metrics->push($this->metric('audit_events', 'أحداث سجل التدقيق', 'Audit events', $auditCount, null, '/audit-logs'));
        }

        $roleCounts = DB::table('roles')->leftJoin('user_roles', 'user_roles.role_id', '=', 'roles.id')
            ->select('roles.code', DB::raw('COUNT(user_roles.user_id) as total'))
            ->groupBy('roles.id', 'roles.code')->orderByDesc('total')->get();
        if ($permissions->contains('users.manage')) {
            $charts->prepend($this->chart('users_by_role', 'bar', 'توزيع الحسابات حسب الدور', 'User accounts by role', $roleCounts->map(
                fn ($row) => $this->chartItem($this->roleAr($row->code), $this->roleEn($row->code), (int) $row->total),
            )->all()));
        }
        if ($permissions->contains('settings.manage')) {
            $attention->push($this->attention('failed_jobs', 'عمليات خلفية فاشلة', 'Failed background jobs', $failedJobs, '/admin/health', 'urgent'));
        }
    }

    private function absenceRiskCounts(Collection $studentIds): array
    {
        $records = $this->clinicalAttendance($studentIds)
            ->with('session.rotationBlock.rotation.course:id,credit_hours')
            ->whereIn('student_id', $studentIds)
            ->where('status', 'absent')
            ->get()
            ->filter(fn (AttendanceRecord $record) => $record->session?->session_date && $record->session?->rotationBlock?->rotation?->course);
        $initial = 0;
        $urgent = 0;
        foreach ($records->groupBy(fn (AttendanceRecord $record) => $record->student_id.'|'.$record->session->rotationBlock->rotation_id) as $group) {
            $course = $group->first()->session->rotationBlock->rotation->course;
            $required = (int) $course->credit_hours * 5;
            if ($required <= 0) {
                continue;
            }
            $days = $group->map(fn (AttendanceRecord $record) => $record->session->session_date->toDateString())->unique()->count();
            $percentage = ($days / $required) * 100;
            if ($percentage > 20) {
                $urgent++;
            } elseif ($percentage > 10) {
                $initial++;
            }
        }

        return [$initial, $urgent];
    }

    private function recentActivity(User $user, Collection $permissions): array
    {
        $items = collect();
        if ($permissions->contains('tasks.view')) {
            DB::table('operational_tasks')->where(fn (Builder $q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id))
                ->latest('updated_at')->limit(4)->get()->each(function ($task) use ($items) {
                    $items->push([
                        'key' => 'task-'.$task->id, 'type' => 'task', 'title' => $task->title,
                        'subtitle_ar' => 'مهمة · '.$this->workflowAr($task->status), 'subtitle_en' => 'Task · '.$this->workflowEn($task->status),
                        'at' => $task->updated_at, 'route' => '/tasks',
                    ]);
                });
        }
        if ($permissions->contains('correspondence.view')) {
            $this->visibleCorrespondence($user)->select('correspondence.*')->distinct()->latest('correspondence.updated_at')->limit(4)->get()->each(function ($item) use ($items) {
                $items->push([
                    'key' => 'correspondence-'.$item->id, 'type' => 'correspondence', 'title' => $item->subject,
                    'subtitle_ar' => 'مراسلة · '.$this->workflowAr($item->status), 'subtitle_en' => 'Correspondence · '.$this->workflowEn($item->status),
                    'at' => $item->updated_at, 'route' => '/correspondence/'.$item->id,
                ]);
            });
        }
        if ($permissions->contains('audit.view')) {
            DB::table('audit_logs')->latest('created_at')->limit(4)->get()->each(function ($log) use ($items) {
                $items->push([
                    'key' => 'audit-'.$log->id, 'type' => 'audit', 'title' => $log->action,
                    'subtitle_ar' => 'حدث في سجل التدقيق', 'subtitle_en' => 'Audit-log event',
                    'at' => $log->created_at, 'route' => '/audit-logs',
                ]);
            });
        }

        return $items->sortByDesc('at')->take(8)->values()->all();
    }

    private function visibleCorrespondence(User $user): Builder
    {
        return DB::table('correspondence')->leftJoin('correspondence_participants as mine', function ($join) use ($user) {
            $join->on('mine.correspondence_id', '=', 'correspondence.id')->where('mine.user_id', $user->id);
        })
            ->where(fn (Builder $query) => $query->where(fn ($draft) => $draft->where('correspondence.status', 'draft')->where('correspondence.sender_id', $user->id))
                ->orWhere(fn ($sent) => $sent->where('correspondence.status', 'sent')->whereNotNull('mine.id')->whereNull('mine.deleted_at')->whereNull('mine.archived_at')));

    }

    private function clinicalAttendance(Collection $studentIds): \Illuminate\Database\Eloquent\Builder
    {
        return app(DepartmentHeadCourseScope::class)->throughRotation(AttendanceRecord::query(), 'session.rotationBlock.rotation')
            ->whereIn('student_id', $studentIds)->whereHas('session', fn ($session) => $session->whereBetween('session_date', [$this->academicYear?->start_date?->toDateString() ?? '9999-01-01', min(today()->toDateString(), $this->academicYear?->end_date?->toDateString() ?? today()->toDateString())]))
            ->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $this->academicYear?->id ?? 0)
                ->whereHas('course', fn ($course) => $course->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])));
    }

    private function chartRoute(string $key, Collection $permissions): ?string
    {
        $routes = [
            'attendance_status' => ['/attendance', ['attendance.review']], 'absence_trend' => ['/attendance', ['attendance.review']],
            'university_attendance_status' => ['/attendance/university', ['university_lectures.manage', 'university_lectures.attendance.view', 'university_lectures.attendance.manage', 'university_lectures.attendance.correct_approved']],
            'students_by_level' => ['/directory', ['students.view']], 'academic_registration' => ['/directory', ['students.view']],
            'grade_workflow' => ['/grades', ['grades.view']], 'assessment_workflow' => ['/assessments', ['assessment.review']],
            'distribution_departments' => ['/clinical/schedule', ['clinical_schedule.view']], 'registration_cycles_status' => ['/distribution/groups', ['group_registration.view']],
            'my_tasks_status' => ['/tasks', ['tasks.view']], 'correspondence_status' => ['/inbox', ['correspondence.view']],
            'meeting_status' => ['/meetings', ['meetings.manage']], 'advising_status' => ['/advising', ['advising.view']],
            'quality_overview' => ['/quality', ['quality.view']], 'users_by_role' => ['/users', ['users.manage']],
        ];
        if ($key === 'distribution_departments' && ! $permissions->contains('clinical_schedule.view') && $permissions->contains('distribution.view')) {
            return '/distribution';
        }
        $route = $routes[$key] ?? null;

        return $route && $permissions->intersect($route[1])->isNotEmpty() ? $route[0] : null;
    }

    private function workflowEn(string $status): string
    {
        return ucwords(str_replace('_', ' ', $status));
    }

    private function focus(Collection $roles): string
    {
        foreach (['SYS_ADMIN' => 'system', 'CLINICAL_DIRECTOR' => 'clinical_leadership', 'DEAN' => 'faculty_leadership', 'VICE_DEAN' => 'faculty_leadership', 'DEPARTMENT_HEAD' => 'department', 'RTA' => 'cohort', 'CLINICAL_SUPERVISOR' => 'supervisor', 'ACADEMIC_ADVISOR' => 'advising', 'QUALITY' => 'quality', 'ADMIN_ASSISTANT' => 'operations'] as $role => $focus) {
            if ($roles->contains($role)) {
                return $focus;
            }
        }

        return 'general';
    }

    private function metric(string $key, string $ar, string $en, int|float $value, ?string $unit, string $route): array
    {
        return compact('key', 'value', 'unit', 'route') + ['label_ar' => $ar, 'label_en' => $en];
    }

    private function chart(string $key, string $type, string $ar, string $en, array $items): array
    {
        $notes = [
            'attendance_status' => ['عدد سجلات الحضور والغياب، وليس عدد الطلبة المختلفين.', 'Attendance records, not distinct students.'],
            'university_attendance_status' => ['كشوف محاضرات السريري المعتمدة فقط.', 'Approved clinical lecture registers only.'],
            'grade_workflow' => ['سجلات علامات الطلبة المحفوظة، وليس عدد كشوف المساقات.', 'Saved student grade records, not course grade sheets.'],
            'assessment_workflow' => ['التقييمات المسجلة في التوزيع المنشور الحالي.', 'Recorded assessments in the current published distribution.'],
            'distribution_departments' => ['عدد التعيينات؛ قد يتكرر الطالب في أكثر من أسبوع.', 'Placement records; a student may have placements in several weeks.'],
            'users_by_role' => ['قد يحمل الحساب الواحد أكثر من دور.', 'One account can hold more than one role.'],
        ];

        return compact('key', 'type', 'items') + ['title_ar' => $ar, 'title_en' => $en, 'description_ar' => $notes[$key][0] ?? null, 'description_en' => $notes[$key][1] ?? null];
    }

    private function chartItem(string $ar, string $en, int|float $value): array
    {
        return compact('value') + ['label_ar' => $ar, 'label_en' => $en];
    }

    private function attention(string $key, string $ar, string $en, int $count, string $route, string $severity): array
    {
        return compact('key', 'count', 'route', 'severity') + ['label_ar' => $ar, 'label_en' => $en];
    }

    private function levelAr(string $level): string
    {
        return ['fourth' => 'السنة الرابعة', 'fifth' => 'السنة الخامسة', 'sixth' => 'السنة السادسة'][$level] ?? $level;
    }

    private function attendanceAr(string $status): string
    {
        return ['present' => 'حاضر', 'absent' => 'غائب', 'late' => 'متأخر', 'excused' => 'بعذر'][$status] ?? $status;
    }

    private function roleAr(string $role): string
    {
        return [
            'SYS_ADMIN' => 'مدير النظام', 'DEAN' => 'عميد الكلية', 'VICE_DEAN' => 'نائب العميد',
            'CLINICAL_DIRECTOR' => 'مدير الدائرة السريرية', 'ADMIN_ASSISTANT' => 'مساعد إداري',
            'DEPARTMENT_HEAD' => 'رئيس القسم الأكاديمي', 'RTA' => 'مساعد بحث وتدريس',
            'CLINICAL_SUPERVISOR' => 'مشرف سريري', 'ACADEMIC_ADVISOR' => 'مرشد أكاديمي',
            'QUALITY' => 'مسؤول الجودة',
        ][$role] ?? $role;
    }

    private function roleEn(string $role): string
    {
        return [
            'SYS_ADMIN' => 'System Administrator', 'DEAN' => 'Dean', 'VICE_DEAN' => 'Vice Dean',
            'CLINICAL_DIRECTOR' => 'Clinical Director', 'ADMIN_ASSISTANT' => 'Administrative Assistant',
            'DEPARTMENT_HEAD' => 'Department Head', 'RTA' => 'Research & Teaching Assistant',
            'CLINICAL_SUPERVISOR' => 'Clinical Supervisor', 'ACADEMIC_ADVISOR' => 'Academic Advisor',
            'QUALITY' => 'Quality Officer',
        ][$role] ?? $role;
    }

    private function workflowAr(string $status): string
    {
        return [
            'draft' => 'مسودة', 'open' => 'مفتوح', 'opened' => 'مفتوح', 'closed' => 'مغلق', 'archived' => 'مؤرشف',
            'in_progress' => 'قيد التنفيذ', 'completed' => 'منجز', 'cancelled' => 'ملغي', 'submitted' => 'مرسل للاعتماد',
            'scheduled' => 'مجدول', 'held' => 'عُقد الاجتماع', 'minutes_draft' => 'محضر قيد الإعداد', 'sent' => 'مرسل', 'not_entered' => 'لم يدخل بعد', 'approved' => 'معتمد', 'published' => 'منشور', 'returned' => 'معاد للتعديل', 'pending' => 'قيد الانتظار',
        ][$status] ?? $status;
    }
}
