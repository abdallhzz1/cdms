<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class QualityWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\RoleSeeder::class, \Database\Seeders\PermissionSeeder::class]);
        $role = Role::create(['code' => 'QUALITY_TEST', 'name_key' => 'quality.test', 'description_key' => 'quality.test']);
        $role->permissions()->sync(Permission::whereIn('code', ['quality.view', 'quality.manage', 'kpi.manage', 'students.view'])->pluck('id')->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());
        $this->user = User::factory()->create();
        $this->user->roles()->attach($role);
    }

    public function test_quality_plan_requires_evidence_before_verified_closure(): void
    {
        $plan = $this->actingAs($this->user)->postJson('/api/v1/quality-improvement-plans', [
            'source' => 'نتائج استبيان', 'observation' => 'انخفاض رضا الطلبة',
            'improvement_action' => 'تحديث آلية التغذية الراجعة', 'responsible' => 'منسق الجودة',
            'due_date' => now()->addMonth()->toDateString(), 'priority' => 'high',
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quality-improvement-plans/{$plan['id']}/transition", ['status' => 'in_progress'])->assertOk();
        $this->postJson("/api/v1/quality-improvement-plans/{$plan['id']}/transition", ['status' => 'under_review'])->assertOk();
        $this->postJson("/api/v1/quality-improvement-plans/{$plan['id']}/transition", ['status' => 'closed'])->assertUnprocessable();
        $this->postJson("/api/v1/quality-improvement-plans/{$plan['id']}/transition", [
            'status' => 'closed', 'closure_evidence' => 'محضر لجنة الجودة رقم 4', 'verification_result' => 'تحسن المؤشر إلى 85%',
        ])->assertOk()->assertJsonPath('data.status', 'closed');
        $this->putJson("/api/v1/quality-improvement-plans/{$plan['id']}", [
            'source' => 'نتائج استبيان', 'observation' => 'تعديل لاحق', 'improvement_action' => 'إجراء جديد',
            'responsible' => 'منسق الجودة', 'due_date' => now()->addMonth()->toDateString(), 'priority' => 'high',
        ])->assertStatus(409);
    }

    public function test_kpi_measurement_appears_in_quality_overview(): void
    {
        $kpi = $this->actingAs($this->user)->postJson('/api/v1/quality-kpis', [
            'code' => 'KPI-QA-01', 'name' => 'رضا الطلبة', 'target_value' => '80%',
            'target_numeric' => 80, 'comparison_operator' => 'gte', 'value_type' => 'percentage',
            'measurement_frequency' => 'فصلي', 'responsible' => 'منسق الجودة',
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quality-kpis/{$kpi['id']}/measurements", [
            'measured_at' => now()->toDateString(), 'display_value' => '84%',
            'numeric_value' => 84, 'evidence' => 'نتائج الاستبيان الفصلي', 'submit_for_review' => true,
        ])->assertCreated()->assertJsonPath('data.achievement_status', 'achieved');

        $measurement = \App\Models\QualityKpiMeasurement::firstOrFail();
        $this->postJson("/api/v1/quality-kpi-measurements/{$measurement->id}/review", ['decision' => 'approved'])->assertOk();

        $this->getJson('/api/v1/quality-overview')->assertOk()
            ->assertJsonPath('data.counts.kpis', 1)
            ->assertJsonPath('data.counts.kpis_achieved', 1)
            ->assertJsonPath('data.recent_kpis.0.latest_measurement.display_value', '84%');
        $this->getJson('/api/v1/quality-kpis?search='.urlencode('رضا'))->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.code', 'KPI-QA-01');
    }

    public function test_quality_findings_and_evidence_are_operational_records(): void
    {
        $finding = $this->actingAs($this->user)->postJson('/api/v1/quality-findings', [
            'academic_year' => '2026/2027', 'source' => 'تدقيق داخلي', 'title' => 'نقص توثيق نتيجة القياس',
            'description' => 'لم يرفق الدليل مع أحد المؤشرات.', 'severity' => 'high', 'due_date' => now()->addWeek()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.status', 'open')->json('data');
        $this->assertDatabaseHas('quality_findings', ['id' => $finding['id'], 'severity' => 'high']);

        $this->postJson('/api/v1/quality-evidence', [
            'code' => 'EVD-001', 'title' => 'محضر لجنة الجودة', 'reference_url' => 'https://example.test/evidence/1',
            'document_version' => '1.0', 'status' => 'approved', 'expires_at' => now()->addYear()->toDateString(),
        ])->assertCreated();

        $this->getJson('/api/v1/quality-operations')->assertOk()
            ->assertJsonPath('data.findings.0.reference', $finding['reference'])
            ->assertJsonPath('data.evidence.0.code', 'EVD-001');
    }

    public function test_finding_can_be_linked_to_one_improvement_plan(): void
    {
        $finding = $this->actingAs($this->user)->postJson('/api/v1/quality-findings', [
            'source' => 'تدقيق داخلي', 'title' => 'فجوة توثيق', 'description' => 'الدليل ناقص', 'severity' => 'high',
        ])->assertCreated()->json('data');
        $payload = [
            'source' => 'ملاحظة داخلية', 'observation' => 'فجوة توثيق', 'improvement_action' => 'استكمال الدليل',
            'responsible' => 'منسق الجودة', 'due_date' => now()->addWeek()->toDateString(), 'priority' => 'high',
            'quality_finding_id' => $finding['id'],
        ];
        $plan = $this->postJson('/api/v1/quality-improvement-plans', $payload)->assertCreated()->json('data');
        $this->assertDatabaseHas('quality_findings', [
            'id' => $finding['id'], 'quality_improvement_plan_id' => $plan['id'], 'status' => 'linked_to_plan',
        ]);
        $this->postJson('/api/v1/quality-improvement-plans', $payload)->assertUnprocessable();
        $this->assertDatabaseCount('quality_improvement_plans', 1);
    }

    public function test_published_survey_accepts_one_grouped_public_submission(): void
    {
        $survey = $this->actingAs($this->user)->postJson('/api/v1/quality-surveys', [
            'title' => 'تقييم التدريب السريري', 'target_group' => 'الطلبة',
            'academic_year' => '2026/2027', 'is_anonymous' => true,
        ])->assertCreated()->json('data');

        $questionOne = $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'ما تقييمك للتدريب؟', 'question_type' => 'rating', 'is_required' => true,
        ])->assertCreated()->json('data');
        $questionTwo = $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'ملاحظاتك', 'question_type' => 'long_text', 'is_required' => false,
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quality-surveys/{$survey['id']}/transition", ['status' => 'open'])->assertOk();
        $this->getJson("/api/v1/public/quality-surveys/{$survey['public_id']}")->assertOk()->assertJsonCount(2, 'data.questions');
        $submission = $this->postJson("/api/v1/public/quality-surveys/{$survey['public_id']}/submit", ['answers' => [
            ['question_id' => $questionOne['id'], 'value' => 5],
            ['question_id' => $questionTwo['id'], 'value' => 'تجربة ممتازة'],
        ]])->assertCreated()->json('data.submission_id');

        $this->assertDatabaseCount('quality_survey_responses', 2);
        $this->assertDatabaseHas('quality_survey_responses', ['submission_id' => $submission, 'numeric_answer' => 5]);
        $this->assertDatabaseHas('quality_survey_responses', ['submission_id' => $submission, 'text_answer' => 'تجربة ممتازة']);
        $this->getJson('/api/v1/quality-surveys')->assertOk()
            ->assertJsonPath('data.0.responses_count', 2)
            ->assertJsonPath('data.0.submissions_count', 1);
    }

    public function test_public_survey_rejects_invalid_or_duplicate_answers_without_saving_a_submission(): void
    {
        $survey = $this->actingAs($this->user)->postJson('/api/v1/quality-surveys', [
            'title' => 'فحص سلامة الردود', 'target_group' => 'الطلبة', 'is_anonymous' => true,
        ])->assertCreated()->json('data');
        $rating = $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'التقييم', 'question_type' => 'rating', 'is_required' => true,
        ])->assertCreated()->json('data');
        $this->postJson("/api/v1/quality-surveys/{$survey['id']}/transition", ['status' => 'open'])->assertOk();
        $url = "/api/v1/public/quality-surveys/{$survey['public_id']}/submit";

        $this->postJson($url, ['answers' => [['question_id' => $rating['id'], 'value' => 9]]])->assertUnprocessable();
        $this->postJson($url, ['answers' => [
            ['question_id' => $rating['id'], 'value' => 4], ['question_id' => $rating['id'], 'value' => 5],
        ]])->assertUnprocessable();
        $this->postJson($url, ['answers' => [['question_id' => $rating['id'] + 999, 'value' => 4]]])->assertUnprocessable();
        $this->assertDatabaseCount('quality_survey_submissions', 0);
        $this->assertDatabaseCount('quality_survey_responses', 0);
    }

    public function test_answered_question_is_immutable_and_survey_search_finds_its_title(): void
    {
        $survey = $this->actingAs($this->user)->postJson('/api/v1/quality-surveys', [
            'title' => 'استبيان الرضا السريري', 'target_group' => 'الطلبة',
        ])->assertCreated()->json('data');
        $question = $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'ما رأيك؟', 'question_type' => 'rating', 'is_required' => true,
        ])->assertCreated()->json('data');
        $this->postJson("/api/v1/quality-surveys/{$survey['id']}/transition", ['status' => 'open'])->assertOk();
        $this->postJson("/api/v1/public/quality-surveys/{$survey['public_id']}/submit", [
            'answers' => [['question_id' => $question['id'], 'value' => 5]],
        ])->assertCreated();

        $this->putJson("/api/v1/quality-surveys/{$survey['id']}/questions/{$question['id']}", [
            'question_text' => 'سؤال مختلف', 'question_type' => 'rating', 'is_required' => true,
        ])->assertStatus(409);
        $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'سؤال جديد', 'question_type' => 'rating', 'is_required' => false,
        ])->assertStatus(409);
        $this->getJson('/api/v1/quality-surveys?search='.urlencode('الرضا'))->assertOk()
            ->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.title', 'استبيان الرضا السريري');
    }

    public function test_student_number_records_participation_separately_from_anonymous_answers(): void
    {
        $fourth = Student::factory()->forLevel('fourth')->create(['university_number' => '22310001']);
        $fifth = Student::factory()->forLevel('fifth')->create(['university_number' => '22310002']);
        $outside = Student::factory()->forLevel('sixth')->create(['university_number' => '22310003']);
        $survey = $this->actingAs($this->user)->postJson('/api/v1/quality-surveys', [
            'title' => 'استبيان الدفعات', 'target_group' => 'الطلبة', 'target_levels' => ['fourth', 'fifth'],
            'is_anonymous' => true,
        ])->assertCreated()->json('data');
        $question = $this->postJson("/api/v1/quality-surveys/{$survey['id']}/questions", [
            'question_text' => 'كيف تقيم التدريب؟', 'question_type' => 'rating', 'is_required' => true,
        ])->assertCreated()->json('data');
        $this->postJson("/api/v1/quality-surveys/{$survey['id']}/transition", ['status' => 'open'])->assertOk();
        $this->assertDatabaseCount('quality_survey_audience_students', 2);
        $this->getJson("/api/v1/public/quality-surveys/{$survey['public_id']}")->assertOk()->assertJsonPath('data.requires_student_number', true);
        $url = "/api/v1/public/quality-surveys/{$survey['public_id']}/submit";
        $answer = ['answers' => [['question_id' => $question['id'], 'value' => 5]]];
        $this->postJson($url, $answer + ['respondent_identifier' => $outside->university_number])->assertUnprocessable();
        $this->postJson($url, $answer + ['respondent_identifier' => $fourth->university_number])->assertCreated();
        $this->postJson($url, $answer + ['respondent_identifier' => $fourth->university_number])->assertStatus(409);
        $this->assertDatabaseHas('quality_survey_participations', ['quality_survey_id' => $survey['id'], 'student_id' => $fourth->id]);
        $this->assertDatabaseHas('quality_survey_responses', ['quality_survey_id' => $survey['id'], 'respondent_identifier' => null, 'numeric_answer' => 5]);
        $this->assertDatabaseHas('quality_survey_submissions', ['quality_survey_id' => $survey['id'], 'respondent_key' => null, 'respondent_identifier' => null]);
        $this->getJson("/api/v1/quality-surveys/{$survey['id']}/participation")
            ->assertOk()->assertJsonPath('data.summary.fourth.completed', 1)->assertJsonPath('data.summary.fifth.total', 1);
        $this->getJson("/api/v1/students?quality_survey_id={$survey['id']}&search=22310002")
            ->assertOk()->assertJsonPath('data.0.quality_survey_status', 'pending');
        $this->getJson("/api/v1/students?quality_survey_id={$survey['id']}&quality_participation=completed")
            ->assertOk()->assertJsonPath('meta.total', 1);
        $fourth->update(['academic_level' => 'sixth']);
        $this->getJson("/api/v1/quality-surveys/{$survey['id']}/participation")
            ->assertOk()->assertJsonPath('data.summary.fourth.total', 1);
    }
}
