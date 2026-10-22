<?php

namespace Tests\Feature;

use App\Models\AcademicYear;
use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyDocument;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicStudentPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_published_documents_can_be_downloaded_without_student_identity(): void
    {
        Storage::fake('local');
        [$campaign] = $this->publishedCampaign();

        $this->getJson("/api/v1/public/student-policies/{$campaign->public_id}")
            ->assertOk()->assertJsonPath('data.has_english_document', true);
        $this->get("/api/v1/public/student-policies/{$campaign->public_id}/document?language=ar")
            ->assertOk()->assertDownload('student-policy-ar.pdf');
        $this->get("/api/v1/public/student-policies/{$campaign->public_id}/document?language=en")
            ->assertOk()->assertDownload('student-policy-en.pdf');
        $this->assertNull(StudentPolicyAssignment::firstOrFail()->opened_at);
    }

    public function test_old_identity_and_acknowledgement_routes_are_unavailable(): void
    {
        Storage::fake('local'); [$campaign] = $this->publishedCampaign();
        foreach (['request-otp', 'verify-otp', 'document-opened', 'acknowledge'] as $path) {
            $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/{$path}")->assertNotFound();
        }
    }

    public function test_draft_and_closed_documents_are_not_public(): void
    {
        Storage::fake('local'); [$campaign] = $this->publishedCampaign();
        foreach (['draft', 'closed'] as $status) {
            $campaign->update(['status' => $status]);
            $this->get("/api/v1/public/student-policies/{$campaign->public_id}/document?language=ar")->assertNotFound();
        }
    }

    private function publishedCampaign(): array
    {
        Storage::disk('local')->put('student-policies/conduct.pdf', '%PDF-1.4 test');
        Storage::disk('local')->put('student-policies/conduct-en.pdf', '%PDF-1.4 English test');
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']);
        $document = StudentPolicyDocument::factory()->create(['storage_path' => 'student-policies/conduct.pdf', 'version_label' => '2026.1', 'sha256' => str_repeat('a', 64),
            'storage_path_en' => 'student-policies/conduct-en.pdf', 'original_name_en' => 'conduct-en.pdf', 'mime_type_en' => 'application/pdf',
            'size_bytes_en' => 100, 'sha256_en' => str_repeat('b', 64)]);
        $campaign = StudentPolicyCampaign::factory()->for($document, 'document')->create(['academic_year_id' => $year->id, 'target_levels' => ['fourth'], 'status' => 'published', 'published_at' => now()]);
        StudentPolicyAssignment::factory()->for($campaign, 'campaign')->for($student)->create();
        return [$campaign->load('document'), $student];
    }
}
