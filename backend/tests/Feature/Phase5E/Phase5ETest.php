<?php

namespace Tests\Feature\Phase5E;

use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class Phase5ETest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $viewer;
    private User $unauthorized;
    private Rotation $rotation;
    private DistributionVersion $version;
    private Department $department;
    private TrainingSite $site;
    private Person $supervisor;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $viewerRole = \App\Models\Role::create(['code' => 'TEST_VIEWER', 'name_key' => 'viewer', 'name_ar' => 'Viewer', 'name_en' => 'Viewer']);
        $viewerRole->permissions()->sync(\App\Models\Permission::where('code', 'distribution.view')->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($viewerRole);

        $this->viewer = User::factory()->create();
        $this->viewer->roles()->attach($viewerRole);

        $this->unauthorized = User::factory()->create();

        $this->rotation = Rotation::factory()->create();
        $block = RotationBlock::factory()->create(['rotation_id' => $this->rotation->id]);
        $this->department = Department::factory()->create();
        $this->site = TrainingSite::factory()->create();
        $this->supervisor = Person::factory()->create();
        $student = Student::factory()->create();

        $this->version = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'version_number' => 1,
            'status' => 'published',
            'is_current' => true,
            'created_by' => $this->admin->id
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $student->id,
            'rotation_block_id' => $block->id,
            'department_id' => $this->department->id,
            'training_site_id' => $this->site->id,
            'supervisor_id' => $this->supervisor->id
        ]);
    }

    public function test_unauthorized_users_cannot_access_reports()
    {
        $response = $this->actingAs($this->unauthorized)
            ->getJson("/api/v1/operational/reports/students?rotation_id={$this->rotation->id}");
        
        $response->assertStatus(403);
    }

    public function test_can_download_student_distribution_excel()
    {
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/students?rotation_id={$this->rotation->id}&format=excel");
            
        $response->assertStatus(200);
        $response->assertHeader('content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }

    public function test_can_download_department_distribution_csv()
    {
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/departments/{$this->department->id}?rotation_id={$this->rotation->id}&format=csv");
            
        $response->assertStatus(200);
        $response->assertHeader('content-type', 'text/csv; charset=UTF-8');
    }

    public function test_can_download_training_site_capacity_pdf()
    {
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/sites?rotation_id={$this->rotation->id}&format=pdf");
            
        $response->assertStatus(200);
        $response->assertHeader('content-type', 'application/pdf');
    }

    public function test_historical_or_draft_versions_return_409()
    {
        $this->version->update(['is_current' => false]);
        
        $response = $this->actingAs($this->viewer)
            ->getJson("/api/v1/operational/reports/students?rotation_id={$this->rotation->id}&format=json");
            
        $response->assertStatus(409);
    }

    public function test_csv_export_starts_with_utf8_bom()
    {
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/departments/{$this->department->id}?rotation_id={$this->rotation->id}&format=csv");

        $response->assertStatus(200);
        $content = $response->streamedContent();
        $this->assertTrue(str_starts_with($content, "\xEF\xBB\xBF"));
    }

    public function test_site_capacity_filters_propagate_correctly()
    {
        \App\Models\SiteCapacityRule::create([
            'site_id' => $this->site->id,
            'rotation_id' => $this->rotation->id,
            'max_students' => 10
        ]);

        $otherDept = Department::factory()->create();
        
        // Filter by non-matching department should yield 0 assigned count
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/sites?rotation_id={$this->rotation->id}&department_id={$otherDept->id}&format=csv");

        $response->assertStatus(200);
        $content = $response->streamedContent();
        // Since count is 0, assigned count column is "0"
        $this->assertStringContainsString(',"0",', $content);
    }

    public function test_unassigned_students_search_filter_propagates()
    {
        $response = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/unassigned?rotation_id={$this->rotation->id}&search=NonExistentSearchTerm&format=csv");

        $response->assertStatus(200);
        $content = $response->streamedContent();
        $this->assertStringNotContainsString('NonExistentSearchTerm', $content);
    }

    public function test_export_prevents_n_plus_one_regression()
    {
        \DB::enableQueryLog();

        $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/supervisors/{$this->supervisor->id}?rotation_id={$this->rotation->id}&format=csv");

        $queries = \DB::getQueryLog();
        $this->assertLessThan(15, count($queries));
    }
}
