<?php

namespace App\Services\Reports;

use App\Models\AcademicYear;
use App\Models\AttendanceRecord;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalPeriod;
use App\Models\CourseReport;
use App\Models\CourseScheduleRow;
use App\Models\GradeEntry;
use App\Models\Person;
use App\Models\QualityImprovementPlan;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroupRoster;
use Illuminate\Support\Collection;

class ReportCenterService
{
    public function catalog(): array
    {
        return [
            ['key' => 'student_directory', 'category' => 'academic', 'title' => 'دليل الطلبة الأكاديمي', 'description' => 'قائمة الطلبة حسب السنة والحالة الأكاديمية والمجموعة الرئيسية.'],
            ['key' => 'group_rosters', 'category' => 'clinical', 'title' => 'قوائم مجموعات الطلبة', 'description' => 'كشف الطلبة المسجلين في المجموعات الرئيسية لكل عام وسنة سريرية.'],
            ['key' => 'clinical_schedule', 'category' => 'clinical', 'title' => 'الجدول السريري المنشور', 'description' => 'أماكن دوام الطلبة والمجموعات والمستشفيات والأطباء في الجداول المنشورة.'],
            ['key' => 'supervisors_hospitals', 'category' => 'clinical', 'title' => 'المستشفيات والمشرفون', 'description' => 'دليل المشرفين السريريين والمستشفيات المرتبطين بها وحالة الحساب.'],
            ['key' => 'grades', 'category' => 'academic', 'title' => 'علامات المساقات السريرية', 'description' => 'العلامة السريرية والأوسكي والامتحان الكتابي وحالة الاعتماد.'],
            ['key' => 'attendance', 'category' => 'clinical', 'title' => 'الحضور والغياب', 'description' => 'سجل حضور الطلبة للجلسات السريرية مع الملاحظات والأعذار.'],
            ['key' => 'clinical_assessments', 'category' => 'clinical', 'title' => 'التقييمات السريرية', 'description' => 'تقييمات الطلبة ودرجاتها والمشرف الذي قام بالتقييم وحالة الاعتماد.'],
            ['key' => 'course_reports', 'category' => 'quality', 'title' => 'متابعة تقارير المساقات', 'description' => 'حالة التقارير السنوية للمساقات: مسودة أو مرسلة أو معتمدة أو معادة.'],
            ['key' => 'quality_plans', 'category' => 'quality', 'title' => 'خطط التحسين والجودة', 'description' => 'متابعة ملاحظات الجودة وإجراءات التحسين والمسؤوليات والمواعيد.'],
            ['key' => 'data_gaps', 'category' => 'monitoring', 'title' => 'نواقص البيانات والتشغيل', 'description' => 'تقرير رقابي يجمع الطلبة دون مجموعات أو توزيع، والمشرفين دون مستشفيات، والتكليفات دون طبيب.'],
        ];
    }

    public function hasReport(string $key): bool
    {
        return collect($this->catalog())->contains('key', $key);
    }

    public function definition(string $key): array
    {
        return collect($this->catalog())->firstWhere('key', $key) ?? abort(404);
    }

    public function summary(array $filters): array
    {
        $students = Student::query();
        $this->filterStudents($students, $filters);

        $rosters = StudentGroupRoster::query();
        $this->filterRosters($rosters, $filters);

        $assignments = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($query) => $query->where('status', 'published')->where('is_current', true));
        $this->filterAssignments($assignments, $filters);

        $courseReports = CourseReport::query();
        $this->filterCourseReports($courseReports, $filters);

