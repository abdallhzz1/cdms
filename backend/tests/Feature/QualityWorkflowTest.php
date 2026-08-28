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
            'measurement_frequency' => 'فصلي', 'responsible' => 'منسق الجودة',
        ])->assertCreated()->json('data');

        $this->postJson("/api/v1/quality-kpis/{$kpi['id']}/measurements", [
            'measured_at' => now()->toDateString(), 'display_value' => '84%',
            'numeric_value' => 84, 'achievement_status' => 'achieved', 'evidence' => 'نتائج الاستبيان الفصلي',
        ])->assertCreated();

        $this->getJson('/api/v1/quality-overview')->assertOk()
            ->assertJsonPath('data.counts.kpis', 1)
            ->assertJsonPath('data.counts.kpis_achieved', 1)
            ->assertJsonPath('data.recent_kpis.0.latest_measurement.display_value', '84%');
    }
}
