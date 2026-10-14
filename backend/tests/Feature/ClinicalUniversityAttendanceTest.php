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
use Carbon\Carbon;
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
        $this->actingAs($doctor)->getJson('/api/v1/operational/university-attendance/mine')
            ->assertOk()->assertJsonCount(1, 'data');
        $this->assertDatabaseHas('audit_logs', ['action' => 'clinical_university.attendance_recorded', 'student_id' => $students[0]->id]);
    }
}
