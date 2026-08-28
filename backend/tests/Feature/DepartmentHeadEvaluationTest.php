<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Department;
use App\Models\DepartmentHeadAssignment;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DepartmentHeadEvaluationTest extends TestCase
{
    use RefreshDatabase;

    private User $evaluator;
    private User $head;
    private AcademicYear $academicYear;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\RoleSeeder::class, \Database\Seeders\PermissionSeeder::class]);

        $role = Role::create([
            'code' => 'HEAD_EVALUATION_TEST',
            'name_key' => 'test.head_evaluation',
            'description_key' => 'test.head_evaluation',
        ]);
        $role->permissions()->sync(Permission::whereIn('code', [
            'department_head_evaluations.view',
            'department_head_evaluations.create',
            'department_head_evaluations.approve',
            'department_head_evaluations.export',
        ])->pluck('id')->mapWithKeys(fn (int $id) => [$id => ['scope_type' => 'global']])->all());

        $this->evaluator = User::factory()->create();
        $this->evaluator->roles()->attach($role);
        $this->head = User::factory()->create();
        $department = Department::factory()->create(['name_ar' => 'قسم الباطنية']);
        $person = Person::factory()->create(['user_id' => $this->head->id, 'department_id' => $department->id]);
        DepartmentHeadAssignment::create([
            'person_id' => $person->id,
            'department_id' => $department->id,
            'role_type' => 'head',
            'is_current' => true,
        ]);
        $this->academicYear = AcademicYear::factory()->current()->create();
    }

    public function test_it_calculates_a_weighted_evaluation_and_keeps_it_private_from_the_department_head(): void
    {
        $domains = collect([
            'leadership_administration', 'curriculum_planning', 'teaching_activities', 'assessment_management',
            'faculty_management', 'quality_assurance', 'research_scholarly', 'student_affairs',
            'strategic_development', 'program_contributions',
        ])->mapWithKeys(fn (string $code) => [$code => ['score' => 4, 'comment' => 'ملاحظات اختبار']])->all();

        $response = $this->actingAs($this->evaluator)->postJson('/api/v1/department-head-evaluations', [
            'department_head_user_id' => $this->head->id,
            'academic_year_id' => $this->academicYear->id,
            'evaluation_purpose' => 'renewal',
            'domains' => $domains,
            'major_achievements' => ['إنجاز موثق'],
            'development_areas' => ['تطوير موثق'],
            'recommendation' => 'renew',
        ]);

        $response->assertCreated()
            ->assertJsonPath('data.overall_score', 80)
            ->assertJsonPath('data.overall_rating', 'جيد جدًا')
            ->assertJsonPath('data.status', 'draft');

        $evaluationId = $response->json('data.id');
        $this->actingAs($this->head)
            ->getJson("/api/v1/department-head-evaluations/{$evaluationId}")
            ->assertForbidden();
    }
}
