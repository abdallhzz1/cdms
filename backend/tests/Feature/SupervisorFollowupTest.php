<?php

namespace Tests\Feature;

use App\Models\{Role, Permission, User, Person, UserProfile, ClinicalSupervisorProfile, SupervisorFollowupRecord, AuditLog};
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class SupervisorFollowupTest extends TestCase
{
    use RefreshDatabase;
    private User $supervisor;
    private User $staff;
    private User $reviewer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([\Database\Seeders\RoleSeeder::class, \Database\Seeders\PermissionSeeder::class, \Database\Seeders\Phase3PermissionSeeder::class, \Database\Seeders\SupervisorFollowupPermissionSeeder::class]);
        Storage::fake('local');
        $this->supervisor = User::factory()->create();
        $this->supervisor->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
        $this->staff = $this->actor(['clinical_supervisors.view', 'supervisor_records.view', 'supervisor_records.create', 'supervisor_records.review', 'supervisor_documents.view', 'supervisor_documents.upload']);
        $this->reviewer = $this->actor(['supervisor_records.view', 'supervisor_records.review', 'supervisor_records.delete']);
    }

    private function actor(array $permissions): User
    {
        $role = Role::create(['code' => 'FOLLOWUP_'.uniqid(), 'name_key' => 'test']);
        $role->permissions()->sync(Permission::whereIn('code', $permissions)->pluck('id')->mapWithKeys(fn ($id) => [$id => ['scope_type' => 'global']])->all());
        $actor = User::factory()->create();
        $actor->roles()->attach($role);
        return $actor;
    }

    private function payload(array $overrides = []): array
    {
        return array_replace(['supervisor_user_id' => $this->supervisor->id, 'type' => 'excuse', 'title' => 'Excuse', 'body' => 'Medical appointment', 'record_date' => '2026-11-22'], $overrides);
    }

    private function file(): UploadedFile
    {
        return UploadedFile::fake()->createWithContent('excuse.pdf', "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF");
    }

    public function test_supervisor_submits_excuse_with_private_file_and_receives_review_decision(): void
    {
        $id = $this->actingAs($this->supervisor)->postJson('/api/v1/supervisor-followup', $this->payload(['files' => [$this->file()]]))
            ->assertCreated()->assertJsonPath('data.status', 'submitted')->assertJsonPath('data.visible_to_supervisor', true)
            ->assertJsonMissingPath('data.files.0.storage_path')->json('data.id');
        $record = SupervisorFollowupRecord::findOrFail($id);
        $this->assertSame(1, $this->reviewer->notifications()->count());
        $file = $record->files()->firstOrFail();
        $this->get('/api/v1/supervisor-followup/'.$id.'/files/'.$file->id)->assertOk();
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'approved', 'review_note' => 'OK'])->assertForbidden();
        $this->actingAs($this->reviewer)->getJson('/api/v1/supervisor-followup?status=submitted')->assertOk()->assertJsonPath('data.items.0.can_review', true);
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'approved', 'review_note' => 'Evidence reviewed'])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'rejected', 'review_note' => 'Again'])->assertUnprocessable();
        $this->actingAs($this->supervisor)->getJson('/api/v1/supervisor-followup?supervisor_user_id='.$this->supervisor->id)
            ->assertOk()->assertJsonPath('data.items.0.review_note', 'Evidence reviewed')->assertJsonPath('data.items.0.reviewer.id', $this->reviewer->id);
        $this->assertDatabaseHas('audit_logs', ['action' => 'supervisor_followup.reviewed', 'entity_id' => $id, 'user_id' => $this->reviewer->id]);
        $this->assertSame(1, $this->supervisor->notifications()->count());
    }

    public function test_internal_notes_and_files_are_hidden_from_supervisor_and_general_profile_viewers(): void
    {
        $record = $this->actingAs($this->staff)->postJson('/api/v1/supervisor-followup', $this->payload(['type' => 'note', 'files' => [$this->file()]]))
            ->assertCreated()->assertJsonPath('data.visible_to_supervisor', false)->json('data');
        $url = $record['files'][0]['download_url'];
        $this->actingAs($this->supervisor)->getJson('/api/v1/supervisor-followup')->assertJsonCount(0, 'data.items');
        $this->getJson($url)->assertForbidden();
        $this->postJson('/api/v1/supervisor-followup', $this->payload(['type' => 'absence']))->assertForbidden();
        $viewer = $this->actor(['people.view']);
        $this->actingAs($viewer)->getJson('/api/v1/supervisor-followup')->assertForbidden();
        $this->getJson($url)->assertForbidden();
        $this->actingAs($this->staff)->get($url)->assertOk();
    }

    public function test_on_behalf_submission_requires_an_independent_reviewer_and_delete_is_audited(): void
    {
        $id = $this->actingAs($this->staff)->postJson('/api/v1/supervisor-followup', $this->payload())->assertCreated()->json('data.id');
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'approved', 'review_note' => 'My entry'])->assertUnprocessable();
        $this->actingAs($this->reviewer)->postJson('/api/v1/supervisor-followup', $this->payload())->assertForbidden();
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'rejected', 'review_note' => 'Missing evidence'])->assertOk();
        $this->actingAs($this->staff)->deleteJson('/api/v1/supervisor-followup/'.$id, ['reason' => 'Duplicate entry'])->assertForbidden();
        $this->actingAs($this->reviewer)->deleteJson('/api/v1/supervisor-followup/'.$id, ['reason' => 'Duplicate entry'])->assertOk();
        $this->assertSoftDeleted('supervisor_followup_records', ['id' => $id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'supervisor_followup.deleted', 'entity_id' => $id]);
        $this->actingAs($this->supervisor)->getJson('/api/v1/supervisor-followup')->assertJsonCount(0, 'data.items');
    }

    public function test_professional_documents_have_separate_permissions_and_shared_metadata_stays_consistent(): void
    {
        $base = '/api/v1/clinical-supervisors/'.$this->supervisor->id;
        $viewer = $this->actor(['people.view']);
        $doc = $this->actingAs($this->staff)->postJson($base.'/documents', ['name' => 'Certificate', 'category' => 'academic_degree', 'file' => $this->file()])
            ->assertCreated()->assertJsonMissingPath('data.storage_path')->json('data');
        $this->getJson($base)->assertOk()->assertJsonPath('data.capabilities.documents_upload', true)->assertJsonCount(1, 'data.documents');
        $this->actingAs($viewer)->getJson($base)->assertJsonCount(0, 'data.documents');
        $this->getJson($doc['file_url'])->assertForbidden();
        $this->actingAs($this->staff)->get($doc['file_url'])->assertOk();
        $this->deleteJson($base.'/documents/'.$doc['id'])->assertForbidden();
        $this->actingAs($this->supervisor)->get($doc['file_url'])->assertOk();
        $this->postJson('/api/v1/profile/me/documents', ['name' => 'Second file', 'category' => 'academic_degree', 'file' => $this->file()])->assertOk();
        $this->assertCount(2, UserProfile::where('user_id', $this->supervisor->id)->firstOrFail()->documents);
        $this->assertCount(2, ClinicalSupervisorProfile::where('user_id', $this->supervisor->id)->firstOrFail()->documents);
        $this->deleteJson($base.'/documents/'.$doc['id'])->assertOk();
        $this->assertCount(1, UserProfile::where('user_id', $this->supervisor->id)->firstOrFail()->documents);
        $this->assertCount(1, ClinicalSupervisorProfile::where('user_id', $this->supervisor->id)->firstOrFail()->documents);
    }

    public function test_technical_profile_view_does_not_bypass_department_scope_or_grant_review(): void
    {
        $department = \App\Models\Department::factory()->create();
        $otherDepartment = \App\Models\Department::factory()->create();
        Person::factory()->create(['user_id' => $this->supervisor->id, 'department_id' => $otherDepartment->id]);
        $head = User::factory()->create();
        $head->roles()->attach(Role::where('code', 'DEPARTMENT_HEAD')->firstOrFail(), ['scope_type' => 'department', 'scope_id' => $department->id]);
        $head->directPermissions()->attach(Permission::where('code', 'supervisor_records.view')->firstOrFail());
        $this->actingAs($head)->getJson('/api/v1/clinical-supervisors/'.$this->supervisor->id)->assertForbidden();
        $this->getJson('/api/v1/supervisor-followup?supervisor_user_id='.$this->supervisor->id)->assertForbidden();
    }

    public function test_default_rta_grants_follow_assigned_cohort_and_admin_assistant_can_submit_on_behalf(): void
    {
        $person = Person::factory()->create(['user_id' => $this->supervisor->id, 'department_id' => null]);
        $rotation = \App\Models\Rotation::factory()->create(['academic_level' => 'fourth']);
        $block = \App\Models\RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $version = \App\Models\DistributionVersion::create(['rotation_id' => $rotation->id, 'status' => 'manual', 'name' => 'Test']);
        \App\Models\StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id, 'rotation_block_id' => $block->id,
            'student_id' => \App\Models\Student::factory()->create()->id, 'supervisor_id' => $person->id,
            'training_site_id' => \App\Models\TrainingSite::factory()->create()->id,
        ]);
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach(Role::where('code', 'RTA')->firstOrFail());
        $otherRta = User::factory()->create(['assigned_levels' => ['fifth']]);
        $otherRta->roles()->attach(Role::where('code', 'RTA')->firstOrFail());
        $assistant = User::factory()->create();
        $assistant->roles()->attach(Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail());
        $id = $this->actingAs($assistant)->postJson('/api/v1/supervisor-followup', $this->payload())->assertCreated()->json('data.id');
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'approved', 'review_note' => 'OK'])->assertForbidden();
        $this->assertSame(1, $rta->notifications()->count());
        $this->assertSame(0, $otherRta->notifications()->count());
        $this->actingAs($otherRta)->getJson('/api/v1/clinical-supervisors/'.$this->supervisor->id)->assertForbidden();
        $this->getJson('/api/v1/supervisor-followup')->assertJsonCount(0, 'data.items');
        $this->actingAs($rta)->getJson('/api/v1/clinical-supervisors/'.$this->supervisor->id)->assertOk();
        $this->postJson('/api/v1/supervisor-followup/'.$id.'/review', ['decision' => 'approved', 'review_note' => 'Reviewed by cohort RTA'])->assertOk();
    }

    public function test_a_failed_multi_file_upload_rolls_back_the_record_and_removes_already_stored_files(): void
    {
        $this->actingAs($this->supervisor)->postJson('/api/v1/supervisor-followup', $this->payload([
            'files' => [$this->file(), UploadedFile::fake()->createWithContent('bad.js', 'console.log("not evidence");')],
        ]))->assertUnprocessable();
        $this->assertDatabaseCount('supervisor_followup_records', 0);
        $this->assertDatabaseCount('supervisor_followup_files', 0);
        $this->assertSame([], Storage::disk('local')->allFiles());
    }

    public function test_rta_directory_includes_cross_department_and_shared_row_supervisors_before_enrolment(): void
    {
        $rtaDepartment = \App\Models\Department::factory()->create();
        $otherDepartment = \App\Models\Department::factory()->create();
        $site = \App\Models\TrainingSite::factory()->create(['is_active' => true]);
        $createSupervisor = function () use ($site, $otherDepartment): array {
            $user = User::factory()->create(['is_active' => true]);
            $user->roles()->attach(Role::where('code', 'CLINICAL_SUPERVISOR')->firstOrFail());
            $person = Person::factory()->create(['user_id' => $user->id, 'department_id' => $otherDepartment->id, 'primary_site_id' => $site->id]);
            return [$user, $person];
        };
        [$primary, $primaryPerson] = $createSupervisor();
        [$shared, $sharedPerson] = $createSupervisor();
        [$unrelated, $unrelatedPerson] = $createSupervisor();
        foreach ([['fourth', $primaryPerson], ['fifth', $unrelatedPerson]] as [$level, $person]) {
            $rotation = \App\Models\Rotation::factory()->create(['academic_level' => $level]);
            $version = \App\Models\DistributionVersion::create(['rotation_id' => $rotation->id, 'status' => 'manual', 'name' => 'Empty schedule']);
            $row = \App\Models\CourseScheduleRow::create(['distribution_version_id' => $version->id, 'row_type' => 'doctor', 'person_id' => $person->id, 'training_site_id' => $site->id]);
            if ($level === 'fourth') $row->supervisorLinks()->create(['person_id' => $sharedPerson->id, 'weekdays' => ['monday']]);
        }
        $this->assertDatabaseCount('student_clinical_assignments', 0);
        $rta = User::factory()->create(['assigned_levels' => ['fourth']]);
        $rta->roles()->attach(Role::where('code', 'RTA')->firstOrFail(), ['scope_type' => 'department', 'scope_id' => $rtaDepartment->id]);
        Person::factory()->create(['user_id' => $rta->id, 'department_id' => $rtaDepartment->id]);
        $response = $this->actingAs($rta)->getJson('/api/v1/clinical-supervisors')->assertOk()->assertJsonCount(2, 'data');
        $this->assertEqualsCanonicalizing([$primary->id, $shared->id], collect($response->json('data'))->pluck('user_id')->all());
        $workforce = $this->getJson('/api/v1/clinical-workforce')->assertOk();
        $this->assertEqualsCanonicalizing([$primary->id, $shared->id], collect($workforce->json('data.hospitals'))->flatMap(fn ($hospital) => $hospital['supervisors'])->pluck('user_id')->unique()->all());
        $this->getJson('/api/v1/clinical-supervisors/'.$shared->id)->assertOk();
        $this->getJson('/api/v1/clinical-supervisors/'.$unrelated->id)->assertForbidden();
        $rta->update(['assigned_levels' => []]);
        $this->actingAs($rta->fresh())->getJson('/api/v1/clinical-supervisors')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_review_only_access_cannot_read_internal_notes_and_cannot_mix_attachment_record_ids(): void
    {
        $internal = $this->actingAs($this->staff)->postJson('/api/v1/supervisor-followup', $this->payload(['type' => 'file', 'files' => [$this->file()]]))->assertCreated()->json('data');
        $reviewOnly = $this->actor(['supervisor_records.review']);
        $this->actingAs($reviewOnly)->getJson($internal['files'][0]['download_url'])->assertForbidden();
        $this->getJson('/api/v1/supervisor-followup')->assertJsonCount(0, 'data.items');
        $shared = $this->actingAs($this->staff)->postJson('/api/v1/supervisor-followup', $this->payload(['type' => 'file', 'visible_to_supervisor' => true, 'files' => [$this->file()]]))->assertCreated()->json('data');
        $this->actingAs($this->supervisor)->get($shared['files'][0]['download_url'])->assertOk();
        $this->actingAs($this->staff)->getJson('/api/v1/supervisor-followup/'.$shared['id'].'/files/'.$internal['files'][0]['id'])->assertNotFound();
        $this->actingAs($this->reviewer)->deleteJson('/api/v1/supervisor-followup/'.$shared['id'], ['reason' => 'Wrong upload'])->assertOk();
        $this->actingAs($this->supervisor)->getJson($shared['files'][0]['download_url'])->assertNotFound();
    }

    public function test_profile_edit_permission_controls_official_fields_and_persists_a_cleared_appointment_date(): void
    {
        $base = '/api/v1/clinical-supervisors/'.$this->supervisor->id;
        $person = Person::factory()->create(['user_id' => $this->supervisor->id, 'specialty' => 'Original']);
        $this->actingAs($this->supervisor)->putJson($base, ['specialty' => 'Forged'])->assertOk();
        $this->assertSame('Original', $person->fresh()->specialty);
        $editor = $this->actor(['clinical_supervisors.update']);
        $this->actingAs($editor)->putJson($base, ['specialty' => 'Approved specialty', 'appointment_date' => '2026-11-22'])->assertOk()->assertJsonPath('data.specialty', 'Approved specialty');
        $this->putJson($base, ['appointment_date' => null])->assertOk()->assertJsonPath('data.appointment_date', null);
        $this->assertSame('Approved specialty', $person->fresh()->specialty);
    }
}
