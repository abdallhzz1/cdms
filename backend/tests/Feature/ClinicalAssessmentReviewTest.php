<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\ClinicalAssessment;
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
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClinicalAssessmentReviewTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
    }

    public function test_rta_sees_all_subgroups_and_weeks_in_the_assigned_cohort_only(): void
    {
        $year = AcademicYear::factory()->create();
        $departmentA = Department::factory()->create();
        $departmentB = Department::factory()->create();
        $site = TrainingSite::factory()->create();
        $supervisor = Person::factory()->create();
        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        $rtaRole->permissions()->syncWithoutDetaching([
            Permission::where('code', 'assessment.review')->firstOrFail()->id => ['scope_type' => 'global'],
        ]);
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($rtaRole, ['scope_type' => 'department', 'scope_id' => $departmentA->id]);

        $course = Course::factory()->create(['academic_level' => 'fourth']);
        $rotation = Rotation::factory()->create([
            'academic_year_id' => $year->id, 'course_id' => $course->id,
            'academic_level' => 'fourth', 'start_date' => '2026-09-01', 'end_date' => '2026-09-30',
        ]);
        $block = RotationBlock::factory()->create([
            'rotation_id' => $rotation->id, 'department_id' => $departmentB->id,
            'from_week' => 1, 'to_week' => 2,
        ]);
        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id, 'status' => 'published', 'is_current' => true,
        ]);
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $year->id, 'academic_level' => 'fourth', 'name' => 'Q',
        ]);
        $subgroupOne = StudentSubgroup::create(['student_group_id' => $group->id, 'name' => 'Q1']);
        $subgroupTwo = StudentSubgroup::create(['student_group_id' => $group->id, 'name' => 'Q2']);

        $assignments = [];
        foreach ([[$subgroupOne, 'Q1', $departmentA], [$subgroupOne, 'Q1', $departmentB], [$subgroupTwo, 'Q2', $departmentB]] as $index => [$subgroup, $name, $department]) {
            $student = Student::factory()->create([
                'academic_level' => 'fourth', 'batch_year' => 2026,
                'academic_year_id' => $year->id, 'full_name_ar' => "طالب {$name} {$index}",
            ]);
            $assignments[] = StudentClinicalAssignment::create([
                'distribution_version_id' => $version->id, 'student_id' => $student->id,
                'student_subgroup_id' => $subgroup->id, 'rotation_block_id' => $block->id,
                'training_site_id' => $site->id, 'department_id' => $department->id,
                'supervisor_id' => $supervisor->id,
            ]);
        }

        ClinicalAssessment::create([
            'student_id' => $assignments[0]->student_id,
            'student_clinical_assignment_id' => $assignments[0]->id,
            'evaluator_person_id' => $supervisor->id,
            'evaluation_week' => 1, 'score' => 9, 'max_score' => 10,
            'status' => 'submitted', 'submitted_at' => now(),
        ]);

        $fifthCourse = Course::factory()->create(['academic_level' => 'fifth']);
        $fifthRotation = Rotation::factory()->create([
            'academic_year_id' => $year->id, 'course_id' => $fifthCourse->id,
            'academic_level' => 'fifth', 'start_date' => '2026-09-01', 'end_date' => '2026-09-30',
        ]);
        $fifthBlock = RotationBlock::factory()->create([
            'rotation_id' => $fifthRotation->id, 'department_id' => $departmentA->id,
            'from_week' => 1, 'to_week' => 2,
        ]);
        $fifthVersion = DistributionVersion::create([
            'rotation_id' => $fifthRotation->id, 'status' => 'published', 'is_current' => true,
        ]);
        $fifthStudent = Student::factory()->create(['academic_level' => 'fifth', 'batch_year' => 2026]);
        $fifthAssignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $fifthVersion->id, 'student_id' => $fifthStudent->id,
            'rotation_block_id' => $fifthBlock->id, 'training_site_id' => $site->id,
            'department_id' => $departmentA->id,
        ]);

        $this->actingAs($rta)->getJson('/api/v1/clinical-assessments/review-groups')
            ->assertOk()
            ->assertJsonCount(1, 'data.groups')
            ->assertJsonPath('data.groups.0.group_name', 'Q')
            ->assertJsonPath('data.groups.0.student_count', 3)
            ->assertJsonCount(2, 'data.groups.0.subgroups')
            ->assertJsonPath('data.groups.0.subgroups.0.student_count', 2);

        $this->actingAs($rta)->getJson('/api/v1/clinical-assessments/review-subgroup?assignment_id='.$assignments[0]->id)
            ->assertOk()
            ->assertJsonCount(2, 'data.weeks')
            ->assertJsonPath('data.weeks.0.number', 1)
            ->assertJsonPath('data.weeks.0.student_count', 2)
            ->assertJsonPath('data.weeks.0.ready_count', 1)
            ->assertJsonPath('data.weeks.0.students.0.assessments.0.status', 'submitted')
            ->assertJsonPath('data.weeks.1.number', 2)
            ->assertJsonPath('data.weeks.1.ready_count', 0);

        $this->actingAs($rta)->getJson('/api/v1/clinical-assessments/review-subgroup?assignment_id='.$fifthAssignment->id)
            ->assertNotFound();

        $rta->update(['assigned_levels' => null]);
        $this->actingAs($rta)->getJson('/api/v1/clinical-assessments/review-groups')
            ->assertOk()->assertJsonCount(0, 'data.groups');
    }
}
