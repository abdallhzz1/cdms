<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\ClinicalUniversityLecture;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\User;
use Carbon\Carbon;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class UniversityAttendanceAccessAndRateLimitTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-15 12:00:00');
        $this->seed([PermissionSeeder::class, RoleSeeder::class, RolePermissionSeeder::class]);
        config()->set('clinical_attendance.enabled', true);
        config()->set('group_registration.otp_enabled', false);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function actor(string $role): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::where('code', $role)->firstOrFail());
        if ($role === 'CLINICAL_SUPERVISOR') {
            Role::where('code', $role)->firstOrFail()->permissions()->syncWithoutDetaching([Permission::where('code', 'attendance.record')->firstOrFail()->id => ['scope_type' => 'global']]);
        }

        return $user;
    }

    private function fixture(int $count = 1): array
    {
        $year = AcademicYear::factory()->create(['code' => '2026/2027', 'start_date' => '2026-09-01', 'end_date' => '2027-08-31', 'is_current' => true]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $year->id]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);
        $doctor = $this->actor('CLINICAL_SUPERVISOR');
        $person = Person::factory()->create(['user_id' => $doctor->id]);
        $lecture = ClinicalUniversityLecture::create(['student_group_id' => $group->id, 'supervisor_person_id' => $person->id,
            'title' => 'Campus lecture', 'weekday' => 'thursday', 'starts_at' => '09:00:00', 'ends_at' => '11:00:00',
            'starts_on' => '2026-10-15', 'ends_on' => '2026-10-15', 'is_active' => true, 'created_by_user_id' => $doctor->id]);
        $students = Student::factory()->count($count)->create(['academic_year_id' => $year->id]);
        foreach ($students as $student) {
            StudentGroupAssignment::factory()->create(['student_id' => $student->id, 'academic_year_id' => $year->id, 'student_group_id' => $group->id, 'student_subgroup_id' => $subgroup->id]);
        }

        return [$lecture, $students, $doctor];
    }

    public function test_a_classroom_can_verify_and_scan_one_qr_from_one_network_without_blocking_each_other(): void
    {
        [$lecture,$students] = $this->fixture(100);
        $assistant = $this->actor('ADMIN_ASSISTANT');
        $base = "/api/v1/operational/university-attendance/plans/{$lecture->id}";
        $this->actingAs($assistant)->postJson($base.'/qr/open', ['session_date' => '2026-10-15'])->assertOk();
        $qr = $this->getJson($base.'/qr?session_date=2026-10-15')->assertOk()->json('data.token');
        $firstAccess = null;
        foreach ($students as $student) {
            $this->postJson('/api/v1/public/clinical-attendance/begin', ['qr_token' => $qr])->assertOk();
            $access = $this->postJson('/api/v1/public/clinical-attendance/request-otp', ['university_number' => $student->university_number, 'qr_token' => $qr])->assertOk()->json('data.access_token');
            $firstAccess ??= $access;
            $this->postJson('/api/v1/public/clinical-attendance/identity', ['access_token' => $access])->assertOk();
            $remember=$this->postJson('/api/v1/public/clinical-attendance/remember', ['access_token' => $access])->assertOk();
            $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => $access, 'qr_token' => $qr])->assertOk()->assertJsonPath('data.operation', 'check_in');
            $this->withCredentials()->withUnencryptedCookie(\App\Services\StudentPublicIdentityService::COOKIE,$remember->getCookie(\App\Services\StudentPublicIdentityService::COOKIE,false)->getValue());
            $this->postJson('/api/v1/public/clinical-attendance/identity')->assertOk();
            $this->postJson('/api/v1/public/clinical-attendance/scan',['qr_token'=>$qr])->assertOk();
        }
        $this->assertDatabaseCount('clinical_university_attendance_records', 100);
        $this->assertDatabaseCount('clinical_university_sessions', 1);
        $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => $firstAccess, 'qr_token' => $qr])->assertOk();
        $this->assertDatabaseCount('clinical_university_attendance_records', 100);
        $this->postJson($base.'/qr/close', ['session_date' => '2026-10-15'])->assertOk();
        $this->assertDatabaseMissing('clinical_university_attendance_records', ['status' => 'absent']);
    }

    public function test_missing_identities_are_not_one_student_but_individual_identity_and_challenge_limits_remain(): void
    {
        for ($i = 0; $i < 80; $i++) {
            $this->postJson('/api/v1/public/clinical-attendance/identity')->assertStatus(401);
            $this->postJson('/api/v1/public/clinical-attendance/verify-otp',['challenge_token'=>str_pad((string)$i,64,'x'),'otp'=>'123456'])->assertUnprocessable();
        }
        for ($i = 0; $i < 30; $i++) {
            $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => str_repeat('a', 80), 'qr_token' => 'invalid'])->assertStatus(401);
        }
        $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => str_repeat('a', 80), 'qr_token' => 'invalid'])->assertStatus(429)->assertHeader('Retry-After')->assertJsonStructure(['meta' => ['retry_after_seconds']]);
        $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => str_repeat('b', 80), 'qr_token' => 'invalid'])->assertStatus(401);
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/public/clinical-attendance/verify-otp', ['challenge_token' => str_repeat('c', 80), 'otp' => '123456'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/public/clinical-attendance/verify-otp', ['challenge_token' => str_repeat('c', 80), 'otp' => '123456'])->assertStatus(429);
        $this->postJson('/api/v1/public/clinical-attendance/verify-otp', ['challenge_token' => str_repeat('d', 80), 'otp' => '123456'])->assertUnprocessable();
        for($i=0;$i<10;$i++)$this->postJson('/api/v1/public/clinical-attendance/request-otp',['university_number'=>'99999999'])->assertUnprocessable();
        $this->postJson('/api/v1/public/clinical-attendance/request-otp',['university_number'=>'99999999'])->assertStatus(429);
        $this->postJson('/api/v1/public/clinical-attendance/request-otp',['university_number'=>'88888888'])->assertUnprocessable();
    }

    public function test_staff_can_operate_another_lecturers_register_with_correct_attribution_and_revocable_permissions(): void
    {
        [$lecture,$students,$doctor] = $this->fixture();
        $base = "/api/v1/operational/university-attendance/plans/{$lecture->id}";
        $rta = $this->actor('RTA');
        $this->actingAs($rta)->postJson($base.'/day', ['session_date' => '2026-10-15', 'records' => [['student_id' => $students[0]->id, 'status' => 'present']]])->assertOk();
        $this->assertDatabaseHas('clinical_university_sessions', ['clinical_university_lecture_id' => $lecture->id, 'supervisor_person_id' => $lecture->supervisor_person_id, 'recorded_by_user_id' => $rta->id]);
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[0]->id, 'recorded_by_user_id' => $rta->id]);
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $manage = Permission::where('code', 'university_lectures.attendance.manage')->firstOrFail();
        $role->permissions()->detach($manage->id);
        $viewer = $this->actor('ADMIN_ASSISTANT');
        $this->actingAs($viewer)->getJson($base.'/day?session_date=2026-10-15')->assertOk();
        $this->postJson($base.'/day', ['session_date' => '2026-10-15', 'records' => [['student_id' => $students[0]->id, 'status' => 'absent']]])->assertForbidden();
        $this->postJson($base.'/qr/open', ['session_date' => '2026-10-15'])->assertForbidden();
        $stranger = $this->actor('CLINICAL_SUPERVISOR');
        Person::factory()->create(['user_id' => $stranger->id]);
        $this->actingAs($stranger)->getJson($base.'/day?session_date=2026-10-15')->assertForbidden();
        $this->getJson('/api/v1/operational/university-attendance/plans')->assertOk()->assertJsonCount(0, 'data.lectures');
        $this->actingAs($doctor)->getJson($base.'/day?session_date=2026-10-15')->assertOk();
    }

    public function test_rta_without_a_person_profile_can_be_assigned_as_lecturer(): void
    {
        [$lecture] = $this->fixture();
        $rta = $this->actor('RTA');
        $data = $this->actingAs($rta)->getJson('/api/v1/operational/university-attendance/plans')->assertOk()->json('data.lecturers');
        $this->assertContains($rta->id, array_column($data, 'user_id'));
        $this->assertDatabaseMissing('people', ['user_id' => $rta->id]);
        $plan = ['student_group_id' => $lecture->student_group_id, 'lecturer_user_id' => $rta->id, 'title' => 'RTA teaching',
            'weekday' => 'friday', 'starts_at' => '09:00', 'ends_at' => '10:00', 'starts_on' => '2026-10-16', 'ends_on' => '2026-10-16'];
        $id = $this->postJson('/api/v1/operational/university-attendance/plans', $plan)->assertCreated()->json('data.id');
        $person = Person::where('user_id', $rta->id)->firstOrFail();
        $this->assertDatabaseHas('clinical_university_lectures', ['id' => $id, 'supervisor_person_id' => $person->id]);
        $this->getJson('/api/v1/operational/university-attendance/mine')->assertOk()->assertJsonPath('data.0.id', $id);
        $ineligible = $this->actor('ADMIN_ASSISTANT');
        $this->postJson('/api/v1/operational/university-attendance/plans', [...$plan, 'lecturer_user_id' => $ineligible->id])->assertUnprocessable();
        $this->postJson('/api/v1/operational/university-attendance/plans',[...$plan, 'supervisor_person_id' => $lecture->supervisor_person_id])->assertUnprocessable();
    }
}
