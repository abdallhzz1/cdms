<?php

namespace Tests\Feature;

use App\Models\Permission;
use App\Models\Role;
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
        $role->permissions()->sync(Permission::whereIn('code', ['quality.view', 'quality.manage', 'kpi.manage'])->pluck('id')->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());
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
    }
}
