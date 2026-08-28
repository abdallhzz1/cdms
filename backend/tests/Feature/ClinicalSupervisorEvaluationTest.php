<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ClinicalSupervisorEvaluationTest extends TestCase
{
    use RefreshDatabase;

    private User $evaluator;
    private User $supervisor;
    private AcademicYear $academicYear;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\RoleSeeder::class, \Database\Seeders\PermissionSeeder::class]);

        $managementRole = Role::create([
            'code' => 'CLINICAL_EVALUATION_TEST',
            'name_key' => 'test.clinical_evaluation',
            'description_key' => 'test.clinical_evaluation',
        ]);
        $managementRole->permissions()->sync(Permission::whereIn('code', [
            'clinical_supervisor_evaluations.view',
            'clinical_supervisor_evaluations.create',
            'clinical_supervisor_evaluations.approve',
            'clinical_supervisor_evaluations.export',
        ])->pluck('id')->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());

        $this->evaluator = User::factory()->create();
        $this->evaluator->roles()->attach($managementRole);
        $this->supervisor = User::factory()->create();
        $supervisorRole = Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail();
        $this->supervisor->roles()->attach($supervisorRole);
        Person::factory()->create(['user_id' => $this->supervisor->id]);
        $this->academicYear = AcademicYear::factory()->current()->create();
    }

    public function test_it_calculates_a_clinical_supervisor_evaluation_and_keeps_it_private_from_the_supervisor(): void
    {
        $domains = collect([
            'clinical_commitment', 'student_supervision', 'assessment_feedback',
            'professionalism_communication', 'patient_safety_student_welfare', 'development_contribution',
        ])->mapWithKeys(fn (string $code) => [$code => ['score' => 4, 'comment' => 'ملاحظة اختبار']])->all();

        $response = $this->actingAs($this->evaluator)->postJson('/api/v1/clinical-supervisor-evaluations', [
            'clinical_supervisor_user_id' => $this->supervisor->id,
            'academic_year_id' => $this->academicYear->id,
            'evaluation_purpose' => 'annual_performance',
            'domains' => $domains,
            'strengths' => ['التزام مهني'],
            'development_areas' => ['تطوير مهني'],
            'recommendation' => 'continue',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.overall_score', 80)
            ->assertJsonPath('data.overall_rating', 'جيد جدًا')
            ->assertJsonPath('data.status', 'draft');

        $evaluationId = $response->json('data.id');
        $this->actingAs($this->supervisor)
            ->getJson("/api/v1/clinical-supervisor-evaluations/{$evaluationId}")
            ->assertForbidden();
    }
}
