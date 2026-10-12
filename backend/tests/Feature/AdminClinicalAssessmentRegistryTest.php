<?php

namespace Tests\Feature;

use App\Models\ClinicalAssessment;
use App\Models\Course;
use App\Models\DistributionVersion;
use App\Models\GradeEntry;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\StudentCourseEnrollment;
use App\Models\StudentGroup;
use App\Models\StudentSubgroup;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\ClinicalGradeCalculator;
use App\Services\ClinicalAssessmentAdminService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;
use Tests\TestCase;

class AdminClinicalAssessmentRegistryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $other;
    private Course $course;
    private Rotation $rotation;
    private RotationBlock $block;
    private Student $student;
    private Person $supervisor;
    private DistributionVersion $old;
    private DistributionVersion $current;
    private StudentClinicalAssignment $source;
    private StudentClinicalAssignment $target;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class]);
        $this->admin = User::factory()->create();
        $this->admin->roles()->attach(Role::where('code', 'SYS_ADMIN')->firstOrFail());
        $this->other = User::factory()->create();
        $this->course = Course::factory()->create(['academic_level' => 'fourth']);
        $this->rotation = Rotation::factory()->create([
            'course_id' => $this->course->id, 'academic_level' => 'fourth',
            'start_date' => '2026-09-01', 'end_date' => '2026-10-30',
        ]);
        $this->block = RotationBlock::factory()->create(['rotation_id' => $this->rotation->id, 'from_week' => 1, 'to_week' => 5]);
        $this->student = Student::factory()->create(['academic_year_id' => $this->rotation->academic_year_id, 'academic_level' => 'fourth']);
        $this->supervisor = Person::factory()->create();
        $site = TrainingSite::factory()->create();
        $group = StudentGroup::factory()->create(['academic_year_id' => $this->rotation->academic_year_id, 'academic_level' => 'fourth']);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);
        $this->old = DistributionVersion::create(['rotation_id' => $this->rotation->id, 'status' => 'published', 'is_current' => false]);
        $this->current = DistributionVersion::create([
            'rotation_id' => $this->rotation->id, 'source_version_id' => $this->old->id,
            'status' => 'published', 'is_current' => true,
        ]);
        $values = [
            'student_id' => $this->student->id, 'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $this->block->id, 'training_site_id' => $site->id,
            'department_id' => $this->block->department_id, 'supervisor_id' => $this->supervisor->id,
        ];
        $this->source = StudentClinicalAssignment::create($values + ['distribution_version_id' => $this->old->id]);
        $this->target = StudentClinicalAssignment::create($values + ['distribution_version_id' => $this->current->id]);
    }

    private function oldMark(float $score = 8): ClinicalAssessment
    {
        return ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->source->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => $score, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
    }

    private function approvedGrade(): GradeEntry
    {
        $enrollment = StudentCourseEnrollment::create([
            'student_id' => $this->student->id, 'course_id' => $this->course->id,
            'academic_year_id' => $this->rotation->academic_year_id, 'semester' => 'FIRST', 'status' => 'enrolled',
        ]);
        return GradeEntry::create([
            'student_course_enrollment_id' => $enrollment->id, 'status' => 'approved',
            'clinical_score' => 0, 'osce_score' => 25, 'written_score' => 40, 'score' => 65,
        ]);
    }

    private function snapshot(string $type, int $id): string
    {
        return app(ClinicalAssessmentAdminService::class)->fingerprint($type, $id);
    }

    public function test_only_active_system_admin_can_inspect_every_supervisor_and_historical_record(): void
    {
        $mark = $this->oldMark();
        $this->actingAs($this->other)->getJson('/api/v1/admin/clinical-assessments/overview')->assertForbidden();
        $this->actingAs($this->other)->getJson('/api/v1/admin/clinical-assessments')->assertForbidden();
        $this->actingAs($this->other)->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/correct", [])->assertForbidden();

        $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments/overview')
            ->assertOk()->assertJsonPath('data.counts.clinical_historical', 1);
        $this->getJson('/api/v1/admin/clinical-assessments?type=clinical&issues_only=1&supervisor_id='.$this->supervisor->id)
            ->assertOk()->assertJsonPath('data.items.0.record_id', $mark->id)
            ->assertJsonPath('data.items.0.finding', 'restorable');
        $this->getJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}")
            ->assertOk()->assertJsonPath('data.restore.allowed', true)
            ->assertJsonPath('data.restore.target_assignment_id', $this->target->id);
    }

    public function test_restore_requires_explicit_approved_grade_acknowledgment_and_recalculates_atomically(): void
    {
        $mark = $this->oldMark();
        $grade = $this->approvedGrade();
        $body = [
            'expected_updated_at' => $mark->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $mark->id),
            'expected_current_version_id' => $this->current->id,
            'reason' => 'Verified unchanged published assignment and original supervisor record.',
        ];
        $this->actingAs($this->admin)->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/restore", $body)
            ->assertUnprocessable();
        $this->assertSame($this->source->id, $mark->fresh()->student_clinical_assignment_id);
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/restore", $body + ['acknowledge_approved_grade' => true])
            ->assertOk();
        $this->assertSame($this->target->id, $mark->fresh()->student_clinical_assignment_id);
        $this->assertEquals(16, $grade->fresh()->clinical_score);
        $this->assertEquals(81, $grade->fresh()->score);
        $this->assertSame('approved', $grade->fresh()->status);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => $mark->id, 'action' => 'assessment.admin_relinked', 'user_id' => $this->admin->id]);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => $grade->id, 'action' => 'grade.admin_clinical_resynced']);
    }

    public function test_existing_current_mark_blocks_restore_and_score_correction_has_audit(): void
    {
        $old = $this->oldMark();
        $current = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 6, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $this->actingAs($this->admin)->postJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}/restore", [
            'expected_updated_at' => $old->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $old->id),
            'expected_current_version_id' => $this->current->id,
            'reason' => 'Historical mark was checked against the current assignment.',
        ])->assertStatus(409);
        $this->assertSame($this->source->id, $old->fresh()->student_clinical_assignment_id);

        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$current->id}/correct", [
            'expected_updated_at' => $current->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $current->id),
            'score' => 7, 'reason' => 'Checked signed supervisor grade sheet and corrected the entry.',
        ])->assertOk();
        $this->assertEquals(7, $current->fresh()->score);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => $current->id, 'action' => 'assessment.admin_score_corrected']);
    }

    public function test_identical_historical_copy_can_be_closed_without_changing_the_official_mark_or_approved_grade(): void
    {
        $old = $this->oldMark(9);
        $current = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 9, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $grade = $this->approvedGrade();
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}")
            ->assertOk()->assertJsonPath('data.restore.reason', 'current_assessment_exists')
            ->assertJsonPath('data.current_authoritative.id', $current->id);
        $this->getJson('/api/v1/admin/clinical-assessments?issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 1);

        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}/confirm-current", [
            'expected_updated_at' => $old->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $old->id),
            'expected_current_assessment_id' => $current->id,
            'expected_current_snapshot' => $this->snapshot('clinical', $current->id),
            'reason' => 'Verified matching marks and the signed current supervisor assignment.',
        ])->assertOk();

        $this->assertSame('superseded', $old->fresh()->status);
        $this->assertEquals(9, $old->fresh()->score);
        $this->assertSame('submitted', $current->fresh()->status);
        $this->assertEquals(9, $current->fresh()->score);
        $this->assertEquals(0, $grade->fresh()->clinical_score);
        $this->assertEquals(65, $grade->fresh()->score);
        $this->getJson('/api/v1/admin/clinical-assessments?issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 0);
        $this->getJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}")
            ->assertOk()->assertJsonPath('data.record.finding', 'superseded');
        $this->assertDatabaseHas('audit_logs', [
            'entity_id' => $old->id, 'action' => 'assessment.admin_historical_closed_for_current',
            'user_id' => $this->admin->id,
        ]);
    }

    public function test_changed_supervisor_and_different_score_still_keep_only_the_current_assigned_mark(): void
    {
        $old = $this->oldMark(9);
        $newSupervisor = Person::factory()->create();
        $this->target->update(['supervisor_id' => $newSupervisor->id]);
        $current = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $newSupervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}")
            ->assertOk()->assertJsonPath('data.restore.reason', 'assignment_changed')
            ->assertJsonPath('data.current_authoritative.id', $current->id);
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}/confirm-current", [
            'expected_updated_at' => $old->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $old->id),
            'expected_current_assessment_id' => $current->id,
            'expected_current_snapshot' => $this->snapshot('clinical', $current->id),
            'reason' => 'Confirmed the newly assigned supervisor is authoritative for this week.',
        ])->assertOk();
        $this->assertSame('superseded', $old->fresh()->status);
        $this->assertEquals(9, $old->fresh()->score);
        $this->assertEquals(8, $current->fresh()->score);
        $this->getJson('/api/v1/admin/clinical-assessments?issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 0);
    }

    public function test_historical_closure_is_blocked_until_current_clinical_duplicates_are_resolved(): void
    {
        $old = $this->oldMark();
        $current = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $other = Person::factory()->create();
        ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $other->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 6, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}")
            ->assertOk()->assertJsonPath('data.current_authoritative', null);
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$old->id}/confirm-current", [
            'expected_updated_at' => $old->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $old->id),
            'expected_current_assessment_id' => $current->id,
            'expected_current_snapshot' => $this->snapshot('clinical', $current->id),
            'reason' => 'Attempted to close history while two current marks remain unresolved.',
        ])->assertStatus(409);
        $this->assertSame('submitted', $old->fresh()->status);
    }

    public function test_mini_osce_keeps_the_current_assigned_supervisor_and_preserves_old_score(): void
    {
        $oldSupervisor = $this->supervisor;
        $newSupervisor = Person::factory()->create();
        $this->target->update(['supervisor_id' => $newSupervisor->id]);
        $oldId = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $oldSupervisor->id, 'distribution_version_id' => $this->old->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $currentId = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $newSupervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 3, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $stamp = DB::table('clinical_mini_osce_scores')->where('id', $oldId)->value('updated_at');
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$oldId}")
            ->assertOk()->assertJsonPath('data.current_authoritative.id', $currentId);
        $this->postJson("/api/v1/admin/clinical-assessments/mini_osce/{$oldId}/confirm-current", [
            'expected_updated_at' => $stamp,
            'snapshot' => $this->snapshot('mini_osce', $oldId),
            'expected_current_assessment_id' => $currentId,
            'expected_current_snapshot' => $this->snapshot('mini_osce', $currentId),
            'reason' => 'Confirmed the mini OSCE entered by the supervisor on the current distribution.',
        ])->assertOk();
        $old = DB::table('clinical_mini_osce_scores')->where('id', $oldId)->first();
        $current = DB::table('clinical_mini_osce_scores')->where('id', $currentId)->first();
        $this->assertNotNull($old->superseded_at);
        $this->assertSame($currentId, (int) $old->superseded_by_score_id);
        $this->assertSame($this->admin->id, (int) $old->superseded_by_user_id);
        $this->assertEquals(4, $old->score);
        $this->assertNull($current->superseded_at);
        $this->assertEquals(3, $current->score);
        $this->getJson('/api/v1/admin/clinical-assessments?type=mini_osce&issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 0);
        $this->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$oldId}")
            ->assertOk()->assertJsonPath('data.record.finding', 'superseded');
    }

    public function test_mini_osce_and_final_osce_are_visible_and_correctable(): void
    {
        $miniId = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $grade = $this->approvedGrade();
        $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments?type=mini_osce')
            ->assertOk()->assertJsonPath('data.items.0.record_id', $miniId);
        $this->getJson('/api/v1/admin/clinical-assessments?type=final_osce')
            ->assertOk()->assertJsonPath('data.items.0.record_id', $grade->id);
        $this->postJson("/api/v1/admin/clinical-assessments/final_osce/{$grade->id}/correct", [
            'expected_updated_at' => $grade->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('final_osce', $grade->id),
            'score' => 26, 'reason' => 'Verified final OSCE correction against the signed committee record.',
            'acknowledge_approved_grade' => true,
        ])->assertOk();
        $this->assertEquals(66, $grade->fresh()->score);
        $this->assertDatabaseHas('audit_logs', ['entity_id' => $grade->id, 'action' => 'grade.final_osce.admin_score_corrected']);
    }

    public function test_missing_weekly_slots_are_detected_and_admin_entry_is_attributed(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        try {
            $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments/gaps?kind=clinical')
                ->assertOk()->assertJsonPath('data.pagination.total', 5);
            $this->postJson('/api/v1/admin/clinical-assessments/manual', [
                'assignment_id' => $this->target->id, 'expected_version_id' => $this->current->id,
                'kind' => 'clinical', 'evaluation_week' => 2, 'score' => 8,
                'reason' => 'Verified a signed supervisor assessment for the missing week.',
            ])->assertCreated();
            $this->assertDatabaseHas('clinical_assessments', [
                'student_clinical_assignment_id' => $this->target->id,
                'evaluator_person_id' => $this->supervisor->id, 'evaluation_week' => 2, 'score' => 8,
            ]);
            $this->getJson('/api/v1/admin/clinical-assessments/gaps?kind=clinical')
                ->assertOk()->assertJsonPath('data.pagination.total', 4);
            $this->assertDatabaseHas('audit_logs', ['action' => 'assessment.admin_created', 'user_id' => $this->admin->id]);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_duplicate_choice_preserves_the_losing_mark_as_superseded_history(): void
    {
        $first = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $otherBlock = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id, 'from_week' => 2, 'to_week' => 2,
        ]);
        $otherAssignment = $this->target->replicate();
        $otherAssignment->rotation_block_id = $otherBlock->id;
        $otherAssignment->save();
        $other = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $otherAssignment->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 6, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments?issues_only=1')
            ->assertOk()->assertJsonPath('data.items.0.finding', 'duplicate_current');
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$first->id}/choose", [
            'expected_updated_at' => $first->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $this->snapshot('clinical', $first->id),
            'reason' => 'Verified the signed source; the first mark is authoritative.',
        ])->assertOk();
        $this->assertSame('submitted', $first->fresh()->status);
        $this->assertSame('superseded', $other->fresh()->status);
        $this->assertDatabaseHas('audit_logs', [
            'action' => 'assessment.admin_superseded_duplicate', 'entity_id' => $other->id,
        ]);
        $this->getJson('/api/v1/admin/clinical-assessments?issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 0);
    }

    public function test_missing_mini_osce_is_detected_and_recorded_once_per_period(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        try {
            $this->course->assessmentComponents()->where('code', 'clinical')->update(['mini_osce_max_score' => 5]);
            $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments/gaps?kind=mini_osce')
                ->assertOk()->assertJsonPath('data.pagination.total', 1);
            $this->postJson('/api/v1/admin/clinical-assessments/manual', [
                'assignment_id' => $this->target->id, 'expected_version_id' => $this->current->id,
                'kind' => 'mini_osce', 'score' => 4,
                'reason' => 'Verified the signed mini OSCE assessment for this training period.',
            ])->assertCreated();
            $this->getJson('/api/v1/admin/clinical-assessments/gaps?kind=mini_osce')
                ->assertOk()->assertJsonPath('data.pagination.total', 0);
            $this->assertDatabaseHas('audit_logs', ['action' => 'grade.mini_osce.admin_created', 'user_id' => $this->admin->id]);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_admin_can_choose_assigned_supervisors_mini_osce_and_preserve_duplicate(): void
    {
        $this->course->assessmentComponents()->where('code', 'clinical')->update(['mini_osce_max_score' => 5]);
        $otherSupervisor = Person::factory()->create();
        $first = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $second = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $otherSupervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 3, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$first}")
            ->assertOk()->assertJsonPath('data.record.finding', 'duplicate_current');
        $this->postJson("/api/v1/admin/clinical-assessments/mini_osce/{$second}/choose", [
            'expected_updated_at' => (string) DB::table('clinical_mini_osce_scores')->where('id', $second)->value('updated_at'),
            'snapshot' => $this->snapshot('mini_osce', $second),
            'reason' => 'Attempt to choose a supervisor who is not assigned in the current distribution.',
        ])->assertStatus(409);
        $this->postJson("/api/v1/admin/clinical-assessments/mini_osce/{$first}/choose", [
            'expected_updated_at' => (string) DB::table('clinical_mini_osce_scores')->where('id', $first)->value('updated_at'),
            'snapshot' => $this->snapshot('mini_osce', $first),
            'reason' => 'Verified the currently assigned supervisor and retained the other mark for audit.',
        ])->assertOk();
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $first, 'superseded_at' => null]);
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $second, 'superseded_by_score_id' => $first]);
        $this->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$first}")
            ->assertOk()->assertJsonPath('data.record.finding', 'current');
    }

    public function test_mini_osce_conflict_across_consecutive_blocks_is_resolved_as_one_period(): void
    {
        $this->course->assessmentComponents()->where('code', 'clinical')->update(['mini_osce_max_score' => 5]);
        $this->block->update(['to_week' => 1]);
        $nextBlock = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id, 'from_week' => 2, 'to_week' => 2,
        ]);
        $nextAssignment = $this->target->replicate();
        $nextAssignment->rotation_block_id = $nextBlock->id;
        $nextAssignment->save();
        $first = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $second = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $nextBlock->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 3, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$first}")
            ->assertOk()->assertJsonPath('data.record.finding', 'duplicate_current');
        $this->getJson('/api/v1/admin/clinical-assessments?type=mini_osce&issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 2);
        $this->postJson("/api/v1/admin/clinical-assessments/mini_osce/{$first}/choose", [
            'expected_updated_at' => (string) DB::table('clinical_mini_osce_scores')->where('id', $first)->value('updated_at'),
            'snapshot' => $this->snapshot('mini_osce', $first),
            'reason' => 'Verified the single official mini OSCE for both consecutive training weeks.',
        ])->assertOk();
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $second, 'superseded_by_score_id' => $first]);
        $this->getJson('/api/v1/admin/clinical-assessments?type=mini_osce&issues_only=1')
            ->assertOk()->assertJsonPath('data.pagination.total', 0);
    }

    public function test_manual_entry_cannot_replace_a_safely_restorable_historical_mark(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        try {
            $old = $this->oldMark();
            $this->actingAs($this->admin)->postJson('/api/v1/admin/clinical-assessments/manual', [
                'assignment_id' => $this->target->id, 'expected_version_id' => $this->current->id,
                'kind' => 'clinical', 'evaluation_week' => 2, 'score' => 9,
                'reason' => 'Proposed administrative entry after reviewing historical records.',
            ])->assertStatus(409);
            $this->assertDatabaseCount('clinical_assessments', 1);
            $this->assertSame($this->source->id, $old->fresh()->student_clinical_assignment_id);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_one_mini_osce_covers_a_continuous_period_with_weekly_clinical_marks(): void
    {
        $this->course->assessmentComponents()->where('code', 'clinical')->update([
            'assessment_frequency' => 'weekly', 'mini_osce_max_score' => 5,
        ]);
        $this->block->update(['to_week' => 1]);
        $nextBlock = RotationBlock::factory()->create([
            'rotation_id' => $this->rotation->id, 'from_week' => 2, 'to_week' => 2,
        ]);
        $nextAssignment = $this->target->replicate();
        $nextAssignment->rotation_block_id = $nextBlock->id;
        $nextAssignment->save();
        foreach ([[$this->target, 1, 8], [$nextAssignment, 2, 6]] as [$assignment, $week, $score]) {
            ClinicalAssessment::create([
                'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
                'student_clinical_assignment_id' => $assignment->id,
                'assessment_kind' => 'weekly', 'evaluation_week' => $week,
                'score' => $score, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
            ]);
        }
        DB::table('clinical_mini_osce_scores')->insert([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->current->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->actingAs($this->admin);
        $score = app(ClinicalGradeCalculator::class)->scores([$this->student->id], $this->course->id,
            $this->rotation->academic_year_id)->get($this->student->id);
        $this->assertEquals(14.5, $score);
    }

    public function test_period_gap_is_one_slot_and_manual_entry_uses_full_period_dates(): void
    {
        Carbon::setTestNow('2026-10-12 12:00:00');
        try {
            $this->course->assessmentComponents()->where('code', 'clinical')->update(['assessment_frequency' => 'period']);
            $this->actingAs($this->admin)->getJson('/api/v1/admin/clinical-assessments/gaps?kind=clinical')
                ->assertOk()->assertJsonPath('data.pagination.total', 1)
                ->assertJsonPath('data.items.0.assessment_kind', 'period');
            $this->postJson('/api/v1/admin/clinical-assessments/manual', [
                'assignment_id' => $this->target->id, 'expected_version_id' => $this->current->id,
                'kind' => 'clinical', 'score' => 8,
                'reason' => 'Verified the complete training-period evaluation with the supervisor.',
            ])->assertCreated();
            $this->assertDatabaseHas('clinical_assessments', [
                'student_clinical_assignment_id' => $this->target->id,
                'assessment_kind' => 'period', 'evaluation_week' => null,
            ]);
            $saved = ClinicalAssessment::query()->where('student_clinical_assignment_id', $this->target->id)->firstOrFail();
            $this->assertSame('2026-09-01', $saved->week_start->toDateString());
            $this->assertSame('2026-10-05', $saved->week_end->toDateString());
            $this->getJson('/api/v1/admin/clinical-assessments/gaps?kind=clinical')
                ->assertOk()->assertJsonPath('data.pagination.total', 0);
        } finally {
            Carbon::setTestNow();
        }
    }

    public function test_historical_mini_osce_can_be_restored_without_deleting_its_audit_history(): void
    {
        $id = DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->student->id, 'rotation_block_id' => $this->block->id,
            'entered_by_person_id' => $this->supervisor->id, 'distribution_version_id' => $this->old->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $stamp = DB::table('clinical_mini_osce_scores')->where('id', $id)->value('updated_at');
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/mini_osce/{$id}")
            ->assertOk()->assertJsonPath('data.restore.allowed', true);
        $this->postJson("/api/v1/admin/clinical-assessments/mini_osce/{$id}/restore", [
            'expected_updated_at' => $stamp, 'expected_current_version_id' => $this->current->id,
            'snapshot' => $this->snapshot('mini_osce', $id),
            'reason' => 'Verified same supervisor, student and training-period assignment.',
        ])->assertOk();
        $this->assertDatabaseHas('clinical_mini_osce_scores', [
            'id' => $id, 'distribution_version_id' => $this->current->id, 'score' => 4,
        ]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'grade.mini_osce.admin_relinked', 'entity_id' => $id]);
    }

    public function test_outdated_approved_grade_is_flagged_and_can_be_resynchronized_with_confirmation(): void
    {
        $mark = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $grade = $this->approvedGrade();
        $this->actingAs($this->admin)->getJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}")
            ->assertOk()->assertJsonPath('data.grade.clinical_outdated', true)
            ->assertJsonPath('data.grade.official_clinical_score', 16);
        $body = [
            'expected_grade_updated_at' => $grade->updated_at->format('Y-m-d H:i:s'),
            'grade_snapshot' => $this->snapshot('final_osce', $grade->id),
            'reason' => 'Verified current clinical assessment against approved grade sheet.',
        ];
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/resync", $body)
            ->assertUnprocessable();
        $this->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/resync",
            $body + ['acknowledge_approved_grade' => true])->assertOk();
        $this->assertEquals(16, $grade->fresh()->clinical_score);
        $this->assertEquals(81, $grade->fresh()->score);
        $this->getJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}")
            ->assertOk()->assertJsonPath('data.grade.clinical_outdated', false);
    }

    public function test_same_second_score_change_invalidates_snapshot_and_prevents_stale_correction(): void
    {
        $mark = ClinicalAssessment::create([
            'student_id' => $this->student->id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id,
            'assessment_kind' => 'weekly', 'evaluation_week' => 2,
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
        $snapshot = $this->snapshot('clinical', $mark->id);
        DB::table('clinical_assessments')->where('id', $mark->id)->update(['score' => 9]);
        $this->actingAs($this->admin)->postJson("/api/v1/admin/clinical-assessments/clinical/{$mark->id}/correct", [
            'expected_updated_at' => $mark->updated_at->format('Y-m-d H:i:s'),
            'snapshot' => $snapshot,
            'score' => 7, 'reason' => 'Attempted correction from an outdated detail screen.',
        ])->assertStatus(409);
        $this->assertEquals(9, $mark->fresh()->score);
    }
}
