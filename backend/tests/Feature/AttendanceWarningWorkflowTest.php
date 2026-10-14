<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AttendanceRecord;
use App\Models\ClinicalUniversityAttendanceRecord;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\ClinicalSession;
use App\Models\Course;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use RuntimeException;
use Tests\TestCase;

class AttendanceWarningWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $rta;

    private Student $student;

    private Rotation $rotation;

    private RotationBlock $block;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);

        $role = Role::where('code', 'RTA')->firstOrFail();
        foreach (Permission::whereIn('code', ['attendance.review', 'attendance.notify'])->get() as $permission) {
            $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }

        $this->rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $this->rta->roles()->attach($role, ['scope_type' => 'global']);

        $year = AcademicYear::factory()->create();
        $course = Course::factory()->create([
            'academic_level' => 'fourth',
            'credit_hours' => 2,
        ]);
        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $year->id,
            'course_id' => $course->id,
            'academic_level' => 'fourth',
        ]);
        $this->block = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => Department::factory()->create()->id,
        ]);
        $this->student = Student::factory()->create([
            'university_number' => '22210466',
            'academic_level' => 'fourth',
            'academic_year_id' => $year->id,
        ]);
    }

    public function test_warning_thresholds_use_distinct_absent_days_and_credit_hours_times_five(): void
    {
        $this->record('2026-09-01', 'absent');
        $this->record('2026-09-02', 'absent');
        $this->record('2026-09-02', 'absent', 'Second session on same date');
        $this->record('2026-09-03', 'excused');

        $this->actingAs($this->rta)->getJson('/api/v1/attendance-warnings')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.total_required_days', 10)
            ->assertJsonPath('data.0.absent_days', 2)
            ->assertJsonPath('data.0.excused_days', 1)
            ->assertJsonPath('data.0.absence_percentage', 20)
            ->assertJsonPath('data.0.current_threshold', 10);

        $this->record('2026-09-04', 'absent');

        $this->actingAs($this->rta)->getJson('/api/v1/attendance-warnings')
            ->assertOk()
            ->assertJsonPath('data.0.absent_days', 3)
            ->assertJsonPath('data.0.absence_percentage', 30)
            ->assertJsonPath('data.0.current_threshold', 20);
    }

    public function test_two_university_lectures_on_one_day_count_as_two_absences_in_current_rotation_even_without_a_hospital_register(): void
    {
        $this->rotation->update(['start_date' => '2026-09-01', 'end_date' => '2026-09-28']);
        $this->block->update(['from_week' => 1, 'to_week' => 4]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $this->rotation->academic_year_id]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);
        StudentGroupAssignment::factory()->create([
            'student_id' => $this->student->id, 'academic_year_id' => $this->rotation->academic_year_id,
            'student_group_id' => $group->id, 'student_subgroup_id' => $subgroup->id,
        ]);
        $version = DistributionVersion::create(['rotation_id' => $this->rotation->id, 'status' => 'published', 'is_current' => true]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id, 'student_id' => $this->student->id,
            'student_subgroup_id' => $subgroup->id, 'rotation_block_id' => $this->block->id,
            'training_site_id' => TrainingSite::factory()->create()->id,
        ]);
        $supervisor = Person::factory()->create();
        foreach (['09:00:00', '12:00:00'] as $time) {
            $lecture = ClinicalUniversityLecture::create([
                'student_group_id' => $group->id, 'supervisor_person_id' => $supervisor->id,
                'title' => 'University lecture '.$time, 'weekday' => 'wednesday',
                'starts_on' => '2026-09-02', 'ends_on' => '2026-09-02',
                'starts_at' => $time, 'ends_at' => '13:00:00', 'is_active' => true,
            ]);
            $session = ClinicalUniversitySession::create([
                'clinical_university_lecture_id' => $lecture->id,
                'session_date' => '2026-09-02', 'supervisor_person_id' => $supervisor->id,
            ]);
            ClinicalUniversityAttendanceRecord::create([
                'clinical_university_session_id' => $session->id, 'student_id' => $this->student->id,
                'student_subgroup_id' => $subgroup->id, 'status' => 'absent',
            ]);
        }

        $this->actingAs($this->rta)->getJson('/api/v1/attendance-warnings?course_id='.$this->rotation->course_id)
            ->assertOk()->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.rotation_id', $this->rotation->id)
            ->assertJsonPath('data.0.recorded_days', 2)
            ->assertJsonPath('data.0.absent_days', 2)
            ->assertJsonPath('data.0.absence_percentage', 20)
            ->assertJsonPath('data.0.current_threshold', 10);
        $review = $this->actingAs($this->rta)->getJson('/api/v1/attendance-records/review-group?student_group_id='.$group->id)
            ->assertOk()->json('data.subgroups.0.rotations.0.weeks.0.students.0.days');
        $this->assertCount(2, $review);
        $this->assertCount(2, collect($review)->pluck('lecture_id')->unique());
        $this->assertEqualsCanonicalizing(['absent', 'absent'], collect($review)->pluck('status')->all());

        // A bad overlapping distribution must not silently assign campus absences to either course,
        // even when the warning screen is filtered to the first course.
        $other = Rotation::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'course_id' => Course::factory()->create(['academic_level' => 'fourth', 'credit_hours' => 2])->id,
            'academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-09-28',
        ]);
        $otherBlock = RotationBlock::factory()->create([
            'rotation_id' => $other->id, 'department_id' => $this->block->department_id,
            'from_week' => 1, 'to_week' => 4,
        ]);
        $otherVersion = DistributionVersion::create(['rotation_id' => $other->id, 'status' => 'published', 'is_current' => true]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $otherVersion->id, 'student_id' => $this->student->id,
            'student_subgroup_id' => $subgroup->id, 'rotation_block_id' => $otherBlock->id,
            'training_site_id' => TrainingSite::factory()->create()->id,
        ]);
        $this->actingAs($this->rta)->getJson('/api/v1/attendance-warnings?course_id='.$this->rotation->course_id)
            ->assertOk()->assertJsonCount(0, 'data');
        $ambiguous = $this->actingAs($this->rta)->getJson('/api/v1/attendance-records/review-group?student_group_id='.$group->id)
            ->assertOk()->json('data.subgroups.0.rotations');
        $this->assertTrue(collect($ambiguous)->every(fn (array $rotation) => collect($rotation['weeks'])
            ->every(fn (array $week) => empty($week['students'][0]['days']))));
    }

    public function test_authorized_user_can_send_and_explicitly_resend_a_warning(): void
    {
        $this->student->update(['university_email' => 'clinical.student@hebron.edu']);
        Mail::shouldReceive('raw')->twice()->withArgs(function (string $body) {
            $this->assertStringContainsString('إنذار رسمي بسبب تجاوز نسبة الغياب المسموح بها', $body);
            $this->assertStringContainsString('مراجعة عمادة كلية الطب', $body);
            $this->assertStringContainsString("Dean's Office of the Faculty of Medicine", $body);

            return true;
        });
        $this->record('2026-09-01', 'absent');
        $this->record('2026-09-02', 'absent');
        $this->record('2026-09-03', 'absent');

        $payload = [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 20,
        ];

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', $payload)
            ->assertOk()
            ->assertJsonPath('data.recipient_email', 'clinical.student@hebron.edu');

        $this->assertDatabaseHas('attendance_warning_notifications', [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 20,
            'delivery_status' => 'sent',
            'recipient_email' => 'clinical.student@hebron.edu',
        ]);

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', $payload)
            ->assertStatus(409);

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', $payload + ['resend' => true])
            ->assertOk();

        $this->assertDatabaseCount('attendance_warning_notifications', 2);
    }

    public function test_ten_percent_email_is_an_initial_notice(): void
    {
        $this->student->update(['university_email' => '21212121@students.hebron.edu']);
        Mail::shouldReceive('raw')->once()->withArgs(function (string $body) {
            $this->assertStringContainsString('تنبيه أولي بخصوص نسبة الغياب', $body);
            $this->assertStringContainsString('لتجنب الوصول إلى مرحلة الإنذار الرسمي', $body);
            $this->assertStringNotContainsString('مراجعة عمادة كلية الطب', $body);

            return true;
        });
        $this->record('2026-09-01', 'absent');
        $this->record('2026-09-02', 'absent');

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 10,
        ])->assertOk()
            ->assertJsonPath('data.recipient_email', '22210466@students.hebron.edu');
    }

    public function test_mail_failure_is_recorded_as_failed_and_not_sent(): void
    {
        $this->record('2026-09-01', 'absent');
        $this->record('2026-09-02', 'absent');
        $this->record('2026-09-03', 'absent');
        Mail::shouldReceive('raw')->once()->andThrow(new RuntimeException('SMTP secret detail'));

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 20,
        ])->assertStatus(502)
            ->assertJsonMissing(['message' => 'SMTP secret detail']);

        $this->assertDatabaseHas('attendance_warning_notifications', [
            'student_id' => $this->student->id,
            'delivery_status' => 'failed',
            'failure_code' => 'mail_transport_failed',
        ]);
        $this->assertDatabaseMissing('attendance_warning_notifications', [
            'student_id' => $this->student->id,
            'delivery_status' => 'sent',
        ]);
    }

    public function test_rta_cannot_view_or_notify_a_student_outside_assigned_cohort(): void
    {
        $fifthCourse = Course::factory()->create(['academic_level' => 'fifth', 'credit_hours' => 1]);
        $fifthRotation = Rotation::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'course_id' => $fifthCourse->id,
            'academic_level' => 'fifth',
        ]);
        $fifthBlock = RotationBlock::factory()->create([
            'rotation_id' => $fifthRotation->id,
            'department_id' => $this->block->department_id,
        ]);
        $fifthStudent = Student::factory()->create(['academic_level' => 'fifth']);
        foreach (['2026-10-01', '2026-10-02'] as $date) {
            $session = ClinicalSession::create([
                'rotation_block_id' => $fifthBlock->id,
                'session_date' => $date,
                'title' => 'Fifth session',
            ]);
            AttendanceRecord::create([
                'clinical_session_id' => $session->id,
                'student_id' => $fifthStudent->id,
                'status' => 'absent',
            ]);
        }

        $this->actingAs($this->rta)->getJson('/api/v1/attendance-warnings')
            ->assertOk()
            ->assertJsonCount(0, 'data');

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', [
            'student_id' => $fifthStudent->id,
            'rotation_id' => $fifthRotation->id,
            'threshold_percent' => 20,
        ])->assertNotFound();
    }

    public function test_view_permission_alone_cannot_send_student_email(): void
    {
        $viewerRole = Role::create([
            'code' => 'ATTENDANCE_VIEWER',
            'name_key' => 'roles.attendance_viewer',
            'name_ar' => 'مراجع حضور',
            'name_en' => 'Attendance viewer',
        ]);
        $viewerRole->permissions()->attach(
            Permission::where('code', 'attendance.review')->firstOrFail()->id,
            ['scope_type' => 'global'],
        );
        $viewer = User::factory()->create();
        $viewer->roles()->attach($viewerRole, ['scope_type' => 'global']);

        $this->actingAs($viewer)->postJson('/api/v1/attendance-warnings/send', [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 10,
        ])->assertForbidden();
    }

    public function test_staging_command_prepares_and_cleans_an_isolated_warning_fixture(): void
    {
        $this->artisan('cdms:attendance-warning-test', [
            'university_number' => '22999999',
            '--threshold' => 20,
            '--force' => true,
        ])->assertSuccessful();

        $student = Student::where('university_number', '22999999')->firstOrFail();
        $course = Course::where('code', 'QA-ATT-WARNING')->firstOrFail();
        $rotation = Rotation::where('course_id', $course->id)->firstOrFail();
        $sessionIds = ClinicalSession::whereHas('rotationBlock', fn ($query) => $query->where('rotation_id', $rotation->id))->pluck('id');

        $this->assertSame(3, AttendanceRecord::where('student_id', $student->id)->whereIn('clinical_session_id', $sessionIds)->count());

        $this->artisan('cdms:attendance-warning-test', [
            'university_number' => '22999999',
            '--cleanup' => true,
            '--force' => true,
        ])->assertSuccessful();

        $this->assertDatabaseMissing('courses', ['code' => 'QA-ATT-WARNING']);
        $this->assertDatabaseMissing('students', ['university_number' => '22999999']);
    }

    private function record(string $date, string $status, ?string $title = null): AttendanceRecord
    {
        $session = ClinicalSession::create([
            'rotation_block_id' => $this->block->id,
            'session_date' => $date,
            'title' => $title ?: 'Clinical session '.$date,
        ]);

        return AttendanceRecord::create([
            'clinical_session_id' => $session->id,
            'student_id' => $this->student->id,
            'status' => $status,
        ]);
    }
}
