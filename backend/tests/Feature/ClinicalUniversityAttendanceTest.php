<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\User;
use App\Services\ClinicalAttendance\QrAttendanceService;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ClinicalUniversityAttendanceTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-15 12:00:00');
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);
        foreach (['RTA' => 'attendance.review', 'CLINICAL_SUPERVISOR' => 'attendance.record'] as $role => $permission) {
            $id = Permission::where('code', $permission)->firstOrFail()->id;
            Role::where('code', $role)->firstOrFail()->permissions()->syncWithoutDetaching([$id => ['scope_type' => 'global']]);
        }
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_migration_completes_a_partially_created_sessions_table_without_dropping_it(): void
    {
        Schema::drop('clinical_university_attendance_records');
        Schema::drop('clinical_university_sessions');
        Schema::create('clinical_university_sessions', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('clinical_university_lecture_id');
            $table->date('session_date');
            $table->foreignId('supervisor_person_id');
            $table->foreignId('recorded_by_user_id')->nullable();
            $table->timestamps();
        });

        (require database_path('migrations/2026_10_14_100000_create_clinical_university_attendance.php'))->up();

        $this->assertTrue(Schema::hasTable('clinical_university_attendance_records'));
        $this->assertTrue(Schema::hasIndex('clinical_university_sessions', 'university_session_lecture_date_unique'));
        $this->assertContains(['clinical_university_lecture_id'], array_column(Schema::getForeignKeys('clinical_university_sessions'), 'columns'));
        $this->assertContains(['clinical_university_session_id'], array_column(Schema::getForeignKeys('clinical_university_attendance_records'), 'columns'));
    }

    public function test_main_group_has_one_roster_across_subgroups_and_separate_registers_for_same_day_lectures(): void
    {
        $year = AcademicYear::factory()->create(['code' => '2026/2027', 'start_date' => '2026-09-01', 'end_date' => '2027-08-31', 'is_current' => true]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'A']);
        $a1 = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'name' => 'A1']);
        $a2 = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'name' => 'A2']);
        $students = collect([
            Student::factory()->create(['academic_year_id' => $year->id]),
            Student::factory()->create(['academic_year_id' => $year->id]),
        ]);
        foreach ($students as $index => $student) {
            StudentGroupAssignment::factory()->create(['student_id' => $student->id, 'academic_year_id' => $year->id,
                'student_group_id' => $group->id, 'student_subgroup_id' => $index ? $a2->id : $a1->id]);
        }
        StudentGroupAssignment::factory()->create(['student_id' => $students[0]->id, 'academic_year_id' => $year->id,
            'student_group_id' => $group->id, 'student_subgroup_id' => $a1->id]);

        $rta = User::factory()->create();
        $rta->roles()->attach(Role::where('code', 'RTA')->firstOrFail());
        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $person = Person::factory()->create(['user_id' => $doctor->id]);
        $stranger = User::factory()->create();
        $stranger->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        Person::factory()->create(['user_id' => $stranger->id]);

        $plan = ['student_group_id' => $group->id, 'supervisor_person_id' => $person->id, 'title' => 'محاضرة أولى',
            'weekday' => 'thursday', 'starts_at' => '08:00', 'ends_at' => '09:00',
            'starts_on' => '2026-09-01', 'ends_on' => '2026-12-31'];
        $first = $this->actingAs($rta)->postJson('/api/v1/operational/university-attendance/plans', $plan)
            ->assertCreated()->json('data.id');
        $second = $this->actingAs($rta)->postJson('/api/v1/operational/university-attendance/plans', [
            ...$plan, 'title' => 'محاضرة ثانية', 'starts_at' => '10:00', 'ends_at' => '11:00',
        ])->assertCreated()->json('data.id');
        $this->actingAs($rta)->postJson('/api/v1/operational/university-attendance/plans', [
            ...$plan, 'title' => 'محاضرة ثالثة', 'starts_at' => '12:00', 'ends_at' => '13:00',
        ])->assertUnprocessable();
        $temporary = $this->actingAs($rta)->postJson('/api/v1/operational/university-attendance/plans', [
            ...$plan, 'title' => 'محاضرة قابلة للحذف', 'weekday' => 'friday',
            'starts_on' => '2026-10-16', 'ends_on' => '2026-10-16',
        ])->assertCreated()->json('data.id');
        $this->actingAs($rta)->deleteJson("/api/v1/operational/university-attendance/plans/$temporary")
            ->assertOk()->assertJsonPath('data.result', 'deleted');
        $this->assertDatabaseMissing('clinical_university_lectures', ['id' => $temporary]);
        $this->actingAs($stranger)->getJson("/api/v1/operational/university-attendance/plans/$first/day?session_date=2026-10-08")
            ->assertForbidden();
        $this->actingAs($stranger)->postJson("/api/v1/operational/university-attendance/plans/$first/day", [
            'session_date' => '2026-10-08', 'records' => [['student_id' => $students[0]->id, 'status' => 'present']],
        ])->assertForbidden();

        $this->actingAs($doctor)->getJson('/api/v1/operational/university-attendance/mine')
            ->assertOk()->assertJsonCount(2, 'data');
        $this->actingAs($doctor)->getJson('/api/v1/operational/my-supervisor-workspace')
            ->assertOk()->assertJsonCount(2, 'data.university_lectures')
            ->assertJsonPath('data.university_lectures.0.group.name', 'A');
        $this->actingAs($doctor)->getJson("/api/v1/operational/university-attendance/plans/$first/day?session_date=2026-10-08")
            ->assertOk()->assertJsonCount(2, 'data.rows')
            ->assertJsonPath('data.rows.0.subgroup.name', 'A1')
            ->assertJsonPath('data.rows.1.subgroup.name', 'A2');
        $records = $students->map(fn ($student) => ['student_id' => $student->id, 'status' => 'present'])->all();
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/day", [
            'session_date' => '2026-10-08', 'records' => [$records[0]],
        ])->assertUnprocessable()->assertJsonValidationErrors('records');
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/day", [
            'session_date' => '2026-10-08', 'records' => $records,
        ])->assertOk();
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$second/day", [
            'session_date' => '2026-10-08', 'records' => [
                ['student_id' => $students[0]->id, 'status' => 'absent'],
                ['student_id' => $students[1]->id, 'status' => 'excused', 'excuse_note' => 'عذر طبي'],
            ],
        ])->assertOk();
        $this->assertDatabaseCount('clinical_university_sessions', 2);
        $this->assertDatabaseCount('clinical_university_attendance_records', 4);
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[0]->id, 'status' => 'absent']);
        $this->actingAs($rta)->getJson('/api/v1/operational/university-attendance/plans?student_group_id='.$group->id)
            ->assertOk()->assertJsonPath('data.sessions.0.session_date', '2026-10-08')
            ->assertJsonPath('data.lectures.0.starts_on', '2026-09-01');
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/day", [
            'session_date' => '2026-10-08', 'records' => [
                ['student_id' => $students[0]->id, 'status' => 'late'],
                ['student_id' => $students[1]->id, 'status' => 'present'],
            ],
        ])->assertOk();
        $this->assertDatabaseCount('clinical_university_attendance_records', 4);
        $correction = AuditLog::where('action', 'clinical_university.attendance_recorded')
            ->where('student_id', $students[0]->id)->latest('id')->firstOrFail();
        $this->assertSame('present', $correction->changes['previous_status']);
        $this->assertSame('late', $correction->changes['status']);

        config()->set('clinical_attendance.enabled', true);
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/qr/open", [
            'session_date' => '2026-10-15',
        ])->assertOk()->assertJsonPath('data.qr_state', 'open');
        $token = $this->actingAs($doctor)->getJson("/api/v1/operational/university-attendance/plans/$first/qr?session_date=2026-10-15")
            ->assertOk()->json('data.token');
        $this->actingAs($rta)->deleteJson("/api/v1/operational/university-attendance/plans/$first")
            ->assertStatus(409);
        $scan = app(QrAttendanceService::class)->scan(Request::create('/api/v1/public/clinical-attendance/scan', 'POST'), $students[0], $token);
        $this->assertSame('check_in', $scan['operation']);
        try {
            app(QrAttendanceService::class)->scan(Request::create('/api/v1/public/clinical-attendance/scan', 'POST'),
                Student::factory()->create(['academic_year_id' => $year->id]), $token);
            $this->fail('A student outside the main-group roster scanned the lecture QR.');
        } catch (\Illuminate\Validation\ValidationException $exception) {
            $this->assertStringContainsString('غير موجود في كشف المجموعة الرئيسية', $exception->errors()['qr_token'][0]);
        }
        config()->set('group_registration.otp_enabled', false);
        $outside = Student::factory()->create(['academic_year_id' => $year->id]);
        $accessToken = $this->postJson('/api/v1/public/clinical-attendance/request-otp', [
            'university_number' => $outside->university_number, 'qr_token' => $token,
        ])->assertOk()->json('data.access_token');
        $this->postJson('/api/v1/public/clinical-attendance/scan', [
            'qr_token' => $token, 'access_token' => $accessToken,
        ])->assertUnprocessable()->assertJsonPath('message',
            'لم يُسجّل حضورك: رقمك الجامعي غير موجود في كشف المجموعة الرئيسية لهذه المحاضرة. راجع المشرف إذا كنت تتبع هذه المجموعة.')
            ->assertJsonPath('errors.qr_token.0',
            'لم يُسجّل حضورك: رقمك الجامعي غير موجود في كشف المجموعة الرئيسية لهذه المحاضرة. راجع المشرف إذا كنت تتبع هذه المجموعة.');
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/qr/close", [
            'session_date' => '2026-10-15',
        ])->assertOk()->assertJsonPath('data.qr_state', 'closed');
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[0]->id, 'status' => 'present']);
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $students[1]->id, 'status' => 'absent']);
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$first/qr/open", [
            'session_date' => '2026-10-15',
        ])->assertStatus(409);

        // A later membership change must not silently rewrite a saved historical register.
        $newStudent = Student::factory()->create(['academic_year_id' => $year->id]);
        StudentGroupAssignment::factory()->create(['student_id' => $newStudent->id, 'academic_year_id' => $year->id,
            'student_group_id' => $group->id, 'student_subgroup_id' => $a2->id]);
        $this->actingAs($rta)->getJson("/api/v1/operational/university-attendance/plans/$first/day?session_date=2026-10-08")
            ->assertOk()->assertJsonCount(2, 'data.rows');
        $this->actingAs($rta)->putJson("/api/v1/operational/university-attendance/plans/$first", $plan)
            ->assertStatus(409);
        $this->actingAs($rta)->postJson("/api/v1/operational/university-attendance/plans/$first/archive")
            ->assertOk();
        $this->actingAs($rta)->deleteJson("/api/v1/operational/university-attendance/plans/$first")
            ->assertOk()->assertJsonPath('data.result', 'archived');
        $this->assertDatabaseHas('clinical_university_sessions', ['clinical_university_lecture_id' => $first]);
        $this->actingAs($doctor)->getJson('/api/v1/operational/university-attendance/mine')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseHas('audit_logs', ['action' => 'clinical_university.attendance_recorded', 'student_id' => $students[0]->id]);

        $assistant = User::factory()->create();
        $assistantRole = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $assistant->roles()->attach($assistantRole);
        $managePermission = Permission::where('code', 'university_lectures.manage')->firstOrFail();
        $deletePermission = Permission::where('code', 'university_lectures.delete_with_attendance')->firstOrFail();
        $admin = User::factory()->create();
        $admin->roles()->attach(Role::where('code', 'SYS_ADMIN')->firstOrFail());
        $deleteUrl = "/api/v1/operational/university-attendance/plans/$first/with-attendance";
        $deletion = ['confirmation' => 'محاضرة أولى', 'reason' => 'تم إنشاء المحاضرة والكشف بطريق الخطأ'];

        $this->actingAs($assistant)->getJson('/api/v1/operational/university-attendance/plans')->assertForbidden();
        $this->actingAs($admin)->postJson('/api/v1/admin/permissions/toggle', [
            'role_id' => $assistantRole->id, 'permission_id' => $managePermission->id, 'granted' => true,
        ])->assertOk();
        $this->actingAs($assistant)->getJson('/api/v1/operational/university-attendance/plans')->assertOk();
        $this->actingAs($assistant)->deleteJson($deleteUrl, $deletion)->assertForbidden();

        $this->actingAs($admin)->postJson('/api/v1/admin/permissions/toggle', [
            'role_id' => Role::where('code', 'RTA')->firstOrFail()->id,
            'permission_id' => $deletePermission->id, 'granted' => true,
        ])->assertUnprocessable();
        $this->actingAs($admin)->postJson('/api/v1/admin/permissions/toggle', [
            'role_id' => $assistantRole->id, 'permission_id' => $deletePermission->id, 'granted' => true,
        ])->assertOk();
        Role::where('code', 'SYS_ADMIN')->firstOrFail()->permissions()->syncWithoutDetaching([
            $deletePermission->id => ['scope_type' => 'global'],
        ]);
        $this->actingAs($admin)->deleteJson($deleteUrl, $deletion)->assertForbidden();
        $this->actingAs($rta)->deleteJson($deleteUrl, $deletion)->assertForbidden();
        $this->actingAs($assistant)->deleteJson($deleteUrl, [
            'confirmation' => 'اسم غير مطابق', 'reason' => $deletion['reason'],
        ])->assertUnprocessable();
        $this->assertDatabaseHas('clinical_university_sessions', ['clinical_university_lecture_id' => $first]);
        $this->actingAs($assistant)->deleteJson($deleteUrl, $deletion)
            ->assertOk()->assertJsonPath('data.result', 'deleted_with_attendance')
            ->assertJsonPath('data.sessions_deleted', 2)->assertJsonPath('data.records_deleted', 4);
        $this->assertDatabaseMissing('clinical_university_lectures', ['id' => $first]);
        $this->assertDatabaseMissing('clinical_university_sessions', ['clinical_university_lecture_id' => $first]);
        $this->assertDatabaseCount('clinical_university_attendance_records', 2); // Second lecture retained.
        $this->assertDatabaseHas('audit_logs', ['action' => 'clinical_university.lecture_deleted_with_attendance', 'entity_id' => $first]);
    }

    public function test_administrative_deletion_refuses_an_open_qr_register(): void
    {
        config()->set('clinical_attendance.enabled', true);
        $year = AcademicYear::factory()->create(['code' => '2026/2027', 'start_date' => '2026-09-01',
            'end_date' => '2027-08-31', 'is_current' => true]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'B']);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'name' => 'B1']);
        $student = Student::factory()->create(['academic_year_id' => $year->id]);
        StudentGroupAssignment::factory()->create(['student_id' => $student->id, 'academic_year_id' => $year->id,
            'student_group_id' => $group->id, 'student_subgroup_id' => $subgroup->id]);

        $doctor = User::factory()->create();
        $doctor->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $person = Person::factory()->create(['user_id' => $doctor->id]);
        $rta = User::factory()->create();
        $rta->roles()->attach(Role::where('code', 'RTA')->firstOrFail());
        $lectureId = $this->actingAs($rta)->postJson('/api/v1/operational/university-attendance/plans', [
            'student_group_id' => $group->id, 'supervisor_person_id' => $person->id, 'title' => 'محاضرة مفتوحة',
            'weekday' => 'thursday', 'starts_at' => '09:00', 'ends_at' => '11:30',
            'starts_on' => '2026-10-15', 'ends_on' => '2026-10-15',
        ])->assertCreated()->json('data.id');
        $this->actingAs($doctor)->postJson("/api/v1/operational/university-attendance/plans/$lectureId/qr/open", [
            'session_date' => '2026-10-15',
        ])->assertOk();

        $assistant = User::factory()->create();
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $assistant->roles()->attach($role);
        foreach (Permission::whereIn('code', ['university_lectures.manage', 'university_lectures.delete_with_attendance'])->get() as $permission) {
            $role->permissions()->syncWithoutDetaching([$permission->id => ['scope_type' => 'global']]);
        }
        $this->actingAs($assistant)->deleteJson("/api/v1/operational/university-attendance/plans/$lectureId/with-attendance", [
            'confirmation' => 'محاضرة مفتوحة', 'reason' => 'إدخال المحاضرة تكرر بالخطأ',
        ])->assertUnprocessable()->assertJsonPath('errors.lecture.0', 'أغلق QR المفتوح قبل حذف المحاضرة وكشفها.');
        $this->assertDatabaseHas('clinical_university_lectures', ['id' => $lectureId]);
        $this->assertDatabaseHas('clinical_university_attendance_records', ['student_id' => $student->id]);
    }
}
