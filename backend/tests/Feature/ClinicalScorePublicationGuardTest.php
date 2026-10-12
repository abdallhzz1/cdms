<?php

namespace Tests\Feature;

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
use App\Services\ClinicalAssessmentContinuity;
use App\Services\Distribution\ClinicalScorePublicationGuard;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;
use Tests\TestCase;

class ClinicalScorePublicationGuardTest extends TestCase
{
    use RefreshDatabase;

    private DistributionVersion $old;
    private DistributionVersion $next;
    private StudentClinicalAssignment $source;
    private StudentClinicalAssignment $target;
    private Person $supervisor;
    private User $actor;

    protected function setUp(): void
    {
        parent::setUp();
        $rotation = Rotation::factory()->create();
        $block = RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 1, 'to_week' => 5]);
        $group = StudentGroup::factory()->create([
            'academic_year_id' => $rotation->academic_year_id, 'academic_level' => $rotation->academic_level,
        ]);
        $subgroup = StudentSubgroup::factory()->create(['student_group_id' => $group->id]);
        $student = Student::factory()->create(['academic_year_id' => $rotation->academic_year_id]);
        $site = TrainingSite::factory()->create();
        $this->supervisor = Person::factory()->create();
        $this->actor = User::factory()->create();
        $this->old = DistributionVersion::create(['rotation_id' => $rotation->id, 'status' => 'published', 'is_current' => true]);
        $this->next = DistributionVersion::create([
            'rotation_id' => $rotation->id, 'source_version_id' => $this->old->id, 'status' => 'suggested',
        ]);
        $values = [
            'student_id' => $student->id, 'student_subgroup_id' => $subgroup->id,
            'rotation_block_id' => $block->id, 'training_site_id' => $site->id,
            'department_id' => $block->department_id, 'supervisor_id' => $this->supervisor->id,
        ];
        $this->source = StudentClinicalAssignment::create($values + ['distribution_version_id' => $this->old->id]);
        $this->target = StudentClinicalAssignment::create($values + ['distribution_version_id' => $this->next->id]);
    }

    public function test_unchanged_assignment_keeps_weekly_period_and_mini_marks_visible_with_audit(): void
    {
        $weekly = $this->mark('weekly', 2);
        $period = $this->mark('period', null);
        $miniId = $this->mini();

        $result = DB::transaction(fn () => app(ClinicalScorePublicationGuard::class)
            ->transfer($this->old, $this->next, $this->actor->id));
        $this->old->update(['is_current' => false]);
        $this->next->update(['status' => 'published', 'is_current' => true]);

        $this->assertSame(['assessments' => 2, 'mini_osce' => 1], $result);
        $this->assertSame($this->target->id, $weekly->fresh()->student_clinical_assignment_id);
        $this->assertSame($this->target->id, $period->fresh()->student_clinical_assignment_id);
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $miniId, 'distribution_version_id' => $this->next->id, 'score' => 4]);
        $this->assertSame(2, app(ClinicalAssessmentContinuity::class)
            ->forAssignments(collect([$this->target]))->count());
        $this->assertCount(1, app(ClinicalAssessmentContinuity::class)
            ->miniScoresForAssignments(collect([$this->target])));
        $this->assertDatabaseHas('audit_logs', ['action' => 'assessment.assignment_relinked', 'entity_id' => $weekly->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'grade.mini_osce.version_relinked', 'entity_id' => $miniId]);
    }

    public function test_changed_supervisor_blocks_entire_publication_without_moving_any_mark(): void
    {
        $weekly = $this->mark('weekly', 2);
        $miniId = $this->mini();
        $this->target->update(['supervisor_id' => Person::factory()->create()->id]);

        try {
            DB::transaction(fn () => app(ClinicalScorePublicationGuard::class)
                ->transfer($this->old, $this->next, $this->actor->id));
            $this->fail('A changed scored assignment must block publication.');
        } catch (ValidationException $exception) {
            $this->assertArrayHasKey('clinical_scores', $exception->errors());
        }
        $this->assertSame($this->source->id, $weekly->fresh()->student_clinical_assignment_id);
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $miniId, 'distribution_version_id' => $this->old->id]);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'assessment.assignment_relinked', 'entity_id' => $weekly->id]);
    }

    public function test_existing_mark_in_target_blocks_relink_instead_of_creating_a_duplicate(): void
    {
        $oldMark = $this->mark('weekly', 3);
        ClinicalAssessment::create([
            'student_id' => $this->source->student_id, 'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->target->id, 'evaluation_week' => 3,
            'assessment_kind' => 'weekly', 'score' => 6, 'max_score' => 10, 'status' => 'submitted',
        ]);

        $this->expectException(ValidationException::class);
        try {
            DB::transaction(fn () => app(ClinicalScorePublicationGuard::class)
                ->transfer($this->old, $this->next, $this->actor->id));
        } finally {
            $this->assertSame($this->source->id, $oldMark->fresh()->student_clinical_assignment_id);
        }
    }

    public function test_read_only_audit_finds_hidden_marks_for_all_supervisors(): void
    {
        $mark = $this->mark('weekly', 2);
        $miniId = $this->mini();
        $this->old->update(['is_current' => false]);
        $this->next->update(['status' => 'published', 'is_current' => true]);

        $this->artisan('clinical:audit-assessment-continuity')->assertExitCode(1);
        $this->assertSame($this->source->id, $mark->fresh()->student_clinical_assignment_id);
        $this->assertDatabaseHas('clinical_mini_osce_scores', ['id' => $miniId, 'distribution_version_id' => $this->old->id]);
    }

    private function mark(string $kind, ?int $week): ClinicalAssessment
    {
        return ClinicalAssessment::create([
            'student_id' => $this->source->student_id,
            'evaluator_person_id' => $this->supervisor->id,
            'student_clinical_assignment_id' => $this->source->id,
            'assessment_kind' => $kind, 'period_guard' => $kind === 'period' ? 1 : null,
            'evaluation_week' => $week, 'week_start' => '2026-09-01', 'week_end' => '2026-09-07',
            'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'submitted_at' => now(),
        ]);
    }

    private function mini(): int
    {
        return DB::table('clinical_mini_osce_scores')->insertGetId([
            'student_id' => $this->source->student_id,
            'rotation_block_id' => $this->source->rotation_block_id,
            'distribution_version_id' => $this->old->id,
            'entered_by_person_id' => $this->supervisor->id,
            'score' => 4, 'max_score' => 5, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
