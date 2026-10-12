<?php

namespace Tests\Feature\Phase4B;

use App\Models\AuditLog;
use App\Models\ClinicalAssessment;
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
use Tests\TestCase;

class DistributionPublicationTest extends TestCase
{
    use RefreshDatabase;

    private User $publishAdmin;
    private DistributionVersion $version;
    private Student $student1;
    private RotationBlock $block1;
    private TrainingSite $site1;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\RolePermissionSeeder::class]);

        $publishRole = \App\Models\Role::create(['code' => 'TEST_PUBLISH', 'name_key' => 'publish', 'name_ar' => 'Publish', 'name_en' => 'Publish']);
        $publishRole->permissions()->sync(\App\Models\Permission::whereIn('code', [
            'distribution.approve',
            'distribution.publish'
        ])->pluck('id')->mapWithKeys(fn($id) => [$id => ['scope_type' => 'global']])->all());

        $this->publishAdmin = User::factory()->create();
        $this->publishAdmin->roles()->attach($publishRole);

        $workflow = \App\Models\ApprovalWorkflow::where('code', 'clinical_distribution')->firstOrFail();
        $workflow->steps()->firstOrFail()->update(['role_codes' => ['TEST_PUBLISH']]);
        $workflow->steps()->where('step_order', '>', 1)->delete();

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

        $this->site1 = TrainingSite::factory()->create();

        $rotation->siteCapacityRules()->create([
            'site_id' => $this->site1->id,
            'max_students' => 5
        ]);

        $this->version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested'
        ]);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $this->version->id,
            'student_id' => $this->student1->id,
            'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block1->id,
            'training_site_id' => $this->site1->id,
            'department_id' => $this->block1->department_id,
        ]);
    }

    private function approveVersion()
    {
        $this->actingAs($this->publishAdmin)->postJson(route('api.v1.distribution-versions.approve', $this->version->id));
    }

    public function test_authorized_user_can_publish_approved_version()
    {
        $this->approveVersion();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(200);
        $this->assertEquals('published', $this->version->fresh()->status);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.published',
            'distribution_version_id' => $this->version->id
        ]);
    }

    public function test_publication_accepts_json_timestamp_format_sent_by_spa()
    {
        $this->approveVersion();

        $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toJSON()]
        )->assertOk();

        $this->assertEquals('published', $this->version->fresh()->status);
    }

    public function test_unapproved_version_cannot_publish()
    {
        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('approval');
    }

    public function test_publication_concurrency_protection()
    {
        $this->approveVersion();

        $oldDate = \Carbon\Carbon::now()->subMinutes(5)->toIso8601String();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $oldDate]
        );

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('concurrency');
    }

    public function test_superseding_previous_published_version()
    {
        // Setup existing published version
        $oldVersion = DistributionVersion::create([
            'rotation_id' => $this->version->rotation_id,
            'status' => 'published'
        ]);

        $this->approveVersion();

        $response = $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()]
        );

        $response->assertStatus(200);
        
        $this->assertEquals('published', $oldVersion->fresh()->status); // Keeps status as published (business rules)
        
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'version.superseded',
            'entity_id' => $oldVersion->id
        ]);
    }

    public function test_publish_relinks_existing_supervisor_marks_before_superseding_current_version(): void
    {
        $supervisor = Person::factory()->create(['primary_site_id' => $this->site1->id]);
        $target = StudentClinicalAssignment::where('distribution_version_id', $this->version->id)->firstOrFail();
        $target->update(['supervisor_id' => $supervisor->id]);
        $sourceVersion = DistributionVersion::create([
            'rotation_id' => $this->version->rotation_id, 'status' => 'published', 'is_current' => true,
        ]);
        $source = $target->replicate();
        $source->distribution_version_id = $sourceVersion->id;
        $source->save();
        $mark = ClinicalAssessment::create([
            'student_id' => $this->student1->id, 'evaluator_person_id' => $supervisor->id,
            'student_clinical_assignment_id' => $source->id, 'assessment_kind' => 'weekly',
            'evaluation_week' => $this->block1->from_week, 'score' => 8, 'max_score' => 10,
            'status' => 'submitted',
        ]);
        $miniId = \Illuminate\Support\Facades\DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student1->id, 'rotation_block_id' => $this->block1->id,
            'distribution_version_id' => $sourceVersion->id, 'entered_by_person_id' => $supervisor->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($this->publishAdmin)->postJson(route('api.v1.distribution-versions.approve', $this->version->id))->assertOk();

        $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()],
        )->assertOk();

        $this->assertTrue($this->version->fresh()->is_current);
        $this->assertFalse($sourceVersion->fresh()->is_current);
        $this->assertSame($target->id, $mark->fresh()->student_clinical_assignment_id);
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $miniId, 'distribution_version_id' => $this->version->id]);
    }

    public function test_publish_rejects_changed_scored_assignment_and_keeps_old_version_current(): void
    {
        $supervisor = Person::factory()->create();
        $target = StudentClinicalAssignment::where('distribution_version_id', $this->version->id)->firstOrFail();
        $sourceVersion = DistributionVersion::create([
            'rotation_id' => $this->version->rotation_id, 'status' => 'published', 'is_current' => true,
        ]);
        $source = $target->replicate();
        $source->distribution_version_id = $sourceVersion->id;
        $source->supervisor_id = $supervisor->id;
        $source->save();
        $mark = ClinicalAssessment::create([
            'student_id' => $this->student1->id, 'evaluator_person_id' => $supervisor->id,
            'student_clinical_assignment_id' => $source->id, 'assessment_kind' => 'weekly',
            'evaluation_week' => $this->block1->from_week, 'score' => 8, 'max_score' => 10,
            'status' => 'submitted',
        ]);
        $this->approveVersion();

        $this->actingAs($this->publishAdmin)->postJson(
            route('api.v1.distribution-versions.publish', $this->version->id),
            ['last_updated_at' => $this->version->fresh()->updated_at->toIso8601String()],
        )->assertUnprocessable()->assertJsonValidationErrors('clinical_scores');

        $this->assertTrue($sourceVersion->fresh()->is_current);
        $this->assertNotSame('published', $this->version->fresh()->status);
        $this->assertSame($source->id, $mark->fresh()->student_clinical_assignment_id);
    }
}
