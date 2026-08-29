<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Course;
use App\Models\CourseScheduleCell;
use App\Models\CourseScheduleRow;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\Distribution\CourseScheduleMembershipSyncService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CourseDistributionWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private AcademicYear $year;
    private Course $course;
    private StudentSubgroup $subgroup;
    private Person $doctor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\Phase3PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
        $role = Role::create(['code' => 'COURSE_DISTRIBUTOR_TEST', 'name_key' => 'test', 'name_ar' => 'Test', 'name_en' => 'Test']);
        $ids = Permission::whereIn('code', ['distribution.view', 'distribution.update', 'distribution.schedule_rows.manage', 'distribution.approve', 'distribution.publish', 'distribution.override', 'distribution.revise', 'distribution.unpublish', 'distribution.delete', 'rotations.create', 'people.manage'])->pluck('id');
        $role->permissions()->sync($ids->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $this->user = User::factory()->create();
        $this->user->roles()->attach($role);

        $this->year = AcademicYear::factory()->create(['is_current' => true, 'status' => 'active']);
        $this->course = Course::create(['code' => 'MED401', 'name_ar' => 'باطني', 'credit_hours' => 4, 'academic_level' => 'fourth', 'semester' => 1, 'is_active' => true]);
        Course::create(['code' => 'MED501', 'name_ar' => 'جراحة', 'credit_hours' => 4, 'academic_level' => 'fifth', 'semester' => 1, 'is_active' => true]);
        $group = StudentGroup::factory()->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'name' => 'L']);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'name' => 'L1', 'is_active' => true]);
        foreach (Student::factory()->count(2)->create(['academic_year_id' => $this->year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']) as $student) {
            StudentGroupAssignment::factory()->create(['student_id' => $student->id, 'academic_year_id' => $this->year->id, 'student_group_id' => $group->id, 'student_subgroup_id' => $this->subgroup->id, 'valid_until' => null]);
        }
        $site = TrainingSite::factory()->create(['is_active' => true]);
        $doctorUser = User::factory()->create();
        $doctorUser->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $this->doctor = Person::factory()->create([
            'user_id' => $doctorUser->id,
            'email' => $doctorUser->email,
            'primary_site_id' => $site->id,
            'is_active' => true,
        ]);
        $this->doctor->trainingSites()->attach($site->id, ['is_primary' => true]);
    }

    public function test_options_expose_courses_by_their_academic_level_and_hospital_doctors(): void
    {
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonFragment(['id' => $this->course->id, 'academic_level' => 'fourth'])
            ->assertJsonPath('data.hospitals.0.supervisors.0.id', $this->doctor->id);
    }

    public function test_rta_distribution_options_and_operations_are_limited_to_assigned_cohort(): void
    {
        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        $permissionIds = Permission::whereIn('code', [
            'distribution.view',
            'distribution.update',
            'distribution.schedule_rows.manage',
            'distribution.approve',
            'distribution.publish',
            'rotations.create',
        ])->pluck('id');
        $rtaRole->permissions()->syncWithoutDetaching(
            $permissionIds->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all()
        );
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($rtaRole->id);
        $fifthCourse = Course::where('academic_level', 'fifth')->firstOrFail();

        $options = $this->actingAs($rta)->getJson('/api/v1/course-distribution/options')
            ->assertOk();
        $this->assertSame(['fourth'], collect($options->json('data.courses'))->pluck('academic_level')->unique()->values()->all());
        $this->assertNotContains($fifthCourse->id, collect($options->json('data.courses'))->pluck('id')->all());

        $this->actingAs($rta)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fifth&course_id='.$fifthCourse->id)
            ->assertNotFound();
        $this->actingAs($rta)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fifth',
            'course_id' => $fifthCourse->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertNotFound();

        $rotation = Rotation::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fifth',
            'course_id' => $fifthCourse->id,
        ]);
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'name' => 'جدول الخامسة',
            'status' => 'manual',
        ]);
        $this->actingAs($rta)->postJson("/api/v1/course-distribution/versions/{$version->id}/rows", [
            'row_type' => 'vacancy',
            'training_site_id' => $this->doctor->primary_site_id,
            'label' => 'شاغر',
        ])->assertNotFound();
        $this->actingAs($rta)->postJson("/api/v1/distribution-versions/{$version->id}/approve")
            ->assertNotFound();
        $this->actingAs($rta)->postJson("/api/v1/distribution-versions/{$version->id}/publish", [
            'last_updated_at' => $version->updated_at->toIso8601String(),
        ])->assertNotFound();
        $this->actingAs($rta)->getJson('/api/v1/distribution-versions?per_page=100')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_can_create_weekly_course_schedule_and_assign_a_group_to_doctor_cell(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 3,
        ])->assertCreated();

        $versionId = $created->json('data.version.id');
        $emptySchedule = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->assertJsonCount(3, 'data.blocks')->assertJsonCount(0, 'data.rows')->assertJsonPath('data.subgroups.0.name', 'L1');
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $schedule = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->assertJsonCount(1, 'data.rows');
        $blockId = $schedule->json('data.blocks.0.id');

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();

        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $versionId)->count());
        $this->actingAs($this->user)->postJson("/api/v1/distribution-versions/{$versionId}/approve")
            ->assertOk();
        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
        ])->assertOk();
        $this->assertDatabaseCount('student_clinical_assignments', 0);
    }

    public function test_empty_subgroup_can_be_scheduled_and_later_members_inherit_the_placement(): void
    {
        $emptySubgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $this->subgroup->student_group_id,
            'name' => 'L2',
            'is_active' => true,
        ]);
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 1,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $blockId = DistributionVersion::findOrFail($versionId)->rotation->blocks()->firstOrFail()->id;

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $emptySubgroup->id,
        ])->assertOk();

        $this->assertDatabaseHas('course_schedule_cells', [
            'distribution_version_id' => $versionId,
            'course_schedule_row_id' => $rowId,
            'student_subgroup_id' => $emptySubgroup->id,
        ]);
        $this->assertSame(0, StudentClinicalAssignment::where('student_subgroup_id', $emptySubgroup->id)->count());
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()
            ->assertJsonPath('data.cells.0.subgroup_id', $emptySubgroup->id);

        $student = Student::factory()->create([
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'registration_status' => 'active',
        ]);
        StudentGroupAssignment::factory()->create([
            'student_id' => $student->id,
            'academic_year_id' => $this->year->id,
            'student_group_id' => $emptySubgroup->student_group_id,
            'student_subgroup_id' => $emptySubgroup->id,
            'valid_until' => null,
        ]);
        app(CourseScheduleMembershipSyncService::class)->syncStudent($student->id, $this->year->id);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'student_id' => $student->id,
            'distribution_version_id' => $versionId,
            'course_schedule_row_id' => $rowId,
            'student_subgroup_id' => $emptySubgroup->id,
        ]);
    }

    public function test_adding_doctor_creates_linked_clinical_supervisor_account(): void
    {
        $site = TrainingSite::factory()->create(['is_active' => true]);
        $this->actingAs($this->user)->postJson('/api/v1/course-distribution/doctors', [
            'full_name_ar' => 'د. طبيب جديد',
            'email' => 'doctor@example.com',
            'password' => 'Strong!Pass123',
            'primary_site_id' => $site->id,
            'specialty' => 'باطني',
        ])->assertCreated();

        $account = User::where('email', 'doctor@example.com')->firstOrFail();
        $this->assertTrue($account->hasRole('CLINICAL_SUPERVISOR'));
        $this->assertDatabaseHas('people', ['user_id' => $account->id, 'primary_site_id' => $site->id]);
    }

    public function test_supervisor_accounts_without_people_profiles_are_listed_and_can_be_assigned(): void
    {
        $account = User::factory()->create(['name' => 'د. موجود مسبقاً', 'email' => 'existing-doctor@example.com']);
        $account->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $site = TrainingSite::factory()->create(['is_active' => true]);

        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertOk()
            ->assertJsonFragment(['user_id' => $account->id, 'full_name_ar' => 'د. موجود مسبقاً'])
            ->assertJsonPath('data.unassigned_doctors.0.user_id', $account->id);

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/doctors/{$account->id}/hospital", [
            'primary_site_id' => $site->id,
        ])->assertOk();

        $this->assertDatabaseHas('people', [
            'user_id' => $account->id,
            'email' => 'existing-doctor@example.com',
            'primary_site_id' => $site->id,
        ]);
        $this->actingAs($this->user)->getJson('/api/v1/course-distribution/options')
            ->assertJsonFragment(['user_id' => $account->id, 'primary_site_id' => $site->id]);
    }

    public function test_can_add_edit_and_delete_a_vacancy_row(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $versionId = $created->json('data.version.id');

        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$versionId}/rows", [
            'row_type' => 'vacancy',
            'training_site_id' => $this->doctor->primary_site_id,
            'label' => 'شاغر جراحة',
        ])->assertCreated()->assertJsonPath('data.person_id', null)->json('data.id');

        $blockId = $this->actingAs($this->user)->getJson('/api/v1/course-distribution/schedule?academic_year_id='.$this->year->id.'&academic_level=fourth&course_id='.$this->course->id)
            ->assertOk()->json('data.blocks.0.id');
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $this->assertDatabaseHas('student_clinical_assignments', [
            'course_schedule_row_id' => $rowId,
            'supervisor_id' => null,
        ]);

        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertOk()->assertJsonPath('data.person_id', $this->doctor->id);
        $this->assertDatabaseMissing('student_clinical_assignments', [
            'course_schedule_row_id' => $rowId,
            'supervisor_id' => null,
        ]);

        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/versions/{$versionId}/rows/{$rowId}")
            ->assertOk();
        $this->assertDatabaseMissing('course_schedule_rows', ['id' => $rowId]);
    }

    public function test_published_schedule_can_be_revised_unpublished_and_deleted(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/v1/course-distribution/schedules', [
            'academic_year_id' => $this->year->id,
            'academic_level' => 'fourth',
            'course_id' => $this->course->id,
            'start_date' => '2026-09-01',
            'weeks_count' => 2,
        ])->assertCreated();
        $version = DistributionVersion::findOrFail($created->json('data.version.id'));
        $rowId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/rows", [
            'row_type' => 'doctor',
            'person_id' => $this->doctor->id,
            'training_site_id' => $this->doctor->primary_site_id,
        ])->assertCreated()->json('data.id');
        $blockId = $version->rotation->blocks()->firstOrFail()->id;
        $this->actingAs($this->user)->putJson("/api/v1/course-distribution/versions/{$version->id}/cell", [
            'rotation_block_id' => $blockId,
            'course_schedule_row_id' => $rowId,
            'subgroup_id' => $this->subgroup->id,
        ])->assertOk();
        $version->update(['status' => 'published', 'is_current' => true]);

        $duplicateCurrent = DistributionVersion::create([
            'rotation_id' => $version->rotation_id,
            'name' => 'نسخة منشورة قديمة مكررة',
            'status' => 'published',
            'is_current' => true,
        ]);

        $revisionId = $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/revise")
            ->assertOk()->assertJsonPath('data.source_version_id', $version->id)->json('data.id');
        $this->assertDatabaseHas('distribution_versions', ['id' => $revisionId, 'status' => 'manual']);
        $this->assertSame(1, CourseScheduleRow::where('distribution_version_id', $revisionId)->count());
        $this->assertSame(2, StudentClinicalAssignment::where('distribution_version_id', $revisionId)->count());
        $this->assertSame(1, CourseScheduleCell::where('distribution_version_id', $revisionId)->count());

        $this->actingAs($this->user)->postJson("/api/v1/course-distribution/versions/{$version->id}/unpublish", [
            'reason' => 'جدول تجريبي للفحص',
        ])->assertOk()->assertJsonPath('data.status', 'withdrawn');

        $this->assertDatabaseHas('distribution_versions', ['id' => $duplicateCurrent->id, 'status' => 'withdrawn', 'is_current' => false]);

        $rotationId = $version->rotation_id;
        $this->actingAs($this->user)->deleteJson("/api/v1/course-distribution/rotations/{$rotationId}", [
            'reason' => 'حذف الجدول التجريبي',
        ])->assertOk();
        $this->assertDatabaseMissing('rotations', ['id' => $rotationId]);
        $this->assertDatabaseMissing('distribution_versions', ['id' => $revisionId]);
    }
}
