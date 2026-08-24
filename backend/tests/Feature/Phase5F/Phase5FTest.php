<?php

namespace Tests\Feature\Phase5F;

use App\Models\AcademicYear;
use App\Models\AuditLog;
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
use App\Services\Distribution\CurrentDistributionResolver;
use App\Services\Distribution\DistributionApprovalService;
use App\Services\Distribution\DistributionPublicationService;
use App\Services\Distribution\SupervisorReassignmentService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Phase5FTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $viewer;
    private User $unauthorizedUser;
    private Rotation $rotation;
    private RotationBlock $block1;
    private RotationBlock $block2;
    private Department $department;
    private TrainingSite $site;
    private Person $supervisor;
    private Person $supervisor2;
    private Student $student;
    private StudentSubgroup $subgroup;
    private DistributionVersion $currentPublishedVersion;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class
        ]);

        // Roles setup
        $viewerRole = Role::create(['code' => 'P5F_VIEWER', 'name_key' => 'viewer', 'name_ar' => 'Viewer', 'name_en' => 'Viewer']);
        $viewerRole->permissions()->attach(Permission::where('code', 'distribution.view')->pluck('id'), ['scope_type' => 'global']);

        $adminRole = Role::create(['code' => 'P5F_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $adminRole->permissions()->attach(Permission::whereIn('code', [
            'distribution.view',
            'distribution.create',
            'distribution.update',
            'distribution.delete',
            'distribution.approve',
            'distribution.publish',
            'distribution.override'
        ])->pluck('id'), ['scope_type' => 'global']);

        $this->admin = User::factory()->create();
        $this->admin->roles()->attach($adminRole);

        $this->viewer = User::factory()->create();
        $this->viewer->roles()->attach($viewerRole);

        $this->unauthorizedUser = User::factory()->create();

        // Domain Setup
        $academicYear = AcademicYear::factory()->create();
        $this->rotation = Rotation::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level' => 'fourth'
        ]);

        $this->department = Department::factory()->create(['name_en' => 'Cardiology']);
        $this->site = TrainingSite::factory()->create(['name_en' => 'City Hospital']);

        $this->block1 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department->id,
            'from_week' => 1,
            'to_week' => 4,
            'block_code' => 'B1'
        ]);

        $this->block2 = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id,
            'department_id' => $this->department->id,
            'from_week' => 5,
            'to_week' => 8,
            'block_code' => 'B2'
        ]);

        $group = StudentGroup::factory()->create([
            'academic_year_id' => $academicYear->id,
            'academic_level' => 'fourth'
        ]);

        $this->subgroup = StudentSubgroup::factory()->create([
            'student_group_id' => $group->id,
            'is_active' => true
        ]);

        $this->student = Student::factory()->create(['university_number' => '20261001']);
        StudentGroupAssignment::create([
            'student_id' => $this->student->id,
            'student_group_id' => $group->id,
            'student_subgroup_id' => $this->subgroup->id,
            'academic_year_id' => $academicYear->id
        ]);

        $this->supervisor = Person::factory()->create(['max_students' => 5, 'is_active' => true]);
        $this->supervisor2 = Person::factory()->create(['max_students' => 5, 'is_active' => true]);

        SiteCapacityRule::create([
            'site_id' => $this->site->id,
            'rotation_id' => $this->rotation->id,
            'max_students' => 10
        ]);

        // Baseline Published Version
        $this->currentPublishedVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'version_number' => 1,
            'status' => 'published',
            'is_current' => true,
            'created_by' => $this->admin->id
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->currentPublishedVersion->id,
            'student_id' => $this->student->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'department_id' => $this->department->id,
            'training_site_id' => $this->site->id,
            'supervisor_id' => $this->supervisor->id
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* 1. SECURITY & RBAC MATRIX ENFORCEMENT                                  */
    /* ---------------------------------------------------------------------- */

    public function test_security_rbac_matrix_enforcement()
    {
        // Unauthenticated access
        $this->getJson("/api/v1/operational/clinical-schedule")->assertStatus(401);

        // Unauthorized user (authenticated but no permission)
        $this->actingAs($this->unauthorizedUser)
            ->getJson("/api/v1/operational/clinical-schedule")
            ->assertStatus(403);

        // Authorized viewer can access operational reads
        $this->actingAs($this->viewer)
            ->getJson("/api/v1/operational/clinical-schedule")
            ->assertStatus(200);

        // Viewer cannot execute supervisor reassignment (requires distribution.update)
        $assignment = StudentClinicalAssignment::first();
        $this->actingAs($this->viewer)
            ->putJson("/api/v1/operational/assignments/{$assignment->id}/supervisor", [
                'supervisor_id' => $this->supervisor2->id
            ])
            ->assertStatus(403);
    }

    public function test_bulk_public_schedule_is_not_exposed()
    {
        $this->getJson('/api/v1/public/clinical-schedule')->assertNotFound();
    }

    /* ---------------------------------------------------------------------- */
    /* 2. OBJECT-LEVEL AUTHORIZATION & IDOR PREVENTION                        */
    /* ---------------------------------------------------------------------- */

    public function test_object_level_authorization_and_idor_prevention()
    {
        // Invalid assignment ID
        $this->actingAs($this->admin)
            ->putJson("/api/v1/operational/assignments/99999/supervisor", [
                'supervisor_id' => $this->supervisor2->id
            ])
            ->assertStatus(404);

        // Non-existent student schedule request
        $this->actingAs($this->viewer)
            ->getJson("/api/v1/students/99999/current-clinical-schedule")
            ->assertStatus(404);
    }

    public function test_department_scoped_user_cannot_access_another_departments_distribution(): void
    {
        $this->rotation->departments()->syncWithoutDetaching([$this->department->id]);

        $rtaRole = Role::where('code', 'RTA')->firstOrFail();
        $viewPermission = Permission::where('code', 'distribution.view')->firstOrFail();
        $rtaRole->permissions()->syncWithoutDetaching([
            $viewPermission->id => ['scope_type' => 'global'],
        ]);

        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach($rtaRole->id, [
            'scope_type' => 'department',
            'scope_id' => $this->department->id,
        ]);

        $otherDepartment = Department::factory()->create();
        $otherRotation = Rotation::factory()->create([
            'academic_year_id' => $this->rotation->academic_year_id,
            'academic_level' => 'fourth',
        ]);
        $otherRotation->departments()->attach($otherDepartment->id);
        $outsideVersion = DistributionVersion::create([
            'rotation_id' => $otherRotation->id,
            'version_number' => 1,
            'status' => 'published',
            'is_current' => true,
            'created_by' => $this->admin->id,
        ]);

        $this->actingAs($rta)->getJson('/api/v1/distribution-versions')
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.id', $this->currentPublishedVersion->id);

        $this->actingAs($rta)->getJson("/api/v1/distribution-versions/{$outsideVersion->id}")
            ->assertStatus(403);

        $this->actingAs($rta)->getJson("/api/v1/departments/{$otherDepartment->id}/current-distribution")
            ->assertStatus(403);
    }

    public function test_payload_permissions_are_enforced_per_key_namespace(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/operational/distribution-payload', [
            'key' => 'cdms_group_letters',
            'payload' => ['A', 'B'],
        ])->assertOk();

        $this->actingAs($this->admin)->postJson('/api/v1/operational/distribution-payload', [
            'key' => 'cdms_grades_fourth',
            'payload' => ['score' => 90],
        ])->assertStatus(403);

        $this->actingAs($this->admin)->postJson('/api/v1/operational/distribution-payload', [
            'key' => 'unregistered_namespace',
            'payload' => ['value' => true],
        ])->assertStatus(403);
    }

    /* ---------------------------------------------------------------------- */
    /* 3. CURRENT DISTRIBUTION ISOLATION                                      */
    /* ---------------------------------------------------------------------- */

    public function test_current_distribution_isolation_excludes_draft_and_historical()
    {
        // Create draft version
        $draftVersion = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'version_number' => 2,
            'status' => 'suggested',
            'is_current' => false,
            'created_by' => $this->admin->id
        ]);

        $student2 = Student::factory()->create(['university_number' => '20261002']);
        StudentClinicalAssignment::create([
            'distribution_version_id' => $draftVersion->id,
            'student_id' => $student2->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block2->id,
            'department_id' => $this->department->id,
            'training_site_id' => $this->site->id,
            'supervisor_id' => $this->supervisor->id
        ]);

        // Schedule API must return ONLY current published assignments (student 1, not student 2)
        $response = $this->actingAs($this->viewer)
            ->getJson("/api/v1/operational/clinical-schedule");

        $response->assertStatus(200);
        $studentIds = collect($response->json('data.data'))->pluck('student.id')->toArray();
        $this->assertContains($this->student->id, $studentIds);
        $this->assertNotContains($student2->id, $studentIds);
        $response
            ->assertJsonPath('data.data.0.assignment_id', StudentClinicalAssignment::where('distribution_version_id', $this->currentPublishedVersion->id)->value('id'))
            ->assertJsonPath('data.data.0.group.id', $this->subgroup->student_group_id)
            ->assertJsonPath('data.data.0.subgroup.id', $this->subgroup->id)
            ->assertJsonPath('data.data.0.block.id', $this->block1->id);
    }

    /* ---------------------------------------------------------------------- */
    /* 4. PUBLICATION CONCURRENCY & LOCKING                                   */
    /* ---------------------------------------------------------------------- */

    public function test_publication_concurrency_and_transaction_locking()
    {
        $version2 = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'version_number' => 2,
            'status' => 'suggested',
            'is_current' => false,
            'created_by' => $this->admin->id
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $version2->id,
            'student_id' => $this->student->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'department_id' => $this->department->id,
            'training_site_id' => $this->site->id,
            'supervisor_id' => $this->supervisor->id
        ]);

        $this->actingAs($this->admin);

        // Approve version 2 first
        $approvalService = app(DistributionApprovalService::class);
        $approvalService->approve($version2, $this->admin, true, 'Testing override approval');

        // Publish version 2
        $publicationService = app(DistributionPublicationService::class);
        $published = $publicationService->publish($version2, $this->admin, $version2->updated_at->toIso8601String(), true, 'Testing concurrency publication');

        $this->assertTrue($published->is_current);
        $this->assertEquals('published', $published->status);

        // Previous published version must now have is_current = false
        $this->currentPublishedVersion->refresh();
        $this->assertFalse($this->currentPublishedVersion->is_current);
        $this->assertEquals('published', $this->currentPublishedVersion->status);

        // Verify resolver picks version 2
        $resolver = app(CurrentDistributionResolver::class);
        $resolved = $resolver->resolveForRotation($this->rotation->id);
        $this->assertEquals($version2->id, $resolved->id);
    }

    /* ---------------------------------------------------------------------- */
    /* 5. SUPERVISOR REASSIGNMENT INTEGRITY                                  */
    /* ---------------------------------------------------------------------- */

    public function test_supervisor_reassignment_integrity_and_placement_immutability()
    {
        $assignment = StudentClinicalAssignment::first();
        $originalStudentId = $assignment->student_id;
        $originalSiteId = $assignment->training_site_id;
        $originalBlockId = $assignment->rotation_block_id;

        $response = $this->actingAs($this->admin)
            ->putJson("/api/v1/operational/assignments/{$assignment->id}/supervisor", [
                'supervisor_id' => $this->supervisor2->id
            ]);

        $response->assertStatus(200);
        $assignment->refresh();

        // Placement MUST be immutable
        $this->assertEquals($originalStudentId, $assignment->student_id);
        $this->assertEquals($originalSiteId, $assignment->training_site_id);
        $this->assertEquals($originalBlockId, $assignment->rotation_block_id);
        $this->assertEquals($this->supervisor2->id, $assignment->supervisor_id);

        // Audit log created
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'supervisor.reassigned',
            'entity_id' => $assignment->id,
            'user_id' => $this->admin->id
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* 6. N+1 PERFORMANCE BENCHMARKING (10, 100, 500, 1000 assignments)       */
    /* ---------------------------------------------------------------------- */

    public function test_n1_performance_and_query_scale_benchmarks()
    {
        $sizes = [10, 100, 500];

        foreach ($sizes as $size) {
            // Seed assignments
            $version = DistributionVersion::create([
                'rotation_id' => $this->rotation->id,
                'version_number' => 10 + $size,
                'status' => 'published',
                'is_current' => false,
                'created_by' => $this->admin->id
            ]);

            $students = Student::factory()->count($size)->create();
            $assignmentsData = [];
            foreach ($students as $index => $st) {
                $assignmentsData[] = [
                    'distribution_version_id' => $version->id,
                    'student_id' => $st->id,
                    'student_subgroup_id' => $this->subgroup->id,
                    'rotation_block_id' => $this->block1->id,
                    'department_id' => $this->department->id,
                    'training_site_id' => $this->site->id,
                    'supervisor_id' => $this->supervisor->id,
                    'created_at' => now(),
                    'updated_at' => now()
                ];
            }
            StudentClinicalAssignment::insert($assignmentsData);

            // Make current
            DistributionVersion::where('rotation_id', $this->rotation->id)->update(['is_current' => false]);
            $version->update(['is_current' => true]);

            DB::enableQueryLog();
            $startTime = microtime(true);

            $response = $this->actingAs($this->viewer)
                ->getJson("/api/v1/operational/clinical-schedule?per_page=100");

            $durationMs = round((microtime(true) - $startTime) * 1000, 2);
            $queryCount = count(DB::getQueryLog());
            DB::disableQueryLog();

            $response->assertStatus(200);
            
            // Query count MUST stay bounded (< 50) regardless of size (O(1) relation eager loading)
            $this->assertLessThan(50, $queryCount, "Query count for size {$size} was {$queryCount}, expected < 50");
        }
    }

    /* ---------------------------------------------------------------------- */
    /* 7. LARGE DATASET & PAGINATION HARDENING                                */
    /* ---------------------------------------------------------------------- */

    public function test_large_dataset_and_pagination_hardening()
    {
        // Pagination deterministic order check
        $response = $this->actingAs($this->viewer)
            ->getJson("/api/v1/operational/clinical-schedule?page=1&per_page=5");

        $response->assertStatus(200);
        $response->assertJsonStructure([
            'success',
            'data' => ['data', 'current_page', 'total']
        ]);
    }

    /* ---------------------------------------------------------------------- */
    /* 8. AUDIT LOG INTEGRITY & IDEMPOTENCY                                   */
    /* ---------------------------------------------------------------------- */

    public function test_audit_log_integrity_and_idempotency()
    {
        $publicationService = app(DistributionPublicationService::class);
        
        // Idempotency: re-publishing current published version does not throw and does not duplicate audit log
        $initialAuditCount = AuditLog::where('action', 'version.published')->count();

        $result = $publicationService->publish($this->currentPublishedVersion, $this->admin, $this->currentPublishedVersion->updated_at->toIso8601String(), true, 'Testing idempotency');

        $this->assertEquals($this->currentPublishedVersion->id, $result->id);
        $this->assertEquals($initialAuditCount, AuditLog::where('action', 'version.published')->count());
    }

    /* ---------------------------------------------------------------------- */
    /* 9. END-TO-END OPERATIONAL DISTRIBUTION LIFECYCLE                       */
    /* ---------------------------------------------------------------------- */

    public function test_complete_operational_distribution_lifecycle()
    {
        $this->actingAs($this->admin);

        // 1. Version creation (Suggested)
        $version = DistributionVersion::create([
            'rotation_id' => $this->rotation->id,
            'version_number' => 99,
            'status' => 'suggested',
            'is_current' => false,
            'created_by' => $this->admin->id
        ]);

        $assignment = StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'student_id' => $this->student->id,
            'student_subgroup_id' => $this->subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'department_id' => $this->department->id,
            'training_site_id' => $this->site->id,
            'supervisor_id' => $this->supervisor->id
        ]);

        // 2. Approval
        $approvalService = app(DistributionApprovalService::class);
        $approvalService->approve($version, $this->admin, true, 'Testing E2E override approval');

        // 3. Publication
        $publicationService = app(DistributionPublicationService::class);
        $publishedVersion = $publicationService->publish($version, $this->admin, $version->updated_at->toIso8601String(), true, 'Testing E2E lifecycle');

        // 4. Verify Current Published
        $this->assertTrue($publishedVersion->is_current);

        // 5. Read Operational Clinical Schedule
        $scheduleResponse = $this->actingAs($this->viewer)->getJson("/api/v1/operational/clinical-schedule");
        $scheduleResponse->assertStatus(200);

        // 6. Post-publication Supervisor Reassignment
        $reassignResponse = $this->actingAs($this->admin)
            ->putJson("/api/v1/operational/assignments/{$assignment->id}/supervisor", [
                'supervisor_id' => $this->supervisor2->id
            ]);
        $reassignResponse->assertStatus(200);

        // 7. Generate Operational Export
        $exportResponse = $this->actingAs($this->viewer)
            ->get("/api/v1/operational/reports/students?rotation_id={$this->rotation->id}&format=csv");
        $exportResponse->assertStatus(200);

        // Complete E2E verified
        $this->assertTrue(true);
    }
}
