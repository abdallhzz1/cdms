<?php

namespace Tests\Feature;

use App\Mail\StudentPolicyOtpMail;
use App\Models\AcademicYear;
use App\Models\Student;
use App\Models\StudentPolicyAssignment;
use App\Models\StudentPolicyCampaign;
use App\Models\StudentPolicyDocument;
use App\Models\StudentPolicyOtpChallenge;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class PublicStudentPolicyTest extends TestCase
{
    use RefreshDatabase;

    public function test_student_must_verify_otp_and_open_exact_version_before_acknowledging(): void
    {
        Mail::fake(); Storage::fake('local');
        [$campaign, $student] = $this->publishedCampaign();

        $challengeToken = $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/request-otp", [
            'university_number' => $student->university_number,
        ])->assertOk()->json('data.challenge_token');

        $otp = null;
        Mail::assertSent(StudentPolicyOtpMail::class, function (StudentPolicyOtpMail $mail) use (&$otp) {
            $otp = $mail->otp; return true;
        });
        $this->assertNotNull($otp);
        $this->assertNotSame((string) $otp, (string) StudentPolicyOtpChallenge::latest()->value('otp_hash'));

        $accessToken = $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/verify-otp", [
            'challenge_token' => $challengeToken, 'otp' => $otp,
        ])->assertOk()->json('data.access_token');
        $this->assertNotSame($accessToken, StudentPolicyOtpChallenge::latest()->value('access_token_hash'));

        $payload = ['access_token' => $accessToken, 'typed_name' => $student->full_name_ar, 'paper_signature_understood' => true];
        $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/acknowledge", $payload)->assertUnprocessable();
        $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/document-opened", ['access_token' => $accessToken])->assertOk();
        $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/acknowledge", $payload)->assertOk();

        $assignment = StudentPolicyAssignment::firstOrFail();
        $this->assertSame('2026.1', $assignment->acknowledged_version);
        $this->assertSame(str_repeat('a', 64), $assignment->acknowledged_document_sha256);
    }

    public function test_unknown_number_receives_enumeration_safe_response(): void
    {
        Mail::fake(); Storage::fake('local'); [$campaign] = $this->publishedCampaign();
        $response = $this->postJson("/api/v1/public/student-policies/{$campaign->public_id}/request-otp", ['university_number' => '99999999']);
        $response->assertOk()->assertJsonPath('data.expires_in_seconds', 600);
        $this->assertSame(64, strlen($response->json('data.challenge_token')));
    }

    private function publishedCampaign(): array
    {
        Storage::disk('local')->put('student-policies/conduct.pdf', '%PDF-1.4 test');
        $year = AcademicYear::factory()->create();
        $student = Student::factory()->create(['academic_year_id' => $year->id, 'academic_level' => 'fourth', 'registration_status' => 'active']);
        $document = StudentPolicyDocument::factory()->create(['storage_path' => 'student-policies/conduct.pdf', 'version_label' => '2026.1', 'sha256' => str_repeat('a', 64)]);
        $campaign = StudentPolicyCampaign::factory()->for($document, 'document')->create(['academic_year_id' => $year->id, 'target_levels' => ['fourth'], 'status' => 'published', 'published_at' => now()]);
        StudentPolicyAssignment::factory()->for($campaign, 'campaign')->for($student)->create();
        return [$campaign->load('document'), $student];
    }
}
