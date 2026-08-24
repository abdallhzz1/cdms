<?php

namespace Tests\Feature\Phase3B1;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\AcademicYearSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;
use Database\Seeders\PermissionSeeder;

class RotationTest extends TestCase
{
    use RefreshDatabase;

    protected User $sysAdmin;
    protected AcademicYear $academicYear;

    protected function setUp(): void
    {
        parent::setUp();
        
        $this->seed([
            PermissionSeeder::class,
            Phase3PermissionSeeder::class,
            RoleSeeder::class,
            RolePermissionSeeder::class,
            AcademicYearSeeder::class,
        ]);

        $sysAdminRole = \App\Models\Role::where('code', 'SYS_ADMIN')->first();
        $sysAdminRole->permissions()->sync(\App\Models\Permission::pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->sysAdmin = User::factory()->create();
        $this->sysAdmin->roles()->attach($sysAdminRole);

        $this->academicYear = AcademicYear::first();
    }

    public function test_can_list_rotations()
    {
        Rotation::factory()->count(3)->create(['academic_year_id' => $this->academicYear->id]);

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->getJson('/api/v1/rotations');

        $response->assertStatus(200)
            ->assertJsonCount(3, 'data');
    }

    public function test_can_create_rotation_with_blocks_and_departments()
    {
        $dept1 = Department::factory()->create();
        $dept2 = Department::factory()->create();
        $site = TrainingSite::factory()->create();

        $payload = [
            'academic_year_id' => $this->academicYear->id,
            'code' => 'R-TEST-1',
            'name' => 'Test Rotation',
            'academic_level' => 'fifth',
            'duration_weeks' => 12,
            'departments' => [$dept1->id, $dept2->id],
            'blocks' => [
                [
                    'block_code' => 'B1',
                    'from_week' => 1,
                    'to_week' => 6,
                    'department_id' => $dept1->id
                ],
                [
                    'block_code' => 'B2',
                    'from_week' => 7,
                    'to_week' => 12,
                    'department_id' => $dept2->id
                ]
            ],
            'site_capacity_rules' => [
                ['site_id' => $site->id, 'max_students' => 18],
            ],
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->postJson('/api/v1/rotations', $payload);

        $response->assertStatus(201)
            ->assertJsonPath('data.code', 'R-TEST-1')
            ->assertJsonCount(2, 'data.departments')
            ->assertJsonCount(2, 'data.blocks')
            ->assertJsonCount(1, 'data.site_capacity_rules');

        $this->assertDatabaseHas('rotations', ['code' => 'R-TEST-1']);
        $this->assertDatabaseHas('rotation_blocks', ['block_code' => 'B1']);
        $this->assertDatabaseHas('department_rotation', ['department_id' => $dept1->id]);
        $this->assertDatabaseHas('site_capacity_rules', [
            'rotation_id' => $response->json('data.id'),
            'site_id' => $site->id,
            'max_students' => 18,
        ]);
    }

    public function test_setup_options_return_active_years_and_training_sites()
    {
        $activeSite = TrainingSite::factory()->create(['is_active' => true]);
        TrainingSite::factory()->create(['is_active' => false]);

        $this->actingAs($this->sysAdmin, 'web')
            ->getJson('/api/v1/rotations/setup-options')
            ->assertOk()
            ->assertJsonPath('data.academic_years.0.id', $this->academicYear->id)
            ->assertJsonPath('data.training_sites.0.id', $activeSite->id)
            ->assertJsonCount(1, 'data.training_sites');
    }

    public function test_rotation_code_must_be_unique_within_academic_year()
    {
        Rotation::factory()->create([
            'academic_year_id' => $this->academicYear->id,
            'code' => 'DUPLICATE',
        ]);

        $this->actingAs($this->sysAdmin, 'web')
            ->postJson('/api/v1/rotations', [
                'academic_year_id' => $this->academicYear->id,
                'code' => 'DUPLICATE',
                'name' => 'Duplicate rotation',
                'academic_level' => 'fourth',
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('code');
    }

    public function test_active_rotation_requires_non_overlapping_blocks_and_a_training_site()
    {
        $this->actingAs($this->sysAdmin, 'web')
            ->postJson('/api/v1/rotations', [
                'academic_year_id' => $this->academicYear->id,
                'code' => 'ACTIVE-INCOMPLETE',
                'name' => 'Incomplete active rotation',
                'academic_level' => 'fourth',
                'duration_weeks' => 6,
                'status' => 'active',
                'blocks' => [
                    ['block_code' => 'B1', 'from_week' => 1, 'to_week' => 4],
                    ['block_code' => 'B2', 'from_week' => 4, 'to_week' => 7],
                ],
            ])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['blocks', 'duration_weeks', 'site_capacity_rules']);
    }

    public function test_can_update_rotation()
    {
        $rotation = Rotation::factory()->create(['academic_year_id' => $this->academicYear->id]);
        $dept = Department::factory()->create();

        $payload = [
            'name' => 'Updated Name',
            'departments' => [$dept->id],
            'blocks' => [
                [
                    'block_code' => 'B-UPD',
                    'from_week' => 1,
                    'to_week' => 4,
                ]
            ]
        ];

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->putJson("/api/v1/rotations/{$rotation->id}", $payload);

        $response->assertStatus(200)
            ->assertJsonPath('data.name', 'Updated Name');

        $this->assertDatabaseHas('rotations', ['id' => $rotation->id, 'name' => 'Updated Name']);
        $this->assertDatabaseHas('rotation_blocks', ['block_code' => 'B-UPD']);
    }

    public function test_can_delete_rotation()
    {
        $rotation = Rotation::factory()->create(['academic_year_id' => $this->academicYear->id]);

        $response = $this->actingAs($this->sysAdmin, 'web')
            ->deleteJson("/api/v1/rotations/{$rotation->id}");

        $response->assertStatus(200);
        $this->assertDatabaseMissing('rotations', ['id' => $rotation->id]);
    }

    public function test_requires_permission()
    {
        $user = User::factory()->create(); // No permissions
        
        $response = $this->actingAs($user, 'web')
            ->getJson('/api/v1/rotations');

        $response->assertStatus(403);
    }
}
