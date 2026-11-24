<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\ClinicalUniversityLecture;
use App\Models\ClinicalUniversitySession;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\User;
use App\Services\StudentPublicIdentityService;
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
            $remember = $this->postJson('/api/v1/public/clinical-attendance/remember', ['access_token' => $access])->assertOk();
            $this->postJson('/api/v1/public/clinical-attendance/scan', ['access_token' => $access, 'qr_token' => $qr])->assertOk()->assertJsonPath('data.operation', 'check_in');
            $this->withCredentials()->withUnencryptedCookie(StudentPublicIdentityService::COOKIE, $remember->getCookie(StudentPublicIdentityService::COOKIE, false)->getValue());
            $this->postJson('/api/v1/public/clinical-attendance/identity')->assertOk();
            $this->postJson('/api/v1/public/clinical-attendance/scan', ['qr_token' => $qr])->assertOk();
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
            $this->postJson('/api/v1/public/clinical-attendance/verify-otp', ['challenge_token' => str_pad((string) $i, 64, 'x'), 'otp' => '123456'])->assertUnprocessable();
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
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/public/clinical-attendance/request-otp', ['university_number' => '99999999'])->assertUnprocessable();
        }
        $this->postJson('/api/v1/public/clinical-attendance/request-otp', ['university_number' => '99999999'])->assertStatus(429);
        $this->postJson('/api/v1/public/clinical-attendance/request-otp', ['university_number' => '88888888'])->assertUnprocessable();
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
        $role->permissions()->detach([$manage->id, Permission::where('code', 'university_lectures.attendance.correct_approved')->firstOrFail()->id]);
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
        $this->postJson('/api/v1/operational/university-attendance/plans', [...$plan, 'supervisor_person_id' => $lecture->supervisor_person_id])->assertUnprocessable();
    }

    public function test_approval_seals_manual_register_and_only_a_separately_authorized_administrative_assistant_can_correct_it(): void
    {
        [$lecture,$students,$doctor] = $this->fixture(2);
        $rta = $this->actor('RTA');
        $assistant = $this->actor('ADMIN_ASSISTANT');
        $url = "/api/v1/operational/university-attendance/plans/{$lecture->id}/day";
        $body = ['session_date' => '2026-10-15', 'records' => $students->map(fn ($student) => ['student_id' => $student->id, 'status' => 'present'])->all()];
        $this->actingAs($doctor)->getJson($url.'?session_date=2026-10-15')->assertOk()->assertJsonPath('data.is_approved', false)->assertJsonPath('data.can_edit', true);
        $id = $this->postJson($url, $body)->assertOk()->assertJsonPath('data.is_approved', true)->json('data.session_id');
        $this->assertDatabaseHas('clinical_university_sessions', ['id' => $id, 'approved_by_user_id' => $doctor->id]);
        $session = ClinicalUniversitySession::findOrFail($id);
        $this->assertNotNull($session->approved_at);
        $approvedAt = $session->approved_at->toDateTimeString();
        $correction = $body;
        $correction['records'][0]['status'] = 'absent';
        $correction['correction_reason'] = 'Correct documented attendance error';
        foreach ([$doctor, $rta] as $actor) {
            $this->actingAs($actor)->getJson($url.'?session_date=2026-10-15')->assertOk()->assertJsonPath('data.is_approved', true)->assertJsonPath('data.can_edit', false);
            $this->postJson($url, $correction)->assertForbidden();
        }
        // A permission grant alone cannot authorize a non-administrative assistant.
        Role::where('code', 'RTA')->firstOrFail()->permissions()->attach(Permission::where('code', 'university_lectures.attendance.correct_approved')->firstOrFail()->id, ['scope_type' => 'global']);
        $this->actingAs($rta)->postJson($url, $correction)->assertForbidden();
        Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail()->permissions()->detach(Permission::where('code', 'university_lectures.attendance.manage')->firstOrFail()->id);
        $this->actingAs($assistant)->getJson($url.'?session_date=2026-10-15')->assertOk()->assertJsonPath('data.can_correct_approved', true)->assertJsonPath('data.can_edit', true);
        $this->postJson($url, [...$correction, 'correction_reason' => ''])->assertUnprocessable();
        $this->postJson($url, $correction)->assertOk();
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[0]->id, 'status' => 'absent', 'recorded_by_user_id' => $assistant->id]);
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[1]->id, 'status' => 'present', 'recorded_by_user_id' => $doctor->id]);
        $session->refresh();
        $this->assertSame($approvedAt, $session->approved_at->toDateTimeString());
        $this->assertSame($doctor->id, $session->approved_by_user_id);
        $audit = AuditLog::where('action', 'clinical_university.attendance_recorded')->where('student_id', $students[0]->id)->latest('id')->firstOrFail();
        $this->assertSame('present', $audit->changes['previous_status']);
        $this->assertSame($correction['correction_reason'], $audit->changes['correction_reason']);
        $this->assertDatabaseHas('audit_logs', ['action' => 'clinical_university.attendance_approved', 'user_id' => $doctor->id]);
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $role->permissions()->detach(Permission::where('code', 'university_lectures.attendance.correct_approved')->firstOrFail()->id);
        $this->actingAs($assistant)->postJson($url, $correction)->assertForbidden();
    }

    public function test_qr_approval_seals_the_register_and_existing_historical_registers_are_read_only(): void
    {
        [$lecture,$students,$doctor] = $this->fixture();
        $base = "/api/v1/operational/university-attendance/plans/{$lecture->id}";
        $this->actingAs($doctor)->postJson($base.'/qr/open', ['session_date' => '2026-10-15'])->assertOk();
        $this->getJson($base.'/day?session_date=2026-10-15')->assertOk()->assertJsonPath('data.is_approved', false)->assertJsonPath('data.can_edit', false);
        $this->postJson($base.'/qr/close', ['session_date' => '2026-10-15'])->assertOk();
        $this->getJson($base.'/day?session_date=2026-10-15')->assertOk()->assertJsonPath('data.is_approved', true)->assertJsonPath('data.can_edit', false);
        $body = ['session_date' => '2026-10-15', 'records' => [['student_id' => $students[0]->id, 'status' => 'present']], 'correction_reason' => 'Attempt to change sealed attendance'];
        $this->postJson($base.'/day', $body)->assertForbidden();
        $session = ClinicalUniversitySession::where('clinical_university_lecture_id', $lecture->id)->firstOrFail();
        $this->assertSame($doctor->id, $session->approved_by_user_id);
        $this->assertNotNull($session->approved_at);
        // Legacy records had no approval metadata; do not fabricate it.
        $session->update(['approved_at' => null, 'approved_by_user_id' => null, 'qr_state' => null]);
        $this->getJson($base.'/day?session_date=2026-10-15')->assertOk()->assertJsonPath('data.is_approved', true)->assertJsonPath('data.approved_at', null)->assertJsonPath('data.can_edit', false);
        $this->postJson($base.'/day', $body)->assertForbidden();
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[0]->id, 'status' => 'absent']);
    }

    public function test_more_than_two_non_overlapping_lectures_can_share_a_group_and_day_but_time_conflicts_are_rejected(): void
    {
        [$lecture] = $this->fixture();
        $rta = $this->actor('RTA');
        $url = '/api/v1/operational/university-attendance/plans';
        $plan = ['student_group_id' => $lecture->student_group_id, 'supervisor_person_id' => $lecture->supervisor_person_id, 'title' => 'Additional lecture', 'weekday' => 'thursday', 'starts_on' => '2026-10-15', 'ends_on' => '2026-10-15'];
        $this->actingAs($rta);
        foreach ([['07:00', '08:00'], ['08:00', '09:00'], ['11:00', '12:00'], ['12:00', '13:00']] as [$start,$end]) {
            $id = $this->postJson($url, [...$plan, 'starts_at' => $start, 'ends_at' => $end])->assertCreated()->json('data.id');
        }
        $this->assertDatabaseCount('clinical_university_lectures', 5);
        foreach ([['08:30', '09:30'], ['09:00', '10:00'], ['06:00', '14:00'], ['09:00', '11:00']] as [$start,$end]) {
            $this->postJson($url, [...$plan, 'starts_at' => $start, 'ends_at' => $end])->assertUnprocessable()->assertJsonValidationErrors('starts_at');
        }
        $this->putJson($url.'/'.$id, [...$plan, 'starts_at' => '10:00', 'ends_at' => '12:00'])->assertUnprocessable();
        $this->putJson($url.'/'.$id, [...$plan, 'starts_at' => '14:00', 'ends_at' => '15:00'])->assertOk();
        $this->postJson($url, [...$plan, 'starts_on' => '2026-10-22', 'ends_on' => '2026-10-22', 'starts_at' => '09:00', 'ends_at' => '11:00'])->assertCreated();
    }

    public function test_approved_occurrences_are_removed_from_qr_dates_while_open_and_future_occurrences_remain_available(): void
    {
        [$lecture,,$doctor]=$this->fixture();
        $lecture->update(['ends_on'=>'2026-10-22']);
        $list='/api/v1/operational/university-attendance/plans';
        $base=$list.'/'.$lecture->id;
        $this->actingAs($doctor)->getJson($list)->assertOk()->assertJsonPath('data.lectures.0.available_qr_dates',['2026-10-15','2026-10-22']);
        $this->postJson($base.'/qr/open',['session_date'=>'2026-10-15'])->assertOk();
        $this->getJson($list)->assertOk()->assertJsonPath('data.lectures.0.available_qr_dates',['2026-10-15','2026-10-22']);
        $this->postJson($base.'/qr/close',['session_date'=>'2026-10-15'])->assertOk();
        $this->getJson($list)->assertOk()->assertJsonPath('data.lectures.0.available_qr_dates',['2026-10-22']);
        $lecture->update(['ends_on'=>'2026-10-15']);
        $this->getJson($list)->assertOk()->assertJsonPath('data.lectures.0.available_qr_dates',[]);
        ClinicalUniversitySession::where('clinical_university_lecture_id',$lecture->id)->update(['approved_at'=>null,'approved_by_user_id'=>null,'qr_state'=>null]);
        $this->getJson($list)->assertOk()->assertJsonPath('data.lectures.0.available_qr_dates',[]);
    }

    public function test_approved_correction_permission_is_configurable_and_reserved_for_administrative_assistants(): void
    {
        $admin = $this->actor('SYS_ADMIN');
        $permission = Permission::where('code', 'university_lectures.attendance.correct_approved')->firstOrFail();
        $this->actingAs($admin)->postJson('/api/v1/admin/permissions/toggle', ['role_id' => Role::where('code', 'RTA')->firstOrFail()->id, 'permission_id' => $permission->id, 'granted' => true])->assertUnprocessable();
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        foreach ([false, true] as $granted) {
            $this->postJson('/api/v1/admin/permissions/toggle',['role_id' => $role->id, 'permission_id' => $permission->id, 'granted' => $granted])->assertOk();
            $this->assertSame($granted,$role->permissions()->where('permissions.id',$permission->id)->exists());
        }
    }
}
