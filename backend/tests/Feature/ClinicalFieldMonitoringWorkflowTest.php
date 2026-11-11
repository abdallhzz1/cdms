<?php

namespace Tests\Feature;

use App\Models\ClinicalFieldForm;
use App\Models\Department;
use App\Models\Role;
use App\Models\TrainingSite;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class ClinicalFieldMonitoringWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private User $assistant;

    private User $director;

    private User $dean;

    private Department $department;

    private TrainingSite $site;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class, RolePermissionSeeder::class]);
        $this->department = Department::factory()->create();
        $this->site = TrainingSite::factory()->create();
        $this->assistant = $this->userWithRole('RTA', $this->department->id);
        $this->director = $this->userWithRole('CLINICAL_DIRECTOR');
        $this->dean = $this->userWithRole('DEAN');
    }

    public function test_assistant_form_reaches_clinical_director_and_is_completed_with_audit_events(): void
    {
        $created = $this->actingAs($this->assistant)->postJson('/api/v1/clinical-field-monitoring/forms', $this->assistantRequest())
            ->assertCreated()->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.department.id', $this->department->id)
            ->assertJsonPath('data.recipient.id', $this->director->id);

        $id = $created->json('data.id');
        $this->actingAs($this->assistant)->postJson("/api/v1/clinical-field-monitoring/forms/$id/submit")
            ->assertOk()->assertJsonPath('data.status', 'submitted');

        $this->assertDatabaseHas('notifications', ['notifiable_id' => $this->director->id]);
        $this->actingAs($this->director)->postJson("/api/v1/clinical-field-monitoring/forms/$id/review", [
            'action' => 'acknowledge',
        ])->assertOk()->assertJsonPath('data.status', 'acknowledged');
        $this->actingAs($this->director)->postJson("/api/v1/clinical-field-monitoring/forms/$id/review", [
            'action' => 'complete', 'note' => 'Reviewed and closed.',
        ])->assertOk()->assertJsonPath('data.status', 'completed');

        $this->assertDatabaseCount('clinical_field_form_events', 4);
        $this->assertNotNull(ClinicalFieldForm::findOrFail($id)->completed_at);
        $this->actingAs($this->assistant)->get("/api/v1/clinical-field-monitoring/forms/$id/pdf?locale=ar")
            ->assertOk()->assertHeader('content-type', 'application/pdf');
    }

    public function test_form_is_private_to_creator_recipient_and_authorized_manager(): void
    {
        $id = $this->actingAs($this->assistant)->postJson('/api/v1/clinical-field-monitoring/forms', $this->assistantRequest())->json('data.id');
        $outsider = User::factory()->create();
        $outsider->roles()->attach(Role::where('code', 'RTA')->firstOrFail());

        $this->actingAs($outsider)->getJson("/api/v1/clinical-field-monitoring/forms/$id")->assertForbidden();
        $this->actingAs($this->director)->getJson("/api/v1/clinical-field-monitoring/forms/$id")->assertOk();
    }

    public function test_assistant_department_choices_and_submission_are_limited_to_assigned_scope(): void
    {
        $otherDepartment = Department::factory()->create();

        $this->actingAs($this->assistant)->getJson('/api/v1/clinical-field-monitoring/options')
            ->assertOk()->assertJsonCount(1, 'data.departments')
            ->assertJsonPath('data.departments.0.id', $this->department->id);

        $request = $this->assistantRequest();
        $request['department_id'] = $otherDepartment->id;
        $this->actingAs($this->assistant)->postJson('/api/v1/clinical-field-monitoring/forms', $request)
            ->assertUnprocessable()->assertJsonValidationErrors(['department_id']);
    }

    public function test_form_list_accepts_the_empty_filter_values_sent_by_older_frontends(): void
    {
        $this->actingAs($this->assistant)
            ->getJson('/api/v1/clinical-field-monitoring?mailbox=all&status=&type=&search=')
            ->assertOk()->assertJsonPath('data', []);
    }

    public function test_patient_safety_failure_requires_complete_urgent_documentation(): void
    {
        $request = $this->assistantRequest();
        $request['payload']['responses']['patient_safety'] = ['rating' => 'no', 'comment' => 'Immediate safety concern.'];
        $this->actingAs($this->assistant)->postJson('/api/v1/clinical-field-monitoring/forms', $request)
            ->assertUnprocessable()->assertJsonValidationErrors(['payload.urgent.details']);

        $request['payload']['urgent'] = [
            'direct_risk' => false, 'details' => 'Safety concern documented.',
            'action_taken' => 'Director notified and training paused.', 'notified_at' => '2026-11-08T10:00',
        ];
        $this->actingAs($this->assistant)->postJson('/api/v1/clinical-field-monitoring/forms', $request)
            ->assertCreated()->assertJsonPath('data.is_urgent', true);
    }

    public function test_director_visit_is_routed_to_dean(): void
    {
        $viceDean = $this->userWithRole('VICE_DEAN');
        $payload = [
            'context' => ['visit_type' => 'routine', 'representatives' => 'Hospital administration'],
            'specialties' => [['code' => 'internal', 'name' => 'Internal Medicine', 'rating' => 'not_assessed', 'basis' => '', 'notes' => '']],
            'overall' => collect(['clinical_supervision', 'learning_opportunities', 'hospital_cooperation', 'training_environment_safety'])
                ->mapWithKeys(fn (string $code) => [$code => ['rating' => 'good', 'comment' => '']])->all(),
            'actions' => [], 'summary' => '', 'required_actions' => '', 'dean_intervention' => '',
            'follow_up' => ['required' => false, 'date' => ''],
            'urgent' => ['direct_risk' => false, 'details' => '', 'action_taken' => '', 'notified_at' => ''],
        ];
        $created = $this->actingAs($this->director)->postJson('/api/v1/clinical-field-monitoring/forms', [
            'type' => 'director_supervisory_visit', 'locale' => 'en',
            'training_site_id' => $this->site->id, 'activity_date' => '2026-11-08', 'payload' => $payload,
        ])->assertCreated()->assertJsonPath('data.recipient.id', $this->dean->id);

        $id = $created->json('data.id');
        $this->actingAs($this->director)->postJson("/api/v1/clinical-field-monitoring/forms/$id/submit")->assertOk();
        $this->assertDatabaseHas('notifications', ['notifiable_id' => $viceDean->id]);
        $this->actingAs($viceDean)->getJson('/api/v1/clinical-field-monitoring?mailbox=incoming')
            ->assertOk()->assertJsonPath('data.0.id', $id);
        $this->actingAs($viceDean)->getJson("/api/v1/clinical-field-monitoring/forms/$id")->assertOk();
        $this->actingAs($viceDean)->postJson("/api/v1/clinical-field-monitoring/forms/$id/review", [
            'action' => 'complete',
        ])->assertOk()->assertJsonPath('data.status', 'completed');
    }

    public function test_department_head_periodic_report_is_routed_to_clinical_director(): void
    {
        $departmentHead = $this->userWithRole('DEPARTMENT_HEAD', $this->department->id);
        $items = [
            'supervisor_adequacy', 'attendance_coverage', 'plan_alignment', 'case_adequacy',
            'assessment_feedback', 'patient_safety', 'respectful_environment',
            'facilities_resources', 'hospital_coordination',
        ];

        $this->actingAs($departmentHead)->postJson('/api/v1/clinical-field-monitoring/forms', [
            'type' => 'department_periodic_report', 'locale' => 'ar',
            'period_from' => '2026-11-01', 'period_to' => '2026-11-30',
            'payload' => [
                'context' => ['department_head' => $departmentHead->name, 'training_sites' => 'مستشفى الخليل', 'courses_rotations' => 'باطني', 'student_count' => 40, 'supervisor_count' => 4],
                'responses' => collect($items)->mapWithKeys(fn (string $code) => [$code => ['rating' => 'yes', 'comment' => '']])->all(),
                'previous_period_status' => 'completed', 'strengths' => '', 'challenges' => '',
                'improvements' => [], 'support_requested' => '',
                'urgent' => ['direct_risk' => false, 'details' => '', 'action_taken' => '', 'notified_at' => ''],
            ],
        ])->assertCreated()
            ->assertJsonPath('data.type', 'department_periodic_report')
            ->assertJsonPath('data.department.id', $this->department->id)
            ->assertJsonPath('data.recipient.id', $this->director->id);
    }

    public function test_department_report_context_is_derived_without_manual_department_or_counts(): void
    {
        $departmentHead = $this->userWithRole('DEPARTMENT_HEAD', $this->department->id);

        $this->actingAs($departmentHead)->getJson('/api/v1/clinical-field-monitoring/context?'.http_build_query([
            'type' => 'department_periodic_report',
            'period_from' => '2026-11-01',
            'period_to' => '2026-11-30',
        ]))->assertOk()
            ->assertJsonPath('data.department_id', $this->department->id)
            ->assertJsonPath('data.summary.student_count', 0)
            ->assertJsonPath('data.summary.supervisor_count', 0)
            ->assertJsonPath('data.summary.training_sites', [])
            ->assertJsonPath('data.summary.courses', []);
    }

    public function test_migration_recovers_an_existing_partial_install_and_adds_the_short_index(): void
    {
        Schema::table('clinical_field_form_events', function (Blueprint $table) {
            $table->dropIndex('cfm_events_form_created_idx');
        });

        $migration = require database_path('migrations/2026_11_08_100000_create_clinical_field_monitoring.php');
        $migration->up();

        $this->assertTrue(Schema::hasIndex('clinical_field_form_events', 'cfm_events_form_created_idx'));
        $this->assertDatabaseHas('permissions', ['code' => 'clinical_field_monitoring.view']);
    }

    private function assistantRequest(): array
    {
        $items = [
            'student_attendance', 'supervisor_attendance', 'active_participation', 'case_availability',
            'schedule_adherence', 'course_alignment', 'guidance_feedback', 'professional_conduct',
            'patient_safety', 'training_environment',
        ];

        return [
            'type' => 'assistant_follow_up', 'locale' => 'ar',
            'training_site_id' => $this->site->id,
            'activity_date' => '2026-11-08',
            'payload' => [
                'context' => ['clinical_specialty' => 'الباطني', 'rotation_name' => 'باطني 1', 'clinical_supervisor' => 'د. مشرف', 'student_group' => 'A1', 'students_present' => 8, 'students_absent' => 0],
                'responses' => collect($items)->mapWithKeys(fn (string $code) => [$code => ['rating' => 'yes', 'comment' => '']])->all(),
                'observations' => '', 'improvements' => '', 'proposed_action' => '',
                'follow_up' => ['required' => false, 'date' => ''],
                'urgent' => ['direct_risk' => false, 'details' => '', 'action_taken' => '', 'notified_at' => ''],
            ],
        ];
    }

    private function userWithRole(string $role, ?int $departmentId = null): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::where('code', $role)->firstOrFail(), $departmentId ? [
            'scope_type' => 'department', 'scope_id' => $departmentId,
        ] : []);

        return $user;
    }
}