        return [
            'students' => (clone $students)->count(),
            'academically_registered' => (clone $students)->where('academic_registration_status', 'registered')->count(),
            'students_in_groups' => (clone $rosters)->distinct('student_id')->count('student_id'),
            'students_in_published_schedule' => (clone $assignments)->distinct('student_id')->count('student_id'),
            'active_supervisors' => $this->supervisorsQuery()->where('is_active', true)->count(),
            'vacant_schedule_rows' => CourseScheduleRow::query()->where('row_type', 'vacancy')->count(),
            'course_reports_pending_approval' => (clone $courseReports)->where('status', 'submitted')->count(),
        ];
    }

    public function report(string $key, array $filters): array
    {
        abort_unless($this->hasReport($key), 404);

        $payload = match ($key) {
            'student_directory' => $this->studentDirectory($filters),
            'group_rosters' => $this->groupRosters($filters),
            'clinical_schedule' => $this->clinicalSchedule($filters),
            'supervisors_hospitals' => $this->supervisorsHospitals($filters),
            'grades' => $this->grades($filters),
            'attendance' => $this->attendance($filters),
            'clinical_assessments' => $this->clinicalAssessments($filters),
            'course_reports' => $this->courseReports($filters),
            'quality_plans' => $this->qualityPlans($filters),
            'data_gaps' => $this->dataGaps($filters),
        };

        $payload['rows'] = $this->search(collect($payload['rows']), $filters['search'] ?? null)->values()->all();
        $payload['definition'] = $this->definition($key);

        return $payload;
    }

    public function filterLabel(array $filters): string
    {
        $parts = [];
        if (!empty($filters['academic_year_id'])) {
            $parts[] = 'العام: ' . (AcademicYear::find($filters['academic_year_id'])?->code ?? $filters['academic_year_id']);
        }
        if (!empty($filters['academic_level'])) {
            $parts[] = 'السنة: ' . $this->level($filters['academic_level']);
        }
        if (!empty($filters['clinical_period_id'])) {
            $period = ClinicalPeriod::find($filters['clinical_period_id']);
            $parts[] = 'الفترة: ' . ($period?->name_ar ?? $filters['clinical_period_id']);
        }
        if (!empty($filters['search'])) {
            $parts[] = 'بحث: ' . $filters['search'];
        }

        return $parts ? implode(' | ', $parts) : 'جميع البيانات المتاحة';
    }

    private function studentDirectory(array $filters): array
    {
        $query = Student::query()->with(['academicYear', 'groupRegistrationRosters.group']);
        $this->filterStudents($query, $filters);
        $rows = $query->orderBy('academic_level')->orderBy('full_name_ar')->get()->map(function (Student $student) {
            $roster = $student->groupRegistrationRosters->first();
            return [
                $student->university_number,
                $student->full_name_ar,
                $student->full_name_en,
                $student->academicYear?->code,
                $this->level($student->academic_level),
                $this->academicStatus($student->academic_registration_status),
                $roster?->group?->name,
                $student->gpa,
            ];
        });

        return ['columns' => ['الرقم الجامعي', 'اسم الطالب', 'الاسم بالإنجليزية', 'العام الأكاديمي', 'السنة السريرية', 'الحالة الأكاديمية', 'المجموعة الرئيسية', 'المعدل'], 'rows' => $rows->all()];
    }

    private function groupRosters(array $filters): array
    {
        $query = StudentGroupRoster::query()->with(['cycle.academicYear', 'student', 'group']);
        $this->filterRosters($query, $filters);
        $rows = $query->get()->sortBy(fn ($item) => ($item->cycle?->academicYear?->code ?? '') . ($item->group?->name ?? '') . ($item->student?->full_name_ar ?? ''))->map(fn ($item) => [
            $item->cycle?->academicYear?->code,
            $this->level($item->cycle?->academic_level),
            $item->group?->name,
            $item->student?->university_number,
            $item->student?->full_name_ar,
            $this->academicStatus($item->student?->academic_registration_status),
        ]);

        return ['columns' => ['العام الأكاديمي', 'السنة السريرية', 'المجموعة الرئيسية', 'الرقم الجامعي', 'اسم الطالب', 'الحالة الأكاديمية'], 'rows' => $rows->values()->all()];
    }

    private function clinicalSchedule(array $filters): array
    {
        $query = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true))
            ->with(['distributionVersion.rotation.academicYear', 'distributionVersion.rotation.course', 'distributionVersion.rotation.clinicalPeriod', 'rotationBlock', 'student', 'studentSubgroup', 'trainingSite', 'supervisor', 'courseScheduleRow.person']);
        $this->filterAssignments($query, $filters);
        $rows = $query->get()->map(function ($assignment) {
            $rotation = $assignment->distributionVersion?->rotation;
            $doctor = $assignment->supervisor ?? $assignment->courseScheduleRow?->person;
            return [
                $rotation?->academicYear?->code,
                $this->level($rotation?->academic_level),
                $rotation?->clinicalPeriod?->name_ar ?? 'جدول سنوي',
                $rotation?->course?->name_ar ?? $rotation?->name,
                $assignment->rotationBlock?->block_code,
                $assignment->studentSubgroup?->name,
                $assignment->student?->university_number,
                $assignment->student?->full_name_ar,
                $assignment->trainingSite?->name_ar,
                $doctor?->full_name_ar ?? 'شاغر',
            ];
        });

        return ['columns' => ['العام الأكاديمي', 'السنة السريرية', 'الفترة السريرية', 'المساق', 'الأسبوع', 'المجموعة الفرعية', 'الرقم الجامعي', 'اسم الطالب', 'المستشفى', 'الطبيب'], 'rows' => $rows->all()];
    }

    private function supervisorsHospitals(array $filters): array
    {
        $rows = $this->supervisorsQuery()->with(['trainingSites', 'user'])->orderBy('full_name_ar')->get()->map(fn (Person $person) => [
            $person->full_name_ar,
            $person->full_name_en,
            $person->email ?? $person->user?->email,
            $person->specialty,
            $person->trainingSites->pluck('name_ar')->implode('، '),
            $person->is_active ? 'نشط' : 'غير نشط',
            $person->user_id ? 'يوجد حساب' : 'دون حساب',
        ]);

        return ['columns' => ['اسم المشرف', 'الاسم بالإنجليزية', 'البريد الإلكتروني', 'التخصص', 'المستشفيات', 'حالة الملف', 'حالة الحساب'], 'rows' => $rows->all()];
    }

    private function grades(array $filters): array
    {
        $query = GradeEntry::query()->with(['enrollment.student', 'enrollment.course', 'enrollment.academicYear']);
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->whereHas('enrollment', fn ($e) => $e->where('academic_year_id', $year)));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('enrollment.student', fn ($s) => $s->where('academic_level', $level)));
        $rows = $query->get()->map(fn (GradeEntry $grade) => [
            $grade->enrollment?->student?->university_number,
            $grade->enrollment?->student?->full_name_ar,
            $grade->enrollment?->course?->name_ar,
            $grade->enrollment?->academicYear?->code,
            $grade->clinical_score,
            $grade->osce_score,
            $grade->written_score,
            $grade->score,
            $grade->max_score,
            $this->workflowStatus($grade->status),
        ]);

        return ['columns' => ['الرقم الجامعي', 'اسم الطالب', 'المساق', 'العام الأكاديمي', 'السريري', 'OSCE', 'الكتابي', 'العلامة', 'من', 'الحالة'], 'rows' => $rows->all()];
    }

    private function attendance(array $filters): array
    {
        $query = AttendanceRecord::query()->with(['student', 'session.trainingSite', 'session.rotationBlock.rotation.clinicalPeriod']);
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->whereHas('student', fn ($s) => $s->where('academic_year_id', $year)));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('student', fn ($s) => $s->where('academic_level', $level)));
        $query->when($filters['clinical_period_id'] ?? null, fn ($q, $period) => $q->whereHas('session.rotationBlock.rotation', fn ($r) => $r->where('clinical_period_id', $period)));
        $rows = $query->orderByDesc('id')->get()->map(fn (AttendanceRecord $record) => [
            $record->student?->university_number,
            $record->student?->full_name_ar,
            $record->session?->session_date?->format('Y-m-d'),
            $record->session?->title,
            $record->session?->trainingSite?->name_ar,
            $record->session?->rotationBlock?->rotation?->clinicalPeriod?->name_ar ?? 'جدول سنوي',
            $this->attendanceStatus($record->status),
            $record->excuse_note,
        ]);

        return ['columns' => ['الرقم الجامعي', 'اسم الطالب', 'التاريخ', 'الجلسة', 'المستشفى', 'الفترة السريرية', 'الحالة', 'ملاحظة العذر'], 'rows' => $rows->all()];
    }

    private function clinicalAssessments(array $filters): array
    {
        $query = ClinicalAssessment::query()->with(['student', 'evaluator', 'session.rotationBlock.rotation.clinicalPeriod']);
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->whereHas('student', fn ($s) => $s->where('academic_year_id', $year)));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('student', fn ($s) => $s->where('academic_level', $level)));
        $query->when($filters['clinical_period_id'] ?? null, fn ($q, $period) => $q->whereHas('session.rotationBlock.rotation', fn ($r) => $r->where('clinical_period_id', $period)));
        $rows = $query->orderByDesc('id')->get()->map(fn (ClinicalAssessment $assessment) => [
            $assessment->student?->university_number,
            $assessment->student?->full_name_ar,
            $assessment->evaluator?->full_name_ar,
            $assessment->session?->session_date?->format('Y-m-d'),
            $assessment->session?->title,
            $assessment->session?->rotationBlock?->rotation?->clinicalPeriod?->name_ar ?? 'جدول سنوي',
            $assessment->score,
            $assessment->max_score,
            $assessment->max_score > 0 ? round(($assessment->score / $assessment->max_score) * 100, 1) . '%' : null,
            $this->workflowStatus($assessment->status),
        ]);

        return ['columns' => ['الرقم الجامعي', 'اسم الطالب', 'المقيّم', 'التاريخ', 'الجلسة', 'الفترة السريرية', 'العلامة', 'من', 'النسبة', 'الحالة'], 'rows' => $rows->all()];
    }

    private function courseReports(array $filters): array
    {
        $query = CourseReport::query()->with(['course', 'academicYear', 'preparer', 'approver']);
        $this->filterCourseReports($query, $filters);
        $rows = $query->orderByDesc('academic_year_id')->get()->map(fn (CourseReport $report) => [
            $report->academicYear?->code,
            $report->course?->code,
            $report->course?->name_ar,
            $this->level($report->course?->academic_level),
            $this->workflowStatus($report->status),
            $report->preparer?->name,
            $report->approver?->name,
            $report->submitted_at?->format('Y-m-d H:i'),
            $report->approved_at?->format('Y-m-d H:i'),
        ]);

        return ['columns' => ['العام الأكاديمي', 'رمز المساق', 'اسم المساق', 'السنة السريرية', 'حالة التقرير', 'أعدّه', 'اعتمده', 'تاريخ الإرسال', 'تاريخ الاعتماد'], 'rows' => $rows->all()];
    }

    private function qualityPlans(array $filters): array
    {
        $yearCode = !empty($filters['academic_year_id']) ? AcademicYear::find($filters['academic_year_id'])?->code : null;
        $query = QualityImprovementPlan::query()->when($yearCode, fn ($q) => $q->where('academic_year', $yearCode));
        $rows = $query->orderByDesc('id')->get()->map(fn (QualityImprovementPlan $plan) => [
            $plan->academic_year,
            $plan->source,
            $plan->observation,
            $plan->improvement_action,
            $plan->responsible,
            $plan->priority,
            $this->workflowStatus($plan->status),
            $plan->due_date?->format('Y-m-d'),
        ]);

        return ['columns' => ['العام الأكاديمي', 'المصدر', 'الملاحظة', 'إجراء التحسين', 'المسؤول', 'الأولوية', 'الحالة', 'موعد الإنجاز'], 'rows' => $rows->all()];
    }

    private function dataGaps(array $filters): array
    {
        $studentQuery = Student::query()->where('academic_registration_status', 'registered');
        $this->filterStudents($studentQuery, $filters);
        $withoutGroups = (clone $studentQuery)->whereDoesntHave('groupRegistrationRosters')->get()->map(fn (Student $student) => [
            'طالب دون مجموعة', $student->university_number, $student->full_name_ar, $this->level($student->academic_level), 'إضافته إلى قائمة دورة تسجيل المجموعات المناسبة',
        ]);

        $scheduledStudents = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true));
        $this->filterAssignments($scheduledStudents, $filters);
        $scheduledStudentIds = $scheduledStudents->distinct()->pluck('student_id');
        $withoutSchedule = (clone $studentQuery)->whereNotIn('id', $scheduledStudentIds)->get()->map(fn (Student $student) => [
            'طالب دون توزيع سريري', $student->university_number, $student->full_name_ar, $this->level($student->academic_level), 'استكمال المجموعة ثم تضمينه في الجدول المنشور',
        ]);

        $supervisors = $this->supervisorsQuery()->with('trainingSites')->get()->filter(fn (Person $person) => $person->trainingSites->isEmpty())->map(fn (Person $person) => [
            'مشرف دون مستشفى', $person->staff_code ?? $person->id, $person->full_name_ar, $person->specialty, 'ربط المشرف بمستشفى من شاشة المستشفيات والمشرفين',
        ]);

        $assignments = StudentClinicalAssignment::query()
            ->whereHas('distributionVersion', fn ($q) => $q->where('status', 'published')->where('is_current', true))
            ->whereNull('supervisor_id')->with(['student', 'trainingSite']);
        $this->filterAssignments($assignments, $filters);
        $unsupervised = $assignments->get()->map(fn ($assignment) => [
            'تكليف دون طبيب', $assignment->id, $assignment->student?->full_name_ar, $assignment->trainingSite?->name_ar, 'تعيين طبيب أو إبقاء الصف موضحاً كشاغر رسمي',
        ]);

        return [
            'columns' => ['نوع النقص', 'الرقم أو المرجع', 'الاسم', 'التفاصيل', 'الإجراء المقترح'],
            'rows' => $withoutGroups->concat($withoutSchedule)->concat($supervisors)->concat($unsupervised)->values()->all(),
        ];
    }

    private function supervisorsQuery()
    {
        return Person::query()->whereHas('user.roles', fn ($query) => $query->where('code', 'CLINICAL_SUPERVISOR'));
    }

    private function filterStudents($query, array $filters): void
    {
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->where('academic_year_id', $year));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->where('academic_level', $level));
    }

    private function filterRosters($query, array $filters): void
    {
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->whereHas('cycle', fn ($c) => $c->where('academic_year_id', $year)));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('cycle', fn ($c) => $c->where('academic_level', $level)));
    }

    private function filterAssignments($query, array $filters): void
    {
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->whereHas('distributionVersion.rotation', fn ($r) => $r->where('academic_year_id', $year)));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('distributionVersion.rotation', fn ($r) => $r->where('academic_level', $level)));
        $query->when($filters['clinical_period_id'] ?? null, fn ($q, $period) => $q->whereHas('distributionVersion.rotation', fn ($r) => $r->where('clinical_period_id', $period)));
    }

    private function filterCourseReports($query, array $filters): void
    {
        $query->when($filters['academic_year_id'] ?? null, fn ($q, $year) => $q->where('academic_year_id', $year));
        $query->when($filters['academic_level'] ?? null, fn ($q, $level) => $q->whereHas('course', fn ($c) => $c->where('academic_level', $level)));
    }

    private function search(Collection $rows, ?string $search): Collection
    {
        if (!$search) {
            return $rows;
        }
        $needle = mb_strtolower(trim($search));
        return $rows->filter(fn (array $row) => collect($row)->contains(fn ($value) => str_contains(mb_strtolower((string) $value), $needle)));
    }

    private function level(?string $level): string
    {
        return match ($level) {'fourth' => 'السنة الرابعة', 'fifth' => 'السنة الخامسة', 'sixth' => 'السنة السادسة', default => (string) $level};
    }

    private function academicStatus(?string $status): string
    {
        return match ($status) {'registered' => 'مسجل', 'unregistered' => 'غير مسجل', default => (string) $status};
    }

    private function attendanceStatus(?string $status): string
    {
        return match ($status) {'present' => 'حاضر', 'absent' => 'غائب', 'late' => 'متأخر', 'excused' => 'غياب بعذر', default => (string) $status};
    }

    private function workflowStatus(?string $status): string
    {
        return match ($status) {
            'draft' => 'مسودة', 'submitted' => 'مرسل للاعتماد', 'approved' => 'معتمد', 'returned' => 'معاد للتعديل',
            'open' => 'مفتوح', 'closed' => 'مغلق', 'in_progress' => 'قيد التنفيذ', 'completed' => 'مكتمل',
            default => (string) $status,
        };
    }
}
