<?php

namespace Tests\Feature\Phase5B;

use App\Models\Department;
use App\Models\DistributionVersion;
use App\Models\Person;
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

class Phase5BTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private RotationBlock $block1;
    private RotationBlock $block2;
    private TrainingSite $site1;
    private Department $department1;
    private Person $supervisor1;
    private Student $student1;
    private Student $student2;
    private StudentSubgroup $subgroup;
    private DistributionVersion $publishedVersion;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $adminRole = \App\Models\Role::create(['code' => 'TEST_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.view',
            'clinical_schedule.view',
            'distribution.create',
            'distribution.update',
            'distribution.approve',
            'distribution.publish',
            'distribution.override'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->department1 = Department::factory()->create([
            'name_en' => 'Internal Medicine',
            'name_ar' => 'الطب الباطني',
        ]);

        $this->rotation = Rotation::factory()->create([
            'name' => 'Internal Medicine Rotation',
            'start_date' => '2026-09-01',
            'end_date' => '2026-10-30',
            'duration_weeks' => 8
        ]);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'block_code' => 'BLOCK_1',
            'from_week' => 1,
            'to_week' => 4,
            'department_id' => $this->department1->id,
        ]);

        $this->block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'block_code' => 'BLOCK_2',
            'from_week' => 5,
            'to_week' => 8,
            'department_id' => $this->department1->id,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level' => $this->rotation->academic_level
        ]);
        $this->subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id, 'is_active' => true]);

        $this->student1 = Student::factory()->create([
            'full_name_ar' => 'أحمد علي',
            'full_name_en' => 'Ahmad Ali',
            'university_number' => '20260001',
            'academic_year_id' => $this->rotation->academic_year_id,
            'registration_status' => 'active'
        ]);

        $this->student2 = Student::factory()->create([
            'full_name_ar' => 'بلال زيد',
            'full_name_en' => 'Bilal Zaid',
            'university_number' => '20260002',
            'academic_year_id' => $this->rotation->academic_year_id,
            'registration_status' => 'active'
        ]);

        $this->site1 = TrainingSite::factory()->create([
            'name_en' => 'Al-Ahli Hospital',
            'name_ar' => 'مستشفى الأهلي',
        ]);

        $this->supervisor1 = Person::factory()->create([
            'full_name_ar' => 'د. عمر كحلوت',
            'full_name_en' => 'Dr. Omar Kahlout',
            'department_id' => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active' => true,
        ]);

        // Create Current Published Version
        $this->publishedVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published',
            'is_current' => true,
        ]);

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
            'rotation_block_id' => $this->block2->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->department1->id,
            'supervisor_id' => $this->supervisor1->id,
        ]);
    }

    public function test_unauthenticated_and_unauthorized_users_rejected()
    {
        $this->getJson(route('api.v1.operational.clinical-schedule'))
            ->assertStatus(401);

        $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.operational.clinical-schedule'))
            ->assertStatus(403);
    }

    public function test_authorized_user_can_retrieve_administrative_schedule()
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.clinical-schedule'));

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data.data');

        // Check date calculations
        // Block 1: 2026-09-01 -> 2026-09-28
        $item1 = $response->json('data.data.0');
        $this->assertEquals('2026-09-01', $item1['block']['start_date']);
        $this->assertEquals('2026-09-28', $item1['block']['end_date']);

        // Block 2: 2026-09-29 -> 2026-10-26
        $item2 = $response->json('data.data.1');
        $this->assertEquals('2026-09-29', $item2['block']['start_date']);
        $this->assertEquals('2026-10-26', $item2['block']['end_date']);
    }

    public function test_historical_and_unpublished_versions_are_excluded()
    {
        // Old superseded published version
        $oldVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'published',
            'is_current' => false,
        ]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $oldVersion->id,
            'student_id' => $this->student1->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
        ]);

        // Draft version
        $draftVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status' => 'draft',
            'is_current' => false,
        ]);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $draftVersion->id,
            'student_id' => $this->student2->id,
            'rotation_block_id' => $this->block2->id,
            'training_site_id' => $this->site1->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.clinical-schedule'));

        $response->assertStatus(200);
        $response->assertJsonCount(2, 'data.data'); // Only the 2 current published items
    }

    public function test_filtering_by_rotation_and_block()
    {
        // Filter by block1
        $resBlock1 = $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule', ['rotation_block_id' => $this->block1->id])
        );
        $resBlock1->assertStatus(200);
        $resBlock1->assertJsonCount(1, 'data.data');
        $this->assertEquals($this->student1->id, $resBlock1->json('data.data.0.student.id'));

        // Filter by rotation_id
        $resRot = $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule', ['rotation_id' => $this->rotation->id])
        );
        $resRot->assertStatus(200);
        $resRot->assertJsonCount(2, 'data.data');
    }

    public function test_search_filter()
    {
        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule', ['search' => 'Ahmad'])
        );
        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data.data');
        $this->assertEquals('Ahmad Ali', $res->json('data.data.0.student.full_name_en'));

        $resNum = $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule', ['search' => '20260002'])
        );
        $resNum->assertStatus(200);
        $resNum->assertJsonCount(1, 'data.data');
        $this->assertEquals('Bilal Zaid', $resNum->json('data.data.0.student.full_name_en'));
    }

    public function test_pagination()
    {
        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule', ['per_page' => 1, 'page' => 1])
        );
        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data.data');
        $this->assertEquals(2, $res->json('data.total'));
        $this->assertEquals(1, $res->json('data.current_page'));
    }

    public function test_student_schedule_endpoint_returns_dtos_with_calculated_dates()
    {
        $res = $this->actingAs($this->admin)->getJson(
            route('api.v1.students.current-clinical-schedule', $this->student1->id)
        );

        $res->assertStatus(200);
        $res->assertJsonCount(1, 'data');
        $this->assertEquals('2026-09-01', $res->json('data.0.block.start_date'));
        $this->assertEquals('2026-09-28', $res->json('data.0.block.end_date'));
    }

    public function test_no_n_plus_one_queries_regression()
    {
        DB::enableQueryLog();

        $this->actingAs($this->admin)->getJson(
            route('api.v1.operational.clinical-schedule')
        )->assertStatus(200);

        $queryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(12, $queryCount);
    }
}
