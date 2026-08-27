<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AttendanceRecord;
use App\Models\ClinicalSession;
use App\Models\Course;
use App\Models\Department;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
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
        foreach (Permission::whereIn('code', ['attendance.view', 'attendance.notify'])->get() as $permission) {
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

    public function test_authorized_user_can_send_and_explicitly_resend_a_warning(): void
    {
        Mail::fake();
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
            ->assertJsonPath('data.recipient_email', '22210466@students.hebron.edu');

        $this->assertDatabaseHas('attendance_warning_notifications', [
            'student_id' => $this->student->id,
            'rotation_id' => $this->rotation->id,
            'threshold_percent' => 20,
            'delivery_status' => 'sent',
            'recipient_email' => '22210466@students.hebron.edu',
        ]);

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', $payload)
            ->assertStatus(409);

        $this->actingAs($this->rta)->postJson('/api/v1/attendance-warnings/send', $payload + ['resend' => true])
            ->assertOk();

        $this->assertDatabaseCount('attendance_warning_notifications', 2);
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
            Permission::where('code', 'attendance.view')->firstOrFail()->id,
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
