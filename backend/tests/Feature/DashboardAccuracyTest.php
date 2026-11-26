<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AdvisingRecord;
use App\Models\ApprovalAction;
use App\Models\ApprovalRequest;
use App\Models\ApprovalWorkflow;
use App\Models\AttendanceRecord;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalSession;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\Correspondence;
use App\Models\Course;
use App\Models\DistributionVersion;
use App\Models\GradeEntry;
use App\Models\Meeting;
use App\Models\OperationalTask;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentCourseEnrollment;
use App\Models\StudentGroup;
use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\TestCase;

class DashboardAccuracyTest extends TestCase
{
    use RefreshDatabase;

    private AcademicYear $year;

    private AcademicYear $oldYear;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 11, 26)->startOfDay());
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        $this->year = AcademicYear::factory()->create(['code' => '2026/2027', 'start_date' => '2026-08-01', 'end_date' => '2027-07-31', 'is_current' => true]);
        $this->oldYear = AcademicYear::factory()->create(['code' => '2025/2026', 'start_date' => '2025-08-01', 'end_date' => '2026-07-31', 'is_current' => false]);
    }

    private function actor(array $permissions, string $role = 'RTA'): User
    {
        $user = User::factory()->create(['assigned_levels' => ['fourth'], 'is_active' => true]);
        $user->roles()->attach(Role::where('code', $role)->firstOrFail(), ['scope_type' => 'global']);
        $user->directPermissions()->attach(Permission::whereIn('code', $permissions)->pluck('id'));

        return $user;
    }

    private function block(AcademicYear $year, string $courseLevel = 'fourth'): RotationBlock
    {
        $course = Course::factory()->create(['academic_level' => $courseLevel, 'credit_hours' => 4]);
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fourth', 'course_id' => $course->id]);

        return RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
    }

    private function hospitalRecord(Student $student, RotationBlock $block, string $date, string $status): void
    {
        $session = ClinicalSession::create(['rotation_block_id' => $block->id, 'session_date' => $date, 'title' => 'Clinical training']);
        AttendanceRecord::create(['student_id' => $student->id, 'clinical_session_id' => $session->id, 'status' => $status]);
    }

    public function test_clinical_attendance_separates_year_cohort_course_and_approved_university_registers(): void
    {
        $user = $this->actor(['attendance.review', 'university_lectures.attendance.view']);
        // Mixed clinical/basic access must not switch the clinical dashboard's data source.
        $user->roles()->attach(Role::firstOrCreate(['code' => 'BASIC_LECTURER'], ['name_key' => 'basic_lecturer', 'name_ar' => 'محاضر', 'name_en' => 'Basic lecturer']));
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $other = Student::factory()->create(['academic_level' => 'fifth']);
        Student::factory()->create(['academic_level' => 'third']);
        $block = $this->block($this->year);
        $this->hospitalRecord($student, $block, '2026-11-01', 'present');
        $this->hospitalRecord($student, $block, '2026-11-02', 'absent');
        $this->hospitalRecord($student, $block, '2026-11-03', 'excused');
        $this->hospitalRecord($student, $block, '2026-12-01', 'absent');
        $this->hospitalRecord($other, $block, '2026-11-04', 'absent');
        $this->hospitalRecord($student, $this->block($this->oldYear), '2026-06-01', 'absent');
        $this->hospitalRecord($student, $this->block($this->year, 'third'), '2026-11-05', 'absent');

        foreach ([[$this->year, 'closed', '2026-11-01', 'present'], [$this->year, 'closed', '2026-11-02', 'absent'], [$this->year, 'open', '2026-11-03', 'present'], [$this->oldYear, 'closed', '2026-06-01', 'absent']] as [$year, $state, $date, $status]) {
            $group = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fourth', 'name' => $date]);
            $lecture = ClinicalUniversityLecture::create(['student_group_id' => $group->id, 'supervisor_person_id' => Person::factory()->create()->id, 'title' => 'Clinical lecture', 'weekday' => 'sunday', 'starts_at' => '09:00', 'ends_at' => '10:00', 'starts_on' => $year->start_date, 'ends_on' => $year->end_date, 'created_by_user_id' => $user->id]);
            $session = ClinicalUniversitySession::create(['clinical_university_lecture_id' => $lecture->id, 'session_date' => $date, 'supervisor_person_id' => $lecture->supervisor_person_id, 'recorded_by_user_id' => $user->id, 'qr_state' => $state]);
            ClinicalUniversityAttendanceRecord::create(['clinical_university_session_id' => $session->id, 'student_id' => $student->id, 'status' => $status]);
        }
        $queries = [];
        DB::listen(function ($query) use (&$queries) {
            $queries[] = $query->sql;
        });
        $data = $this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $this->assertSame('clinical', $data['profile']['attendance_domain']);
        $this->assertSame('2026/2027', $data['profile']['academic_year']['code']);
        $this->assertSame(1, $data['profile']['scope_student_count']);
        $charts = collect($data['charts'])->keyBy('key');
        $this->assertSame([1, 1, 0, 1], array_column($charts['attendance_status']['items'], 'value'));
        $this->assertSame([1, 1, 0, 0], array_column($charts['university_attendance_status']['items'], 'value'));
        $this->assertSame([0, 0, 0, 0, 0, 1], array_column($charts['absence_trend']['items'], 'value'));
        $this->assertEquals(33.3, collect($data['metrics'])->firstWhere('key', 'attendance_rate')['value']);
        $this->assertFalse(collect($queries)->contains(fn ($sql) => str_contains($sql, 'basic_')));
    }

    public function test_campus_only_direct_permission_does_not_disclose_hospital_attendance_or_technical_data(): void
    {
        $user = $this->actor(['university_lectures.attendance.view']);
        $keys = collect($this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data.charts'))->pluck('key');
        $this->assertContains('university_attendance_status', $keys);
        $this->assertNotContains('attendance_status', $keys);
        $this->assertNotContains('users_by_role', $keys);
        $user->update(['is_active' => false]);
        $this->getJson('/api/v1/dashboard/overview')->assertForbidden();
    }

    public function test_assessment_counts_ignore_superseded_and_previous_year_distributions(): void
    {
        $user = $this->actor(['assessment.review']);
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $supervisor = Person::factory()->create();
        foreach ([[$this->year, true], [$this->year, false], [$this->oldYear, true]] as [$year, $current]) {
            $block = $this->block($year);
            $version = DistributionVersion::create(['rotation_id' => $block->rotation_id, 'version_number' => 1, 'status' => 'published', 'is_current' => $current, 'created_by' => $user->id]);
            $assignment = StudentClinicalAssignment::create(['distribution_version_id' => $version->id, 'student_id' => $student->id, 'rotation_block_id' => $block->id, 'training_site_id' => TrainingSite::factory()->create()->id, 'supervisor_id' => $supervisor->id]);
            ClinicalAssessment::create(['student_id' => $student->id, 'student_clinical_assignment_id' => $assignment->id, 'evaluator_person_id' => $supervisor->id, 'status' => 'submitted', 'evaluation_week' => 1]);
        }
        $data = $this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $this->assertSame(1, collect($data['metrics'])->firstWhere('key', 'assessments_total')['value']);
        $this->assertSame(1, collect($data['charts'])->firstWhere('key', 'assessment_workflow')['items'][0]['value']);
        // Missing current-year configuration must not silently aggregate history.
        $this->year->update(['is_current' => false, 'start_date' => '2027-08-01', 'end_date' => '2028-07-31']);
        $data = $this->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $this->assertNull($data['profile']['academic_year']);
        $this->assertSame(0, collect($data['metrics'])->firstWhere('key', 'assessments_total')['value']);
    }

    public function test_approval_count_excludes_own_requests_and_already_used_approvers(): void
    {
        $user = $this->actor(['approvals.view'], 'DEAN');
        $other = User::factory()->create();
        $workflow = ApprovalWorkflow::create(['code' => 'dashboard_test', 'name_ar' => 'اعتماد', 'name_en' => 'Approval', 'is_active' => true, 'prevent_requester_approval' => true, 'require_distinct_approvers' => true]);
        $workflow->steps()->create(['step_order' => 1, 'name_ar' => 'عميد', 'name_en' => 'Dean', 'role_codes' => ['DEAN']]);
        foreach (['available', 'own', 'previous', 'done'] as $case) {
            $request = ApprovalRequest::create(['public_id' => Str::uuid()->toString(), 'approval_workflow_id' => $workflow->id, 'subject_type' => 'grade_sheet', 'subject_id' => $case, 'title_ar' => 'طلب', 'title_en' => 'Request', 'status' => $case === 'done' ? 'approved' : 'pending', 'current_step_order' => 1, 'requested_by' => $case === 'own' ? $user->id : $other->id, 'requested_at' => now()]);
            if ($case === 'previous') {
                ApprovalAction::create(['approval_request_id' => $request->id, 'actor_user_id' => $user->id, 'action' => 'approved', 'acted_at' => now()]);
            }
        }
        $data = $this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $this->assertSame(1, collect($data['metrics'])->firstWhere('key', 'approval_queue')['value']);
        $this->assertSame(1, collect($data['attention'])->firstWhere('key', 'approval_queue')['count']);
    }

    public function test_operations_use_visible_mail_open_tasks_scheduled_meetings_and_scoped_advising(): void
    {
        $user = $this->actor(['correspondence.view', 'tasks.view', 'meetings.manage', 'advising.view']);
        $other = User::factory()->create();
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $hidden = Student::factory()->create(['academic_level' => 'fifth']);
        foreach ([[$student, '2026-11-01'], [$hidden, '2026-11-01'], [$student, '2025-11-01']] as [$person, $date]) {
            AdvisingRecord::create(['student_id' => $person->id, 'meeting_date' => $date, 'notes' => 'Follow up', 'status' => 'open']);
        }
        OperationalTask::create(['created_by' => $user->id, 'assigned_to' => $other->id, 'title' => 'Delegated', 'status' => 'open', 'due_date' => '2026-11-01']);
        OperationalTask::create(['created_by' => $other->id, 'assigned_to' => $user->id, 'title' => 'Completed', 'status' => 'completed', 'due_date' => '2026-11-01']);
        foreach (['scheduled', 'approved', 'cancelled'] as $status) {
            Meeting::create(['minutes_number' => 'DASH-'.$status, 'meeting_date' => '2026-12-01', 'meeting_type' => 'clinical', 'created_by' => $user->id, 'status' => $status]);
        }
        foreach (['reply', 'archived', 'deleted'] as $case) {
            $mail = Correspondence::create(['reference_number' => 'DASH-'.$case, 'direction' => 'internal', 'subject' => $case, 'correspondence_date' => today(), 'status' => 'sent', 'sender_id' => $user->id, 'last_message_at' => now()]);
            $mail->participants()->create(['user_id' => $user->id, 'participant_role' => 'sender', 'read_at' => now()->subDay(), 'archived_at' => $case === 'archived' ? now() : null, 'deleted_at' => $case === 'deleted' ? now() : null]);
            $mail->messages()->create(['sender_id' => $other->id, 'body' => 'Reply']);
        }
        $data = $this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $metrics = collect($data['metrics'])->keyBy('key');
        $this->assertSame(1, $metrics['correspondence_active']['value']);
        $this->assertSame(1, $metrics['upcoming_meetings']['value']);
        $this->assertSame(1, $metrics['advising_records']['value']);
        $this->assertSame(1, collect($data['attention'])->firstWhere('key', 'overdue_tasks')['count']);
        $mailActivity = collect($data['activity'])->where('type', 'correspondence');
        $this->assertSame(['reply'], $mailActivity->pluck('title')->values()->all());
    }

    public function test_grades_and_distribution_use_current_year_and_rta_scope_including_empty_distribution(): void
    {
        $user = $this->actor(['grades.view', 'distribution.view']);
        $student = Student::factory()->create(['academic_level' => 'fourth']);
        $other = Student::factory()->create(['academic_level' => 'fifth']);
        foreach ([$this->year, $this->oldYear] as $year) {
            $block = $this->block($year);
            $version = DistributionVersion::create(['rotation_id' => $block->rotation_id, 'version_number' => 1, 'status' => 'published', 'is_current' => true, 'created_by' => $user->id]);
            foreach ([$student, $other] as $person) {
                StudentClinicalAssignment::create(['distribution_version_id' => $version->id, 'student_id' => $person->id, 'rotation_block_id' => $block->id, 'training_site_id' => TrainingSite::factory()->create()->id, 'department_id' => $block->department_id]);
            }
            $enrollment = StudentCourseEnrollment::create(['student_id' => $student->id, 'course_id' => $block->rotation->course_id, 'academic_year_id' => $year->id, 'semester' => 'first', 'status' => 'active']);
            GradeEntry::create(['student_course_enrollment_id' => $enrollment->id, 'status' => $year->id === $this->year->id ? 'draft' : 'approved']);
        }
        $data = $this->actingAs($user)->getJson('/api/v1/dashboard/overview')->assertOk()->json('data');
        $charts = collect($data['charts'])->keyBy('key');
        $this->assertSame([1], array_column($charts['grade_workflow']['items'], 'value'));
        $this->assertSame('Draft', $charts['grade_workflow']['items'][0]['label_en']);
        $this->assertSame('/distribution', $charts['distribution_departments']['route']);
        $this->assertSame(1, collect($data['metrics'])->firstWhere('key', 'published_placements')['value']);
        $this->getJson('/api/v1/operational/dashboard/summary')->assertOk()->assertJsonPath('data.student_coverage.total_active_students', 1)->assertJsonPath('data.distribution_overview.total_placements_count', 1);
        $this->getJson('/api/v1/operational/dashboard/summary?academic_year_id='.$this->oldYear->id)->assertOk()->assertJsonPath('data.distribution_overview.total_placements_count', 1);
        DistributionVersion::whereHas('rotation', fn ($q) => $q->where('academic_year_id', $this->year->id))->update(['is_current' => false]);
        $this->getJson('/api/v1/operational/dashboard/summary')->assertOk()->assertJsonPath('data.student_coverage.total_active_students', 1)->assertJsonPath('data.student_coverage.unassigned_students', 1)->assertJsonPath('data.distribution_overview.total_placements_count', 0);
    }
}
