<?php

namespace Tests\Feature;

use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyDocument;
use App\Models\AcademicYear;
use App\Models\Permission;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StudentPolicyWorkflowTest extends TestCase
{
    use RefreshDatabase;

    public function test_policy_permissions_models_and_assignment_uniqueness_exist(): void
    {
        $this->seed(PermissionSeeder::class);
        $this->assertDatabaseHas('permissions', ['code' => 'student_policies.view']);
        $this->assertDatabaseHas('permissions', ['code' => 'student_policies.manage']);

        $document = StudentPolicyDocument::factory()->create();
        $campaign = StudentPolicyCampaign::factory()->for($document, 'document')->create();
        $student = Student::factory()->create();
        StudentPolicyAssignment::factory()->for($campaign, 'campaign')->for($student)->create();

        $this->expectException(QueryException::class);
        StudentPolicyAssignment::factory()->for($campaign, 'campaign')->for($student)->create();
    }

    public function test_manager_publishes_snapshot_and_tracks_private_signed_copy(): void
    {
        Storage::fake('local'); $this->seed(PermissionSeeder::class);
        $manager = User::factory()->create();
        $manager->directPermissions()->attach(Permission::whereIn('code', ['student_policies.manage', 'students.view'])->pluck('id'), ['granted_by' => $manager->id]);
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']);
        Student::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fifth', 'registration_status' => 'active']);

        $documentId = $this->actingAs($manager)->post('/api/v1/student-policies/documents', [
            'title_ar' => 'مدونة سلوك طلبة الطب', 'title_en' => 'Medical Students Code of Conduct',
            'version_label' => '2026.1', 'effective_date' => '2026-09-15',
            'file_ar' => UploadedFile::fake()->createWithContent('conduct-ar.pdf', '%PDF-1.4 Arabic approved'),
            'file_en' => UploadedFile::fake()->createWithContent('conduct-en.pdf', '%PDF-1.4 English approved'),
        ])->assertCreated()->json('data.id');
        $this->assertNotNull(StudentPolicyDocument::findOrFail($documentId)->storage_path_en);
        $campaignId = $this->postJson('/api/v1/student-policies/campaigns', [
            'student_policy_document_id' => $documentId, 'academic_year_id' => $year->id,
            'target_levels' => ['fourth'], 'deadline' => '2026-10-01',
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/student-policies/campaigns/{$campaignId}/publish")->assertOk();
        $this->assertDatabaseCount('student_policy_assignments', 1);

        $assignment = StudentPolicyAssignment::firstOrFail();
        $this->postJson("/api/v1/student-policies/assignments/{$assignment->id}/paper-receipt")->assertOk();
        $this->post("/api/v1/student-policies/assignments/{$assignment->id}/scan", [
            'file' => UploadedFile::fake()->createWithContent('signed.pdf', '%PDF-1.4 signed'),
        ])->assertCreated();
        $this->getJson("/api/v1/students/{$student->id}")->assertOk()
            ->assertJsonPath('data.documents.0.category', 'clinical_pledge')
            ->assertJsonPath('data.documents.0.is_policy_evidence', true);
    }

    public function test_policy_manager_can_load_campaign_academic_years_without_academic_year_permission(): void
    {
        $this->seed(PermissionSeeder::class);
        $manager = User::factory()->create();
        $manager->directPermissions()->attach(
            Permission::where('code', 'student_policies.manage')->value('id'),
            ['granted_by' => $manager->id],
        );
        AcademicYear::factory()->create(['code' => '2026/2027', 'is_current' => true]);

        $this->actingAs($manager)
            ->getJson('/api/v1/student-policies/options')
            ->assertOk()
            ->assertJsonPath('data.academic_years.0.code', '2026/2027')
            ->assertJsonPath('data.academic_years.0.is_current', true);
    }

    public function test_manager_can_delete_an_inactive_campaign_but_not_one_with_student_activity(): void
    {
        Storage::fake('local');
        $this->seed(PermissionSeeder::class);
        $manager = User::factory()->create();
        $manager->directPermissions()->attach(Permission::where('code', 'student_policies.manage')->value('id'), ['granted_by' => $manager->id]);
        $year = AcademicYear::factory()->create();
        Storage::disk('local')->put('student-policies/ar.pdf', '%PDF ar');
        Storage::disk('local')->put('student-policies/en.pdf', '%PDF en');
        $document = StudentPolicyDocument::factory()->create(['storage_path' => 'student-policies/ar.pdf', 'storage_path_en' => 'student-policies/en.pdf']);
        $campaign = StudentPolicyCampaign::factory()->for($document, 'document')->create(['academic_year_id' => $year->id]);

        $this->actingAs($manager)->deleteJson("/api/v1/student-policies/campaigns/{$campaign->id}", ['confirmation' => 'حذف الحملة'])->assertOk();
        $this->assertDatabaseMissing('student_policy_campaigns', ['id' => $campaign->id]);
        Storage::disk('local')->assertMissing('student-policies/ar.pdf');
        Storage::disk('local')->assertMissing('student-policies/en.pdf');

        $activeDocument = StudentPolicyDocument::factory()->create();
        $activeCampaign = StudentPolicyCampaign::factory()->for($activeDocument, 'document')->create(['academic_year_id' => $year->id, 'status' => 'published']);
        StudentPolicyAssignment::factory()->for($activeCampaign, 'campaign')->create(['opened_at' => now(), 'opened_ar_at' => now()]);
        $this->deleteJson("/api/v1/student-policies/campaigns/{$activeCampaign->id}", ['confirmation' => 'حذف الحملة'])->assertStatus(409);
        $this->assertDatabaseHas('student_policy_campaigns', ['id' => $activeCampaign->id]);
    }
}
