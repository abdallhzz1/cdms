<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StudentGroupAssignmentIntegrityTest extends TestCase
{
    use RefreshDatabase;

    private User $manager;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class]);

        $role = Role::create([
            'code' => 'GROUP_INTEGRITY_TEST',
            'name_key' => 'group_integrity_test',
            'name_ar' => 'اختبار سلامة المجموعات',
            'name_en' => 'Group integrity test',
        ]);
        $permission = Permission::where('code', 'groups.manage')->firstOrFail();
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);

        $this->manager = User::factory()->create(['name' => 'Group Manager']);
        $this->manager->roles()->attach($role->id);
    }

    public function test_reassignment_closes_previous_membership_and_leaves_one_current_record(): void
    {
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create();
        $firstGroup = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'A']);
        $secondGroup = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'B']);

        $this->assign($student, $year, $firstGroup, '2026-09-01')->assertCreated();
        $this->assign($student, $year, $secondGroup, '2026-10-01')->assertCreated();

        $assignments = StudentGroupAssignment::where('student_id', $student->id)
            ->where('academic_year_id', $year->id)
            ->orderBy('valid_from')
            ->get();

        $this->assertCount(2, $assignments);
        $this->assertSame('2026-10-01', $assignments[0]->valid_until->toDateString());
        $this->assertNull($assignments[1]->valid_until);
        $this->assertSame($this->manager->name, $assignments[1]->approved_by);
        $this->assertSame(1, $assignments->whereNull('valid_until')->count());
    }

    public function test_reassignment_cannot_be_backdated_before_current_membership(): void
    {
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create();
        $firstGroup = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'A']);
        $secondGroup = StudentGroup::factory()->create(['academic_year_id' => $year->id, 'name' => 'B']);

        $this->assign($student, $year, $firstGroup, '2026-09-10')->assertCreated();
        $this->assign($student, $year, $secondGroup, '2026-09-01')->assertStatus(422);

        $this->assertDatabaseCount('student_group_assignments', 1);
        $this->assertDatabaseHas('student_group_assignments', [
            'student_id' => $student->id,
            'academic_year_id' => $year->id,
            'student_group_id' => $firstGroup->id,
            'valid_until' => null,
        ]);
    }

    private function assign(Student $student, AcademicYear $year, StudentGroup $group, string $validFrom)
    {
        return $this->actingAs($this->manager)->postJson('/api/v1/student-group-assignments', [
            'student_id' => $student->id,
            'academic_year_id' => $year->id,
            'student_group_id' => $group->id,
            'valid_from' => $validFrom,
            'change_reason' => 'Integrity test reassignment',
        ]);
    }
}
