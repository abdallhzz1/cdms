<?php

namespace App\Services;

use App\Models\AttendanceRecord;
use App\Models\Student;
use App\Models\User;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

class DashboardOverviewService
{
    use ScopesByDepartmentAndLevel;

    /** @return array<string, mixed> */
    public function forUser(User $user): array
    {
        $roleCodes = $user->roles()->pluck('code')->unique()->values();
        $permissions = $this->permissionCodes($user);
        $focus = $this->focus($roleCodes);
        $levels = collect($user->assigned_levels ?? [])->values()->all();
        $metrics = collect();
        $charts = collect();
        $attention = collect();

        $studentIds = $this->studentIds($permissions);
        if ($permissions->intersect(['students.view', 'attendance.view', 'grades.view', 'assessment.view', 'distribution.view', 'clinical_schedule.view'])->isNotEmpty()) {
            $this->addStudentSection($studentIds, $metrics, $charts);
        }
        if ($permissions->contains('attendance.view')) {
            $this->addAttendanceSection($studentIds, $metrics, $charts, $attention);
        }
        if ($permissions->contains('grades.view')) {
            $this->addGradesSection($studentIds, $metrics, $charts, $attention, $permissions);
        }
        if ($permissions->contains('assessment.view')) {
            $this->addAssessmentSection($studentIds, $metrics, $charts, $attention, $permissions);
        }
        if ($permissions->intersect(['distribution.view', 'clinical_schedule.view'])->isNotEmpty()) {
            $this->addDistributionSection($studentIds, $metrics, $charts, $attention);
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
        if ($permissions->intersect(['quality.view', 'quality.manage', 'kpi.manage'])->isNotEmpty()) {
            $this->addQualitySection($metrics, $charts, $attention);
        }
        if ($permissions->contains('advising.view')) {
            $this->addAdvisingSection($user, $metrics, $charts, $attention);
        }
        if ($roleCodes->contains('SYS_ADMIN')) {
            $this->addSystemSection($metrics, $charts, $attention);
        }

        return [
            'profile' => [
                'name' => $user->name,
                'focus' => $focus,
                'roles' => $roleCodes->all(),
                'assigned_levels' => $levels,
                'scope_student_count' => $studentIds->count(),
            ],
            'metrics' => $metrics->unique('key')->values()->all(),
            'charts' => $charts->unique('key')->values()->all(),
            'attention' => $attention->filter(fn (array $item) => $item['count'] > 0)->unique('key')->values()->all(),
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
            ->unique()
            ->values();
    }

    private function studentIds(Collection $permissions): Collection
    {
        if ($permissions->intersect(['students.view', 'attendance.view', 'grades.view', 'assessment.view', 'distribution.view', 'clinical_schedule.view'])->isEmpty()) {
            return collect();
        }

        return $this->applyStudentAccessScope(Student::query())
            ->where('registration_status', 'active')
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
        $query = DB::table('attendance_records')->whereIn('student_id', $studentIds);
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $recorded = (int) $counts->sum();
        $absent = (int) ($counts['absent'] ?? 0);
        $attendanceRate = $recorded > 0 ? round((($recorded - $absent) / $recorded) * 100, 1) : 0;
        $metrics->push($this->metric('attendance_rate', 'نسبة الالتزام بالحضور', 'Attendance compliance', $attendanceRate, '%', '/attendance'));
        $metrics->push($this->metric('attendance_absent', 'حالات الغياب المسجلة', 'Recorded absences', $absent, null, '/attendance'));

        $charts->push($this->chart('attendance_status', 'donut', 'مقارنة حالات الحضور', 'Attendance status comparison', collect(['present', 'absent', 'late', 'excused'])->map(
            fn (string $status) => $this->chartItem($this->attendanceAr($status), ucfirst($status), (int) ($counts[$status] ?? 0)),
        )->all()));

        $months = collect(range(5, 0))->map(fn (int $offset) => Carbon::now()->startOfMonth()->subMonths($offset));
        $trendRows = DB::table('attendance_records')
            ->join('clinical_sessions', 'clinical_sessions.id', '=', 'attendance_records.clinical_session_id')
            ->whereIn('attendance_records.student_id', $studentIds)
            ->where('attendance_records.status', 'absent')
            ->whereDate('clinical_sessions.session_date', '>=', $months->first()->toDateString())
            ->get(['clinical_sessions.session_date']);
        $trendCounts = $trendRows->countBy(fn ($row) => Carbon::parse($row->session_date)->format('Y-m'));
        $charts->push($this->chart('absence_trend', 'line', 'اتجاه الغياب خلال 6 أشهر', 'Six-month absence trend', $months->map(
            fn (Carbon $month) => $this->chartItem($month->translatedFormat('M Y'), $month->format('M Y'), (int) ($trendCounts[$month->format('Y-m')] ?? 0)),
        )->all()));

        [$initial, $urgent] = $this->absenceRiskCounts($studentIds);
        $attention->push($this->attention('attendance_initial', 'تنبيهات غياب أولية', 'Initial absence notices', $initial, '/attendance', 'notice'));
        $attention->push($this->attention('attendance_urgent', 'إنذارات غياب رسمية', 'Formal absence warnings', $urgent, '/attendance', 'urgent'));
    }

    private function addGradesSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention, Collection $permissions): void
    {
        $query = DB::table('grade_entries')
            ->join('student_course_enrollments', 'student_course_enrollments.id', '=', 'grade_entries.student_course_enrollment_id')
            ->whereIn('student_course_enrollments.student_id', $studentIds);
        $counts = (clone $query)->select('grade_entries.status', DB::raw('COUNT(*) as total'))->groupBy('grade_entries.status')->pluck('total', 'grade_entries.status');
        $total = (int) $counts->sum();
        $approved = (int) (($counts['approved'] ?? 0) + ($counts['published'] ?? 0));
        $metrics->push($this->metric('grades_completion', 'اكتمال كشوف العلامات', 'Grade-sheet completion', $total > 0 ? round(($approved / $total) * 100, 1) : 0, '%', '/grades'));
        $charts->push($this->chart('grade_workflow', 'bar', 'حالة سير عمل العلامات', 'Grade workflow status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        if ($permissions->contains('grades.approve')) {
            $attention->push($this->attention('grades_pending', 'كشوف علامات بانتظار الاعتماد', 'Grade sheets awaiting approval', (int) ($counts['submitted'] ?? 0), '/grades', 'review'));
        }
    }

    private function addAssessmentSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention, Collection $permissions): void
    {
        $query = DB::table('clinical_assessments')->whereIn('student_id', $studentIds);
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('assessments_total', 'التقييمات السريرية', 'Clinical assessments', (int) $counts->sum(), null, '/assessments'));
        $charts->push($this->chart('assessment_workflow', 'donut', 'حالة التقييمات السريرية', 'Clinical assessment status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        if ($permissions->contains('assessment.approve')) {
            $attention->push($this->attention('assessments_pending', 'تقييمات بانتظار الاعتماد', 'Assessments awaiting approval', (int) ($counts['submitted'] ?? 0), '/assessments', 'review'));
        }
    }

    private function addDistributionSection(Collection $studentIds, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = DB::table('student_clinical_assignments')
            ->join('distribution_versions', 'distribution_versions.id', '=', 'student_clinical_assignments.distribution_version_id')
            ->where('distribution_versions.status', 'published')
            ->where('distribution_versions.is_current', true)
            ->whereIn('student_clinical_assignments.student_id', $studentIds);
        $placements = (clone $query)->count();
        $assignedStudents = (clone $query)->distinct()->count('student_clinical_assignments.student_id');
        $unsupervised = (clone $query)->whereNull('student_clinical_assignments.supervisor_id')->count();
        $metrics->push($this->metric('published_placements', 'التعيينات السريرية المنشورة', 'Published clinical placements', $placements, null, '/clinical/schedule'));
        $metrics->push($this->metric('distribution_coverage', 'تغطية التوزيع السريري', 'Clinical distribution coverage', $studentIds->count() > 0 ? round(($assignedStudents / $studentIds->count()) * 100, 1) : 0, '%', '/clinical/schedule'));
        $attention->push($this->attention('unsupervised', 'تعيينات بدون مشرف سريري', 'Placements without a supervisor', $unsupervised, '/clinical/schedule', 'urgent'));

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
        $query = DB::table('courses')->where('is_active', true);
        if ($levels !== null) {
            $english = collect($levels)->intersect(['fourth', 'fifth', 'sixth'])->values();
            $english->isEmpty() ? $query->whereRaw('1 = 0') : $query->whereIn('academic_level', $english);
        }
        $metrics->push($this->metric('active_courses', 'المساقات السريرية الفعالة', 'Active clinical courses', $query->count(), null, '/courses'));
    }

    private function addGroupRegistrationSection(Collection $metrics, Collection $charts): void
    {
        $levels = $this->getEffectiveAcademicLevelScope();
        $query = DB::table('group_registration_cycles');
        if ($levels !== null) {
            $english = collect($levels)->intersect(['fourth', 'fifth', 'sixth'])->values();
            $english->isEmpty() ? $query->whereRaw('1 = 0') : $query->whereIn('academic_level', $english);
        }
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('registration_cycles', 'دورات تسجيل المجموعات', 'Group-registration cycles', (int) $counts->sum(), null, '/distribution/groups'));
        $charts->push($this->chart('registration_cycles_status', 'donut', 'حالة تسجيل المجموعات', 'Group-registration cycle status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
    }

    private function addTaskSection(User $user, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = DB::table('operational_tasks')->where(fn (Builder $q) => $q->where('assigned_to', $user->id)->orWhere('created_by', $user->id));
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $open = (int) (($counts['open'] ?? 0) + ($counts['in_progress'] ?? 0));
        $overdue = (clone $query)->where('assigned_to', $user->id)->whereDate('due_date', '<', now()->toDateString())->whereNotIn('status', ['completed', 'cancelled'])->count();
        $metrics->push($this->metric('my_open_tasks', 'مهامي المفتوحة', 'My open tasks', $open, null, '/tasks'));
        $charts->push($this->chart('my_tasks_status', 'bar', 'حالة مهامي وتكليفاتي', 'My task status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('overdue_tasks', 'مهام متأخرة عن موعدها', 'Overdue tasks', $overdue, '/tasks', 'urgent'));
    }

    private function addCorrespondenceSection(User $user, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $query = $this->visibleCorrespondence($user);
        $counts = (clone $query)->select('status', DB::raw('COUNT(DISTINCT correspondence.id) as total'))->groupBy('status')->pluck('total', 'status');
        $unread = (clone $query)->where('correspondence.assigned_to', $user->id)->whereNull('correspondence.read_at')->distinct()->count('correspondence.id');
        $metrics->push($this->metric('correspondence_active', 'المراسلات النشطة', 'Active correspondence', (int) $counts->except(['closed', 'archived'])->sum(), null, '/inbox'));
        $charts->push($this->chart('correspondence_status', 'donut', 'حالة المراسلات', 'Correspondence status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('unread_correspondence', 'مراسلات واردة غير مقروءة', 'Unread incoming correspondence', $unread, '/inbox', 'notice'));
    }

    private function addMeetingSection(Collection $metrics, Collection $charts, Collection $attention): void
    {
        $counts = DB::table('meetings')->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $upcoming = DB::table('meetings')->whereDate('meeting_date', '>=', now()->toDateString())->whereNotIn('status', ['cancelled'])->count();
        $metrics->push($this->metric('upcoming_meetings', 'الاجتماعات القادمة', 'Upcoming meetings', $upcoming, null, '/meetings'));
        $charts->push($this->chart('meeting_status', 'bar', 'حالة الاجتماعات والمحاضر', 'Meeting and minutes status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('minutes_pending', 'محاضر بانتظار الاعتماد', 'Minutes awaiting approval', (int) ($counts['submitted'] ?? 0), '/meetings', 'review'));
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

    private function addAdvisingSection(User $user, Collection $metrics, Collection $charts, Collection $attention): void
    {
        $personId = DB::table('people')->where('user_id', $user->id)->value('id');
        $query = DB::table('advising_records');
        if ($user->roles()->where('code', 'ACADEMIC_ADVISOR')->exists()) {
            $query->where('advisor_person_id', $personId ?: 0);
        }
        $counts = (clone $query)->select('status', DB::raw('COUNT(*) as total'))->groupBy('status')->pluck('total', 'status');
        $metrics->push($this->metric('advising_records', 'سجلات الإرشاد', 'Advising records', (int) $counts->sum(), null, '/advising'));
        $charts->push($this->chart('advising_status', 'donut', 'حالة ملفات الإرشاد', 'Advising case status', $counts->map(
            fn ($value, $status) => $this->chartItem($this->workflowAr((string) $status), ucfirst((string) $status), (int) $value),
        )->values()->all()));
        $attention->push($this->attention('advising_open', 'حالات إرشاد مفتوحة', 'Open advising cases', (int) ($counts['open'] ?? 0), '/advising', 'notice'));
    }

    private function addSystemSection(Collection $metrics, Collection $charts, Collection $attention): void
    {
        $activeUsers = DB::table('users')->where('is_active', true)->count();
        $activeSessions = DB::table('sessions')->where('last_activity', '>=', now()->subHours(2)->timestamp)->count();
        $auditCount = DB::table('audit_logs')->count();
        $failedJobs = Schema::hasTable('failed_jobs') ? DB::table('failed_jobs')->count() : 0;
        $metrics->prepend($this->metric('system_users', 'الحسابات الفعالة', 'Active user accounts', $activeUsers, null, '/users'));
        $metrics->prepend($this->metric('system_sessions', 'الجلسات النشطة', 'Active sessions', $activeSessions, null, '/admin/sessions'));
        $metrics->push($this->metric('audit_events', 'أحداث سجل التدقيق', 'Audit events', $auditCount, null, '/audit-logs'));

        $roleCounts = DB::table('roles')->leftJoin('user_roles', 'user_roles.role_id', '=', 'roles.id')
            ->select('roles.code', DB::raw('COUNT(user_roles.user_id) as total'))
            ->groupBy('roles.id', 'roles.code')->orderByDesc('total')->get();
        $charts->prepend($this->chart('users_by_role', 'bar', 'توزيع الحسابات حسب الدور', 'User accounts by role', $roleCounts->map(
            fn ($row) => $this->chartItem($this->roleAr($row->code), $this->roleEn($row->code), (int) $row->total),
        )->all()));
        $attention->push($this->attention('failed_jobs', 'عمليات خلفية فاشلة', 'Failed background jobs', $failedJobs, '/admin/health', 'urgent'));
    }

    private function absenceRiskCounts(Collection $studentIds): array
    {
        $records = AttendanceRecord::query()
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
                        'subtitle_ar' => 'مهمة · '.$this->workflowAr($task->status), 'subtitle_en' => 'Task · '.ucfirst($task->status),
                        'at' => $task->updated_at, 'route' => '/tasks',
                    ]);
                });
        }
        if ($permissions->contains('correspondence.view')) {
            $this->visibleCorrespondence($user)->select('correspondence.*')->distinct()->latest('correspondence.updated_at')->limit(4)->get()->each(function ($item) use ($items) {
                $items->push([
                    'key' => 'correspondence-'.$item->id, 'type' => 'correspondence', 'title' => $item->subject,
                    'subtitle_ar' => 'مراسلة · '.$this->workflowAr($item->status), 'subtitle_en' => 'Correspondence · '.ucfirst($item->status),
                    'at' => $item->updated_at, 'route' => '/correspondence/'.$item->id,
                ]);
            });
        }
        if ($user->roles()->where('code', 'SYS_ADMIN')->exists()) {
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
        return DB::table('correspondence')
            ->leftJoin('correspondence_participants', 'correspondence_participants.correspondence_id', '=', 'correspondence.id')
            ->where(fn (Builder $query) => $query
                ->where('correspondence.sender_id', $user->id)
                ->orWhere('correspondence.assigned_to', $user->id)
                ->orWhere('correspondence_participants.user_id', $user->id));
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
        return compact('key', 'type', 'items') + ['title_ar' => $ar, 'title_en' => $en];
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
            'approved' => 'معتمد', 'published' => 'منشور', 'returned' => 'معاد للتعديل', 'pending' => 'قيد الانتظار',
        ][$status] ?? $status;
    }
}
