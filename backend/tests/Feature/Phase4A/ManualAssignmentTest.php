<?php

namespace Tests\Feature\Phase4A;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ManualAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private User $overrideAdmin;
    private DistributionVersion $suggestedVersion;
    private DistributionVersion $publishedVersion;
    private Student $student1;
    private Student $student2;
    private RotationBlock $block1;
    private TrainingSite $site1;
    private TrainingSite $site2;
    private StudentClinicalAssignment $assignment1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'test', 'name_ar' => 'Test', 'name_en' => 'Test']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.delete'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->sync($adminRole);

        $overrideRole = \App\Models\Role::create(['code' => 'TEST_OVERRIDE', 'name_key' => 'override', 'name_ar' => 'Override', 'name_en' => 'Override']);
        $overrideRole->permissions()->attach(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.override'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->overrideAdmin = User::factory()->create();
        $this->overrideAdmin->roles()->attach($overrideRole);

        $this->unauthorized = User::factory()->create();

        $rotation = Rotation::factory()->create();
        $this->block1 = RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $rotation->academic_year_id,
            'academic_level' => $rotation->academic_level
        ]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id' => $rotation->academic_year_id
        ]);

        $this->student2 = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id' => $rotation->academic_year_id
        ]);

        $this->site1 = TrainingSite::factory()->create();
        $this->site2 = TrainingSite::factory()->create();

        $rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 1
        ]);
        
        $rotation->siteCapacityRules()->create([
            'site_id' => $this->site2->id,
            'max_students' => 5
        ]);

        $this->suggestedVersion = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested'
        ]);

        $this->publishedVersion = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published'
        ]);

        $this->assignment1 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->suggestedVersion->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    public function test_authorized_user_can_list_assignments()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.distribution-versions.assignments.index', $this->suggestedVersion->id));

        $response->assertStatus(200);
        $response->assertJsonCount(1, 'data.data');
        $this->assertEquals($this->assignment1->id, $response->json('data.data.0.id'));
    }

    public function test_unauthorized_user_cannot_list()
    {
        $response = $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.distribution-versions.assignments.index', $this->suggestedVersion->id));

        $response->assertStatus(403);
    }

    public function test_authorized_user_can_create_assignment_which_audits_and_changes_status()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student2->id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(201);
        $this->assertDatabaseHas('student_clinical_assignments', [
            'student_id' => $this->student2->id,
            'training_site_id' => $this->site2->id
        ]);
        
        $this->assertEquals('manual', $this->suggestedVersion->fresh()->status);

        $this->assertDatabaseHas('audit_logs', [
            'action' => 'assignment.created',
            'user_id' => $this->admin->id,
            'student_id' => $this->student2->id
        ]);
    }

    public function test_published_version_strictly_rejects_create()
    {
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->publishedVersion->id),
            [
                'student_id' => $this->student2->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('version');
    }

    public function test_duplicate_assignment_prevented()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student1->id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('assignment');
    }

    public function test_capacity_violation_returns_structured_errors()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        // Site 1 has max_students = 1. student1 is already there. adding student2 should fail.
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student2->id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site1->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('hard_constraints');
    }

    public function test_override_without_reason_or_permission_rejected()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student2->id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site1->id,
                'force' => true
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('override_reason');
    }

    public function test_override_with_permission_and_reason_succeeds()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        $response = $this->actingAs($this->overrideAdmin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student2->id,
                'student_subgroup_id' => $subgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site1->id,
                'force' => true,
                'override_reason' => 'Emergency placement by Dean.'
            ]
        );

        $response->assertStatus(201);
        $this->assertDatabaseHas('student_clinical_assignments', [
            'student_id' => $this->student2->id,
            'training_site_id' => $this->site1->id
        ]);

        $this->assertDatabaseHas('audit_logs', [
            'is_override' => true,
            'override_reason' => 'Emergency placement by Dean.'
        ]);
    }

    public function test_authorized_user_can_update_assignment()
    {
        $response = $this->actingAs($this->admin)->putJson(
            route('api.v1.distribution-versions.assignments.update', [$this->suggestedVersion->id, $this->assignment1->id]),
            [
                'training_site_id' => $this->site2->id
            ]
        );

        $response->assertStatus(200);
        $this->assertEquals($this->site2->id, $this->assignment1->fresh()->training_site_id);
    }

    public function test_authorized_user_can_delete_assignment()
    {
        $response = $this->actingAs($this->admin)->deleteJson(
            route('api.v1.distribution-versions.assignments.destroy', [$this->suggestedVersion->id, $this->assignment1->id])
        );

        $response->assertStatus(200);
        $this->assertDatabaseMissing('student_clinical_assignments', ['id' => $this->assignment1->id]);
        
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'assignment.deleted'
        ]);
    }

    public function test_no_n_plus_one_queries()
    {
        // 5 students
        for ($i = 0; $i < 5; $i++) {
            $student = Student::factory()->create(['academic_year_id' => $this->suggestedVersion->rotation->academic_year_id]);
            StudentClinicalAssignment::create([
                'distribution_version_id' => $this->suggestedVersion->id,
                'student_id' => $student->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]);
        }

        DB::enableQueryLog();

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.distribution-versions.assignments.index', $this->suggestedVersion->id));

        $response->assertStatus(200);
        
        $queryCount = count(DB::getQueryLog());
        $this->assertLessThan(10, $queryCount); // Should be very few queries due to eager loading
    }
    public function test_student_does_not_belong_to_supplied_subgroup()
    {
        $wrongSubgroup = StudentSubgroup::factory()->create(['is_active' => true]);

        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $this->student2->id,
                'student_subgroup_id' => $wrongSubgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('student_subgroup_id');
    }

    public function test_student_has_no_subgroup_for_rotation_academic_year()
    {
        $student3 = Student::factory()->create(['academic_year_id' => $this->suggestedVersion->rotation->academic_year_id]);
        
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $student3->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('student_subgroup_id');
    }

    public function test_student_has_subgroup_from_another_academic_year()
    {
        $anotherRotation = Rotation::factory()->create();
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $anotherRotation->academic_year_id,
            'academic_level' => $anotherRotation->academic_level
        ]);
        $anotherSubgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $student = Student::factory()->create(['academic_year_id' => $anotherRotation->academic_year_id]);
        \App\Models\StudentGroupAssignment::factory()->create([
            'student_id' => $student->id,
            'student_subgroup_id' => $anotherSubgroup->id,
            'academic_year_id' => $anotherRotation->academic_year_id
        ]);
        
        $response = $this->actingAs($this->admin)->postJson(
            route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
            [
                'student_id' => $student->id,
                'student_subgroup_id' => $anotherSubgroup->id,
                'rotation_block_id' => $this->block1->id,
                'training_site_id' => $this->site2->id,
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('student_subgroup_id');
    }

    public function test_cross_version_assignment_update_rejected()
    {
        $anotherVersion = DistributionVersion::create([
            'rotation_id' => $this->suggestedVersion->rotation_id,
            'status' => 'suggested'
        ]);

        $response = $this->actingAs($this->admin)->putJson(
            route('api.v1.distribution-versions.assignments.update', [$anotherVersion->id, $this->assignment1->id]),
            [
                'training_site_id' => $this->site2->id
            ]
        );

        $response->assertStatus(404); // due to scopeBindings
    }

    public function test_cross_version_assignment_delete_rejected()
    {
        $anotherVersion = DistributionVersion::create([
            'rotation_id' => $this->suggestedVersion->rotation_id,
            'status' => 'suggested'
        ]);

        $response = $this->actingAs($this->admin)->deleteJson(
            route('api.v1.distribution-versions.assignments.destroy', [$anotherVersion->id, $this->assignment1->id])
        );

        $response->assertStatus(404); // due to scopeBindings
    }

    public function test_published_version_strictly_rejects_update()
    {
        $assignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => \App\Models\StudentSubgroup::first()->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);

        $response = $this->actingAs($this->admin)->putJson(
            route('api.v1.distribution-versions.assignments.update', [$this->publishedVersion->id, $assignment->id]),
            [
                'training_site_id' => $this->site2->id
            ]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('version');
    }

    public function test_published_version_strictly_rejects_delete()
    {
        $assignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => \App\Models\StudentSubgroup::first()->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);

        $response = $this->actingAs($this->admin)->deleteJson(
            route('api.v1.distribution-versions.assignments.destroy', [$this->publishedVersion->id, $assignment->id])
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('version');
    }

    public function test_manual_assignment_performance_does_not_exhibit_n_plus_one()
    {
        $subgroup = \App\Models\StudentSubgroup::first();
        
        // Helper to run the test for a given number of existing assignments
        $runPerformanceTest = function ($existingCount) use ($subgroup) {
            // Clean up existing assignments
            StudentClinicalAssignment::query()->delete();
            
            // Create $existingCount assignments
            for ($i = 0; $i < $existingCount; $i++) {
                $student = Student::factory()->create(['academic_year_id' => $this->suggestedVersion->rotation->academic_year_id]);
                \App\Models\StudentGroupAssignment::factory()->create([
                    'student_id' => $student->id,
                    'student_subgroup_id' => $subgroup->id,
                    'academic_year_id' => $this->suggestedVersion->rotation->academic_year_id
                ]);
                StudentClinicalAssignment::create([
                    'distribution_version_id' => $this->suggestedVersion->id,
                    'student_id' => $student->id,
                    'student_subgroup_id' => $subgroup->id,
                    'rotation_block_id' => $this->block1->id,
                    'training_site_id' => $this->site2->id,
                    'department_id' => $this->block1->department_id,
                ]);
            }

            $newStudent = Student::factory()->create(['academic_year_id' => $this->suggestedVersion->rotation->academic_year_id]);
            \App\Models\StudentGroupAssignment::factory()->create([
                'student_id' => $newStudent->id,
                'student_subgroup_id' => $subgroup->id,
                'academic_year_id' => $this->suggestedVersion->rotation->academic_year_id
            ]);

            DB::flushQueryLog();
            DB::enableQueryLog();

            $response = $this->actingAs($this->overrideAdmin)->postJson(
                route('api.v1.distribution-versions.assignments.store', $this->suggestedVersion->id),
                [
                    'student_id' => $newStudent->id,
                    'student_subgroup_id' => $subgroup->id,
                    'rotation_block_id' => $this->block1->id,
                    'training_site_id' => $this->site2->id,
                    'force' => true,
                    'override_reason' => 'perf test'
                ]
            );

            $response->assertStatus(201);
            
            $queryCount = count(DB::getQueryLog());
            DB::disableQueryLog();
            
            return $queryCount;
        };

        // We run for 1, 5, 20
        $queriesFor1 = $runPerformanceTest(1);
        $queriesFor5 = $runPerformanceTest(5);
        $queriesFor20 = $runPerformanceTest(20);

        // Assert query count is bounded and does not grow linearly
        // O(1) queries expected for validation, meaning 5 and 20 should be very close to 1
        $this->assertLessThanOrEqual($queriesFor1 + 2, $queriesFor5);
        $this->assertLessThanOrEqual($queriesFor1 + 2, $queriesFor20);
    }
}
