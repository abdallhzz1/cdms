<?php

namespace Tests\Feature\Phase5D;

use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\SiteCapacityRule;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase5DTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private RotationBlock $block1;
    private RotationBlock $block2;
    private TrainingSite $site1;
    private TrainingSite $site2;
    private Department $department1;
    private Department $department2;
    private Person $supervisor1;
    private Student $student1;
    private Student $student2;
    private Student $student3;
    private StudentSubgroup $subgroup;
    private DistributionVersion $publishedVersion;
    private DistributionVersion $historicalVersion;
    private DistributionVersion $draftVersion;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->department1 = Department::factory()->create(['name_en' => 'Internal Medicine']);
        $this->department2 = Department::factory()->create(['name_en' => 'Surgery']);

        $this->rotation = Rotation::factory()->create([
            'academic_level' => 'fourth',
            'start_date' => '2026-09-01',
        ]);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department1->id,
            'from_week' => 1,
            'to_week' => 4,
        ]);

        $this->block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department2->id,
            'from_week' => 5,
            'to_week' => 8,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level' => $this->rotation->academic_level
        ]);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create(['full_name_en' => 'Student One', 'university_number' => '1001']);
        $this->student2 = Student::factory()->create(['full_name_en' => 'Student Two', 'university_number' => '1002']);
        $this->student3 = Student::factory()->create(['full_name_en' => 'Student Three', 'university_number' => '1003']);

        $this->site1 = TrainingSite::factory()->create(['name_en' => 'Hospital A']);
        $this->site2 = TrainingSite::factory()->create(['name_en' => 'Hospital B']);

        $this->supervisor1 = Person::factory()->create([
            'full_name_en' => 'Dr. Supervisor',
            'max_students' => 1,
            'is_active' => true,
        ]);

        $this->publishedVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published',
            'is_current' => true,
        ]);

        $this->historicalVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published',
            'is_current' => false,
        ]);

        $this->draftVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'draft',
            'is_current' => false,
        ]);

        // Current published assignments
        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->department1->id,
            'supervisor_id' => $this->supervisor1->id,
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $this->student2->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->department1->id,
            'supervisor_id' => $this->supervisor1->id,
        ]);

        // Different site, same dept
        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id' => $this->student3->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site2->id,
            'department_id' => $this->department1->id,
            'supervisor_id' => null,
        ]);

        // Historical assignment
        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->historicalVersion->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block2->id,
            'training_site_id' => $this->site2->id,
            'department_id' => $this->department2->id,
            'supervisor_id' => null,
        ]);
        
        // Capacity Rule for site1 (limit 2 - which means it's FULL with 2 students)
        SiteCapacityRule::create([
            'site_id' => $this->site1->id,
            'rotation_id' => $this->rotation->id,
            'max_students' => 2,
        ]);
        
        // site2 has no capacity rule (NO_RULE)
    }

    public function test_authorized_user_can_view_department_roster()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', $this->department1));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 3);
    }

    public function test_unauthorized_user_cannot_view_department_roster()
    {
        $response = $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.departments.current-distribution.roster', $this->department1));

        $response->assertStatus(403);
    }

    public function test_authorized_user_can_view_training_site_roster()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.roster', $this->site1));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 2);
    }

    public function test_unauthorized_user_cannot_view_training_site_roster()
    {
        $response = $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.training-sites.current-distribution.roster', $this->site1));

        $response->assertStatus(403);
    }

    public function test_current_published_version_is_used()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', $this->department1));

        $response->assertStatus(200);
        $this->assertCount(3, $response->json('data.data'));
        
        // All should belong to publishedVersion
        foreach ($response->json('data.data') as $item) {
            $this->assertEquals($this->publishedVersion->id, $item['distribution_version_id']);
        }
    }

    public function test_historical_published_versions_are_excluded()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', $this->department2));

        // Department 2 only has assignments in the historical version
        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 0);
    }

    public function test_department_filter_works_on_site_roster()
    {
        // Site 1 only has assignments in department 1
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.roster', [
                'trainingSite' => $this->site1->id,
                'department_id' => $this->department1->id
            ]));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 2);

        $responseEmpty = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.roster', [
                'trainingSite' => $this->site1->id,
                'department_id' => $this->department2->id
            ]));
            
        $responseEmpty->assertStatus(200);
        $responseEmpty->assertJsonPath('data.total', 0);
    }

    public function test_training_site_filter_works_on_department_roster()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', [
                'department' => $this->department1->id,
                'training_site_id' => $this->site1->id
            ]));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 2); // Student 1 and 2
    }

    public function test_supervisor_filter_works()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', [
                'department' => $this->department1->id,
                'supervisor_id' => $this->supervisor1->id
            ]));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 2); 
    }

    public function test_student_search_works()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', [
                'department' => $this->department1->id,
                'search' => '1001' // University number
            ]));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 1);
        $response->assertJsonPath('data.data.0.student.university_number', '1001');
    }

    public function test_pagination_works()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', [
                'department' => $this->department1->id,
                'per_page' => 2
            ]));

        $response->assertStatus(200);
        $response->assertJsonPath('data.per_page', 2);
        $response->assertJsonPath('data.total', 3);
        $this->assertCount(2, $response->json('data.data'));
    }

    public function test_capacity_utilization_is_correct()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.summary', $this->site1));

        $response->assertStatus(200);
        
        $capacity = $response->json('data.capacity_by_rotation.0');
        $this->assertEquals(2, $capacity['capacity_limit']);
        $this->assertEquals(2, $capacity['assigned_count']);
        $this->assertEquals(0, $capacity['available_capacity']);
        $this->assertEquals(100, $capacity['utilization_percentage']);
        $this->assertEquals('FULL', $capacity['utilization_status']);
        $this->assertFalse($capacity['over_capacity']);
    }

    public function test_over_capacity_works()
    {
        // Move student 3 to site 1 to make it over capacity
        StudentClinicalAssignment::where('student_id', $this->student3->id)
            ->where('distribution_version_id', $this->publishedVersion->id)
            ->update([
                'training_site_id' => $this->site1->id,
            ]);

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.summary', $this->site1));

        $response->assertStatus(200);
        
        $capacity = $response->json('data.capacity_by_rotation.0');
        $this->assertEquals(2, $capacity['capacity_limit']);
        $this->assertEquals(3, $capacity['assigned_count']);
        $this->assertEquals(-1, $capacity['available_capacity']);
        $this->assertEquals(150, $capacity['utilization_percentage']);
        $this->assertEquals('OVER_CAPACITY', $capacity['utilization_status']);
        $this->assertTrue($capacity['over_capacity']);
        
        // Summary aggregate
        $this->assertTrue($response->json('data.summary.has_over_capacity'));
    }

    public function test_missing_capacity_rule_returns_no_rule()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.summary', $this->site2));

        $response->assertStatus(200);
        
        $capacity = $response->json('data.capacity_by_rotation.0');
        $this->assertNull($capacity['capacity_limit']);
        $this->assertEquals(1, $capacity['assigned_count']);
        $this->assertEquals('NO_RULE', $capacity['utilization_status']);
        $this->assertFalse($capacity['over_capacity']);
    }

    public function test_supervisor_workload_information_is_correct()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.summary', $this->department1));

        $response->assertStatus(200);
        
        $workloads = $response->json('data.supervisor_workload');
        $this->assertCount(1, $workloads);
        $this->assertEquals($this->supervisor1->id, $workloads[0]['supervisor_id']);
        $this->assertEquals(2, $workloads[0]['assigned_count']);
        $this->assertEquals(1, $workloads[0]['max_students']);
        // Overage triggers a soft warning
        $this->assertTrue($workloads[0]['workload_warning']);
    }

    public function test_empty_department_returns_200_with_empty_roster()
    {
        $emptyDept = Department::factory()->create();
        
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', $emptyDept));

        $response->assertStatus(200);
        $response->assertJsonPath('data.total', 0);
        
        $summaryResponse = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.summary', $emptyDept));
            
        $summaryResponse->assertStatus(200);
        $summaryResponse->assertJsonPath('data.summary.total_assigned_students', 0);
        $summaryResponse->assertJsonPath('data.no_current_distribution', true);
    }

    public function test_invalid_department_returns_404()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', 9999));

        $response->assertStatus(404);
    }

    public function test_no_n_plus_one_regression_on_department_roster()
    {
        DB::enableQueryLog();

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.departments.current-distribution.roster', $this->department1));

        $queryCount = count(DB::getQueryLog());
        
        $response->assertStatus(200);
        $this->assertLessThanOrEqual(15, $queryCount, "N+1 query regression detected. Queries: {$queryCount}");
        
        DB::disableQueryLog();
    }
    
    public function test_no_n_plus_one_regression_on_training_site_summary()
    {
        DB::enableQueryLog();

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.training-sites.current-distribution.summary', $this->site1));

        $queryCount = count(DB::getQueryLog());
        
        $response->assertStatus(200);
        $this->assertLessThanOrEqual(15, $queryCount, "N+1 query regression detected in summary. Queries: {$queryCount}");
        
        DB::disableQueryLog();
    }
}
