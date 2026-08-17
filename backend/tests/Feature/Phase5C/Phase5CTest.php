<?php

namespace Tests\Feature\Phase5C;

use App\Models\AuditLog;
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
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase5CTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $unauthorized;
    private Rotation $rotation;
    private RotationBlock $block1;
    private Department $department1;
    private TrainingSite $site1;
    private Person $supervisor1;
    private Person $supervisor2;
    private Student $student1;
    private Student $student2;
    private StudentSubgroup $subgroup;
    private DistributionVersion $publishedVersion;
    private StudentClinicalAssignment $assignment1;
    private StudentClinicalAssignment $assignment2;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class,
        ]);

        $adminRole = Role::create([
            'code'     => 'TEST_ADMIN_5C',
            'name_key' => 'admin',
            'name_ar'  => 'Admin',
            'name_en'  => 'Admin',
        ]);
        $adminRole->permissions()->attach(Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.approve',
            'distribution.publish',
            'distribution.override',
        ])->pluck('id'), ['scope_type' => 'global']);

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->unauthorized = User::factory()->create();

        $this->department1 = Department::factory()->create([
            'name_en' => 'Surgery',
            'name_ar' => 'الجراحة',
        ]);

        $this->rotation = Rotation::factory()->create([
            'name'           => 'Surgery Rotation',
            'start_date'     => '2026-09-01',
            'end_date'       => '2026-10-30',
            'duration_weeks' => 8,
        ]);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id'   => $this->rotation->id,
            'block_code'    => 'SURG_1',
            'from_week'     => 1,
            'to_week'       => 4,
            'department_id' => $this->department1->id,
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level'   => $this->rotation->academic_level,
        ]);
        $this->subgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'is_active'        => true,
        ]);

        $this->student1 = Student::factory()->create([
            'full_name_ar'      => 'أحمد علي',
            'full_name_en'      => 'Ahmad Ali',
            'university_number' => '20260001',
            'academic_year_id'  => $this->rotation->academic_year_id,
            'registration_status' => 'active',
        ]);

        $this->student2 = Student::factory()->create([
            'full_name_ar'      => 'بلال زيد',
            'full_name_en'      => 'Bilal Zaid',
            'university_number' => '20260002',
            'academic_year_id'  => $this->rotation->academic_year_id,
            'registration_status' => 'active',
        ]);

        $this->site1 = TrainingSite::factory()->create([
            'name_en' => 'Al-Ahli Hospital',
            'name_ar' => 'مستشفى الأهلي',
        ]);

        $this->supervisor1 = Person::factory()->create([
            'full_name_ar'   => 'د. عمر كحلوت',
            'full_name_en'   => 'Dr. Omar Kahlout',
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active'      => true,
            'max_students'   => 10,
        ]);

        $this->supervisor2 = Person::factory()->create([
            'full_name_ar'   => 'د. سامي حسن',
            'full_name_en'   => 'Dr. Sami Hassan',
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
            'is_active'      => true,
            'max_students'   => 1,
        ]);

        $this->publishedVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status'      => 'published',
            'is_current'  => true,
        ]);

        $this->assignment1 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id'              => $this->student1->id,
            'student_subgroup_id'     => $this->subgroup->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => $this->supervisor1->id,
        ]);

        $this->assignment2 = StudentClinicalAssignment::create([
            'distribution_version_id' => $this->publishedVersion->id,
            'student_id'              => $this->student2->id,
            'student_subgroup_id'     => $this->subgroup->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => null,
        ]);
    }

    // =========================================================================
    // 1. RBAC & Security
    // =========================================================================

    public function test_unauthenticated_user_cannot_reassign_supervisor(): void
    {
        $this->putJson(
            route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
            ['supervisor_id' => $this->supervisor2->id]
        )->assertStatus(401);
    }

    public function test_unauthorized_user_cannot_reassign_supervisor(): void
    {
        $this->actingAs($this->unauthorized)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(403);
    }

    // =========================================================================
    // 2. Supervisor Reassignment — Happy Path
    // =========================================================================

    public function test_authorized_user_can_reassign_supervisor(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('data.supervisor_id', $this->supervisor2->id);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'id'            => $this->assignment1->id,
            'supervisor_id' => $this->supervisor2->id,
        ]);
    }

    public function test_supervisor_reassignment_generates_audit_log(): void
    {
        $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(200);

        $log = AuditLog::where('action', 'supervisor.reassigned')
            ->where('entity_id', $this->assignment1->id)
            ->first();

        $this->assertNotNull($log);
        $this->assertEquals($this->admin->id, $log->user_id);
        $this->assertEquals($this->supervisor1->id, $log->changes['old_supervisor_id']);
        $this->assertEquals($this->supervisor2->id, $log->changes['new_supervisor_id']);
    }

    public function test_authorized_user_can_unassign_supervisor_with_null(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => null]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('data.supervisor_id', null);

        $this->assertDatabaseHas('student_clinical_assignments', [
            'id'            => $this->assignment1->id,
            'supervisor_id' => null,
        ]);
    }

    // =========================================================================
    // 3. Supervisor Reassignment — Validation Guards
    // =========================================================================

    public function test_inactive_supervisor_cannot_be_assigned(): void
    {
        $inactiveSupervisor = Person::factory()->create([
            'is_active'      => false,
            'department_id'  => $this->department1->id,
            'primary_site_id' => $this->site1->id,
        ]);

        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $inactiveSupervisor->id]
            );

        $response->assertStatus(422);
        $response->assertJsonPath('success', false);
        $this->assertArrayHasKey('supervisor_id', $response->json('errors'));
    }

    public function test_non_existent_supervisor_id_rejected(): void
    {
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => 99999]
            );

        $response->assertStatus(422);
        $this->assertArrayHasKey('supervisor_id', $response->json('errors'));
    }

    public function test_reassignment_on_unpublished_version_is_rejected(): void
    {
        $draftVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'status'      => 'manual',
            'is_current'  => false,
        ]);

        $draftAssignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $draftVersion->id,
            'student_id'              => $this->student1->id,
            'rotation_block_id'       => $this->block1->id,
            'training_site_id'        => $this->site1->id,
            'department_id'           => $this->department1->id,
            'supervisor_id'           => null,
        ]);

        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $draftAssignment->id),
                ['supervisor_id' => $this->supervisor1->id]
            );

        $response->assertStatus(422);
        $this->assertArrayHasKey('version', $response->json('errors'));
    }

    public function test_supervisor_workload_warning_is_returned_when_capacity_is_exceeded(): void
    {
        // supervisor2 has max_students = 1. Assign them to assignment2 first.
        $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment2->id),
                ['supervisor_id' => $this->supervisor2->id]
            )->assertStatus(200);

        // Now assign supervisor2 to assignment1 as well — should succeed with warning
        $response = $this->actingAs($this->admin)
            ->putJson(
                route('api.v1.operational.assignments.supervisor.reassign', $this->assignment1->id),
                ['supervisor_id' => $this->supervisor2->id]
            );

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $this->assertArrayHasKey('warning', $response->json());
    }

    // =========================================================================
    // 4. Supervisor Portal View — my-supervisor-assignments
    // =========================================================================

    public function test_supervisor_portal_returns_empty_when_no_person_record(): void
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        // Admin user has no linked Person record
        $response->assertJsonPath('meta.is_supervisor', false);
        $response->assertJsonPath('meta.total', 0);
    }

    public function test_supervisor_portal_returns_assignments_for_linked_person(): void
    {
        // Link supervisor1 Person to admin user
        $this->supervisor1->update(['user_id' => $this->admin->id]);

        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('meta.is_supervisor', true);
        $response->assertJsonPath('meta.person_id', $this->supervisor1->id);
        $response->assertJsonCount(1, 'data'); // Only assignment1 has supervisor1
    }

    // =========================================================================
    // 5. Admin Supervisor Assignments View
    // =========================================================================

    public function test_admin_can_view_any_supervisors_assignments(): void
    {
        $response = $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.supervisors.assignments', $this->supervisor1->id));

        $response->assertStatus(200);
        $response->assertJsonPath('success', true);
        $response->assertJsonPath('meta.person_id', $this->supervisor1->id);
        $response->assertJsonCount(1, 'data');
    }

    public function test_unauthorized_user_cannot_view_supervisor_assignments(): void
    {
        $this->actingAs($this->unauthorized)
            ->getJson(route('api.v1.operational.supervisors.assignments', $this->supervisor1->id))
            ->assertStatus(403);
    }

    // =========================================================================
    // 6. Performance — No N+1 queries
    // =========================================================================

    public function test_supervisor_portal_does_not_exhibit_n_plus_one(): void
    {
        $this->supervisor1->update(['user_id' => $this->admin->id]);

        DB::enableQueryLog();

        $this->actingAs($this->admin)
            ->getJson(route('api.v1.operational.my-supervisor-assignments'))
            ->assertStatus(200);

        $queryCount = count(DB::getQueryLog());
        $this->assertLessThanOrEqual(15, $queryCount);
    }
}
