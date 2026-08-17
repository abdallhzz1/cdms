<?php

namespace Tests\Feature\Phase6B;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentGroupAssignment;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase6BTest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;
    private User $unauthorizedUser;
    private Rotation $rotation;
    private RotationBlock $block;
    private Department $department;
    private TrainingSite $site;
    private Person $supervisor;
    private Student $student;
    private DistributionVersion $currentPublishedVersion;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class
        ]);

        $viewerRole = Role::create([
            'code' => 'P6B_VIEWER',
            'name_key' => 'viewer',
            'name_ar' => 'Viewer',
            'name_en' => 'Viewer'
        ]);
        $viewerRole->permissions()->attach(\App\Models\Permission::where('code', 'distribution.view')->first()->id, ['scope_type' => 'global']);

        $this->viewer = User::factory()->create();
        $this->viewer->roles()->attach($viewerRole);

        $this->unauthorizedUser = User::factory()->create();

        // Setup domain structure
        $academicYear = AcademicYear::factory()->create();
        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level'   => 'fourth'
        ]);

        $this->department = Department::factory()->create(['name_en' => 'Pediatrics']);
        $this->site = TrainingSite::factory()->create(['name_en' => 'Central Clinic']);

        $this->block = RotationBlock::factory()->create([
            'rotation_id'   => $this->rotation->id,
            'department_id' => $this->department->id,
            'from_week'     => 1,
            'to_week'       => 4,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level'   => 'fourth'
        ]);
        $subgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'is_active'        => true
        ]);

        $this->student = Student::factory()->create(['registration_status' => 'active']);
        StudentGroupAssignment::create([
            'student_id'          => $this->student->id,
            'student_group_id'    => $group->id,
            'student_subgroup_id' => $subgroup->id,
            'academic_year_id'    => $academicYear->id
        ]);

        $this->supervisor = Person::factory()->create(['max_students' => 2, 'is_active' => true]);

        SiteCapacityRule::create([
            'site_id'      => $this->site->id,
            'rotation_id'  => $this->rotation->id,
            'max_students' => 10
        ]);

        // Current Published Distribution Version
        $this->currentPublishedVersion = DistributionVersion::create([
            'rotation_id'    => $this->rotation->id,
            'version_number' => 1,
            'status'         => 'published',
            'is_current'     => true,
            'created_by'     => $this->viewer->id
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->currentPublishedVersion->id,
            'student_id'              => $this->student->id,
            'student_subgroup_id'     => $subgroup->id,
            'rotation_block_id'       => $this->block->id,
            'department_id'           => $this->department->id,
            'training_site_id'        => $this->site->id,
            'supervisor_id'           => $this->supervisor->id
        ]);
    }

    public function test_unauthenticated_user_cannot_access_dashboard()
    {
        $this->getJson('/api/v1/operational/dashboard/summary')->assertStatus(401);
    }

    public function test_unauthorized_user_cannot_access_dashboard()
    {
        $this->actingAs($this->unauthorizedUser)
            ->getJson('/api/v1/operational/dashboard/summary')
            ->assertStatus(403);
    }

    public function test_authorized_user_can_access_dashboard_summary()
    {
        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'success',
                'data' => [
                    'student_coverage' => [
                        'total_active_students',
                        'assigned_students',
                        'unassigned_students',
                        'coverage_percentage',
                    ],
                    'distribution_overview' => [
                        'active_rotations_count',
                        'active_blocks_count',
                        'total_placements_count',
                        'published_at',
                    ],
                    'alerts' => [
                        'unassigned_students_count',
                        'sites_near_capacity_count',
                        'sites_over_capacity_count',
                        'unsupervised_assignments_count',
                        'inactive_supervisor_assignments_count',
                    ],
                    'department_distribution',
                    'site_capacity_utilization',
                    'supervisor_workload_summary',
                ]
            ]);
    }

    public function test_dashboard_exclusively_uses_current_published_distribution()
    {
        // Add a draft version for another student
        $draftVersion = DistributionVersion::create([
            'rotation_id'    => $this->rotation->id,
            'version_number' => 2,
            'status'         => 'suggested',
            'is_current'     => false,
            'created_by'     => $this->viewer->id
        ]);

        $student2 = Student::factory()->create(['registration_status' => 'active']);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $draftVersion->id,
            'student_id'              => $student2->id,
            'rotation_block_id'       => $this->block->id,
            'department_id'           => $this->department->id,
            'training_site_id'        => $this->site->id,
            'supervisor_id'           => $this->supervisor->id
        ]);

        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $response->assertStatus(200);

        // Placements count must be 1 (current version only), ignoring draft assignment for student2
        $this->assertEquals(1, $response->json('data.distribution_overview.total_placements_count'));
    }

    public function test_dashboard_excludes_suggested_manual_and_historical_versions()
    {
        // Historical superseded version
        $oldVersion = DistributionVersion::create([
            'rotation_id'    => $this->rotation->id,
            'version_number' => 0,
            'status'         => 'published',
            'is_current'     => false,
            'created_by'     => $this->viewer->id
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $oldVersion->id,
            'student_id'              => $this->student->id,
            'rotation_block_id'       => $this->block->id,
            'department_id'           => $this->department->id,
            'training_site_id'        => $this->site->id,
            'supervisor_id'           => $this->supervisor->id
        ]);

        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $response->assertStatus(200);
        $this->assertEquals(1, $response->json('data.distribution_overview.total_placements_count'));
    }

    public function test_site_capacity_utilization_thresholds()
    {
        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $response->assertStatus(200);
        $siteUtil = $response->json('data.site_capacity_utilization.0');

        $this->assertEquals(10, $siteUtil['capacity_limit']);
        $this->assertEquals(1, $siteUtil['assigned_count']);
        $this->assertEquals(10.0, $siteUtil['utilization_percentage']);
        $this->assertEquals('AVAILABLE', $siteUtil['status']);
    }

    public function test_supervisor_workload_warnings()
    {
        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $response->assertStatus(200);
        $supWorkload = $response->json('data.supervisor_workload_summary.0');

        $this->assertEquals(1, $supWorkload['assigned_count']);
        $this->assertEquals(2, $supWorkload['max_students']);
        $this->assertFalse($supWorkload['workload_warning']);
    }

    public function test_invalid_filters_return_422()
    {
        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary?rotation_id=99999');

        $response->assertStatus(422)
            ->assertJson([
                'success' => false,
                'message' => 'The given data was invalid.'
            ]);
    }

    public function test_dashboard_query_count_does_not_exceed_limit()
    {
        DB::enableQueryLog();

        $response = $this->actingAs($this->viewer)
            ->getJson('/api/v1/operational/dashboard/summary');

        $queryCount = count(DB::getQueryLog());
        DB::disableQueryLog();

        $response->assertStatus(200);

        // Performance Assertion: <= 15 queries per dashboard request
        $this->assertLessThanOrEqual(15, $queryCount, "Dashboard query count was {$queryCount}, expected <= 15");
    }
}
