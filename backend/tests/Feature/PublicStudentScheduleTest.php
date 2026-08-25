<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentScheduleOtpChallenge;
use App\Models\StudentSchedulePortalSetting;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\TestCase;

class PublicStudentScheduleTest extends TestCase
{
    use RefreshDatabase;

    private Student $student;

    protected function setUp(): void
    {
        parent::setUp();

        $year = AcademicYear::factory()->create(['code' => '2026-2027']);
        $this->student = Student::factory()->create([
            'university_number' => '22210466',
            'full_name_ar' => 'الطالب صاحب الجدول',
            'academic_level' => 'fourth',
            'academic_year_id' => $year->id,
            'academic_registration_status' => 'registered',
        ]);
        $teammate = Student::factory()->create([
            'full_name_ar' => 'زميل المجموعة',
            'academic_level' => 'fourth',
            'academic_year_id' => $year->id,
        ]);
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $year->id,
            'academic_level' => 'fourth',
            'name' => 'L',
        ]);
        $subgroup = $group->subgroups()->create(['name' => 'L1', 'is_active' => true, 'capacity' => 6]);
        foreach ([$this->student, $teammate] as $member) {
            StudentGroupAssignment::create([
                'student_id' => $member->id,
                'academic_year_id' => $year->id,
                'student_group_id' => $group->id,
                'student_subgroup_id' => $subgroup->id,
                'valid_from' => now()->toDateString(),
            ]);
        }

        $course = Course::create([
            'code' => 'MED401',
            'name_ar' => 'الجراحة العامة',
            'name_en' => 'General Surgery',
            'credit_hours' => 6,
            'academic_level' => 'fourth',
            'is_active' => true,
        ]);
        $rotation = Rotation::factory()->create([
            'academic_year_id' => $year->id,
            'course_id' => $course->id,
            'academic_level' => 'fourth',
            'start_date' => '2026-09-01',
            'end_date' => '2026-11-30',
            'status' => 'active',
        ]);
        $department = Department::factory()->create(['name_ar' => 'الجراحة']);
        $block = RotationBlock::factory()->create([
            'rotation_id' => $rotation->id,
            'department_id' => $department->id,
            'block_code' => 'W1-W2',
            'from_week' => 1,
            'to_week' => 2,
        ]);
        $site = TrainingSite::factory()->create(['name_ar' => 'مستشفى الأهلي']);
        $supervisor = Person::factory()->create(['full_name_ar' => 'د. طبيب الاختبار']);
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => true,
        ]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'student_id' => $this->student->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $block->id,
            'department_id' => $department->id,
            'training_site_id' => $site->id,
            'supervisor_id' => $supervisor->id,
        ]);
    }

    public function test_requesting_otp_does_not_disclose_schedule_before_verification(): void
    {
        Mail::fake();

        $this->postJson('/api/v1/public/student-schedule/request-otp', [
            'university_number' => '22210466',
        ])->assertOk()
            ->assertJsonStructure(['data' => ['challenge_token', 'email_hint', 'expires_in_seconds']])
            ->assertJsonMissing(['schedule', 'members', 'student']);

        $this->assertDatabaseCount('student_schedule_otp_challenges', 1);
    }

    public function test_mail_failure_fails_closed_without_leaving_a_valid_challenge(): void
    {
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('smtp unavailable'));

        $this->postJson('/api/v1/public/student-schedule/request-otp', [
            'university_number' => '22210466',
        ])->assertStatus(503)
            ->assertJsonPath('errors.code.0', 'otp_delivery_failed')
            ->assertJsonMissing(['schedule', 'members']);

        $this->assertDatabaseCount('student_schedule_otp_challenges', 0);
    }

    public function test_unregistered_student_cannot_receive_otp_or_view_any_data(): void
    {
        Mail::fake();
        $this->student->update(['academic_registration_status' => 'unregistered']);

        $this->postJson('/api/v1/public/student-schedule/request-otp', [
            'university_number' => '22210466',
        ])->assertForbidden()
            ->assertJsonPath('errors.code.0', 'registration_required')
            ->assertJsonMissing(['schedule', 'members']);

        $this->assertDatabaseCount('student_schedule_otp_challenges', 0);
    }

    public function test_disabled_portal_stops_otp_and_existing_sessions_immediately(): void
    {
        Mail::fake();
        StudentSchedulePortalSetting::current()->update(['is_enabled' => false]);

        $this->postJson('/api/v1/public/student-schedule/request-otp', [
            'university_number' => '22210466',
        ])->assertForbidden()->assertJsonMissing(['schedule', 'challenge_token']);

        $this->postJson('/api/v1/public/student-schedule', [
            'access_token' => Str::random(80),
        ])->assertForbidden()->assertJsonMissing(['schedule', 'members']);
        $this->assertDatabaseCount('student_schedule_otp_challenges', 0);
    }

    public function test_portal_toggle_requires_its_dedicated_permission(): void
    {
        $view = Permission::where('code', 'clinical_schedule.view')->firstOrFail();
        $manage = Permission::where('code', 'distribution.student_portal.manage')->firstOrFail();
        $viewerRole = Role::create(['code' => 'PORTAL_VIEWER', 'name_key' => 'portal.viewer']);
        $viewerRole->permissions()->attach($view->id, ['scope_type' => 'global']);
        $managerRole = Role::create(['code' => 'PORTAL_MANAGER', 'name_key' => 'portal.manager']);
        $managerRole->permissions()->attach([$view->id, $manage->id], ['scope_type' => 'global']);
        $viewer = User::factory()->create();
        $viewer->roles()->attach($viewerRole);
        $manager = User::factory()->create();
        $manager->roles()->attach($managerRole);

        $this->actingAs($viewer)->getJson('/api/v1/student-schedule-portal')
            ->assertOk()->assertJsonPath('data.is_enabled', true);
        $this->actingAs($viewer)->putJson('/api/v1/student-schedule-portal', ['is_enabled' => false])
            ->assertForbidden();
        $this->actingAs($manager)->putJson('/api/v1/student-schedule-portal', ['is_enabled' => false])
            ->assertOk()->assertJsonPath('data.is_enabled', false);
        $this->assertFalse(StudentSchedulePortalSetting::current()->is_enabled);
    }

    public function test_otp_verification_limits_attempts_and_issues_only_a_hashed_session_token(): void
    {
        $challengeToken = Str::random(64);
        $challenge = StudentScheduleOtpChallenge::create([
            'student_id' => $this->student->id,
            'challenge_token_hash' => hash('sha256', $challengeToken),
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
        ]);

        $this->postJson('/api/v1/public/student-schedule/verify-otp', [
            'challenge_token' => $challengeToken,
            'otp' => '000000',
        ])->assertUnprocessable();
        $this->assertSame(1, $challenge->fresh()->attempts);

        $response = $this->postJson('/api/v1/public/student-schedule/verify-otp', [
            'challenge_token' => $challengeToken,
            'otp' => '123456',
        ])->assertOk();
        $plainToken = $response->json('data.access_token');
        $this->assertSame(hash('sha256', $plainToken), $challenge->fresh()->access_token_hash);
        $this->assertNotSame($plainToken, $challenge->fresh()->access_token_hash);
    }

    public function test_only_verified_student_receives_own_published_schedule_and_group_members(): void
    {
        $token = Str::random(80);
        StudentScheduleOtpChallenge::create([
            'student_id' => $this->student->id,
            'challenge_token_hash' => hash('sha256', Str::random(64)),
            'otp_hash' => Hash::make('123456'),
            'expires_at' => now()->addMinutes(10),
            'verified_at' => now(),
            'consumed_at' => now(),
            'access_token_hash' => hash('sha256', $token),
            'access_expires_at' => now()->addMinutes(20),
        ]);

        $this->postJson('/api/v1/public/student-schedule', ['access_token' => $token])
            ->assertOk()
            ->assertJsonPath('data.student.university_number', '22210466')
            ->assertJsonPath('data.group.name', 'L')
            ->assertJsonPath('data.subgroup.name', 'L1')
            ->assertJsonCount(2, 'data.members')
            ->assertJsonCount(1, 'data.schedule')
            ->assertJsonPath('data.schedule.0.course.name_ar', 'الجراحة العامة')
            ->assertJsonPath('data.schedule.0.training_site.name_ar', 'مستشفى الأهلي')
            ->assertJsonPath('data.schedule.0.supervisor.full_name_ar', 'د. طبيب الاختبار');

        $this->postJson('/api/v1/public/student-schedule', ['access_token' => Str::random(80)])
            ->assertUnauthorized()
            ->assertJsonMissing(['schedule', 'members']);
    }

    public function test_legacy_bulk_public_schedule_endpoint_is_disabled(): void
    {
        $this->getJson('/api/v1/public/clinical-schedule')->assertNotFound();
    }
}
