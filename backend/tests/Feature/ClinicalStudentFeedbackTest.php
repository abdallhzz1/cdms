<?php

namespace Tests\Feature;

use App\Mail\ClinicalPortalOtpMail;
use App\Models\AcademicYear;
use App\Models\ClinicalAssessment;
use App\Models\ClinicalFeedbackWindow;
use App\Models\ClinicalPeriod;
use App\Models\Course;
use App\Models\CourseAssessmentComponent;
use App\Models\DistributionVersion;
use App\Models\Permission;
use App\Models\Person;
use App\Models\Role;
use App\Models\Rotation;
use App\Models\RotationBlock;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\TrainingSite;
use App\Models\User;
use App\Services\ClinicalStudentFeedback;
use App\Services\ClinicalStudentPortalIdentity;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

class ClinicalStudentFeedbackTest extends TestCase
{
    use RefreshDatabase;

    private User $director;

    private ClinicalFeedbackWindow $window;

    private RotationBlock $block;

    private DistributionVersion $version;

    private Person $supervisor;

    private TrainingSite $site;

    protected function setUp(): void
    {
        parent::setUp();
        $this->travelTo(now()->setDate(2026, 11, 26)->startOfDay());
        $this->withCredentials();
        $this->withHeaders(['Origin' => 'http://localhost', 'X-Requested-With' => 'XMLHttpRequest']);
        $this->seed([PermissionSeeder::class, RoleSeeder::class]);
        $this->director = $this->actor(['view', 'comments', 'moderate', 'manage', 'publish_marks']);
        $year = AcademicYear::factory()->create(['is_current' => true, 'start_date' => '2026-08-01', 'end_date' => '2027-07-31']);
        $course = Course::factory()->create(['academic_level' => 'fourth']);
        CourseAssessmentComponent::updateOrCreate(['course_id' => $course->id, 'code' => 'clinical'], ['name' => 'Clinical', 'max_score' => 20, 'weight' => 20, 'assessment_frequency' => 'weekly']);
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id, 'course_id' => $course->id, 'academic_level' => 'fourth', 'start_date' => '2026-08-02', 'end_date' => '2026-10-24', 'duration_weeks' => 12]);
        $this->window = ClinicalFeedbackWindow::create(['rotation_id' => $rotation->id, 'is_enabled' => true, 'from_week' => 1]);
        $this->block = RotationBlock::factory()->create(['rotation_id' => $rotation->id, 'from_week' => 1, 'to_week' => 1]);
        $this->version = DistributionVersion::create(['rotation_id' => $rotation->id, 'version_number' => 1, 'status' => 'published', 'is_current' => true, 'created_by' => $this->director->id]);
        $this->supervisor = Person::factory()->create();
        $this->site = TrainingSite::factory()->create();
    }

    private function actor(array $permissions, string $role = 'CLINICAL_DIRECTOR'): User
    {
        $user = User::factory()->create(['is_active' => true, 'assigned_levels' => ['fourth']]);
        $user->roles()->attach(Role::where('code', $role)->firstOrFail(), ['scope_type' => 'global']);
        $user->directPermissions()->attach(Permission::whereIn('code', array_map(fn ($p) => 'clinical_feedback.'.$p, $permissions))->pluck('id'));

        return $user;
    }

    private function pupil(bool $mark = true): Student
    {
        $student = Student::factory()->create(['academic_level' => 'fourth', 'registration_status' => 'active', 'academic_registration_status' => 'registered']);
        $assignment = StudentClinicalAssignment::create(['distribution_version_id' => $this->version->id, 'student_id' => $student->id, 'rotation_block_id' => $this->block->id, 'supervisor_id' => $this->supervisor->id, 'training_site_id' => $this->site->id]);
        if ($mark) {
            ClinicalAssessment::create(['student_id' => $student->id, 'student_clinical_assignment_id' => $assignment->id, 'evaluator_person_id' => $this->supervisor->id, 'assessment_kind' => 'weekly', 'evaluation_week' => 1, 'score' => 8, 'max_score' => 10, 'status' => 'submitted', 'notes' => 'Internal confidential note']);
        }

        return $student;
    }

    private function studentSession(Student $student): void
    {
        $token = Str::random(80);
        DB::table('clinical_portal_sessions')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addHour()]);
        $this->withCookie(ClinicalStudentPortalIdentity::COOKIE, $token);
    }

    private function key(Student $student): string
    {
        return app(ClinicalStudentFeedback::class)->catalog($student)->first()['key'];
    }

    private function participate(Student $student, string $comment = 'Useful training'): void
    {
        app(ClinicalStudentFeedback::class)->publishMarks($this->window, $this->director, 1, 12);
        app(ClinicalStudentFeedback::class)->participate($student, $this->key($student), 4, 5, $comment);
    }

    public function test_otp_is_mandatory_even_when_schedule_test_mode_is_enabled_and_sessions_can_be_revoked(): void
    {
        config(['group_registration.otp_enabled' => false]);
        Mail::fake();
        $student = $this->pupil();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertUnauthorized();
        $challenge = $this->postJson('/api/v1/public/clinical-student/request-otp', ['university_number' => $student->university_number])->assertOk()->json('data.challenge');
        $otp = null;
        Mail::assertSent(ClinicalPortalOtpMail::class, function ($mail) use (&$otp) {
            $otp = $mail->otp;

            return true;
        });
        $result = $this->postJson('/api/v1/public/clinical-student/verify-otp', ['challenge' => $challenge, 'otp' => $otp, 'remember' => true])->assertOk()->assertCookie(ClinicalStudentPortalIdentity::COOKIE);
        $cookie = collect($result->headers->getCookies())->first(fn ($c) => $c->getName() === ClinicalStudentPortalIdentity::COOKIE);
        $this->assertTrue($cookie->isHttpOnly());
        $this->assertSame('/api/v1/public/clinical-student', $cookie->getPath());
        $this->assertSame('lax', strtolower($cookie->getSameSite()));
        $this->postJson('/api/v1/public/clinical-student/verify-otp', ['challenge' => $challenge, 'otp' => $otp, 'remember' => true])->assertUnprocessable();
        $this->studentSession($student);
        $this->getJson('/api/v1/public/clinical-student/identity')->assertOk()->assertJsonPath('data.student.university_number', $student->university_number);
        $this->postJson('/api/v1/public/clinical-student/forget')->assertOk();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertUnauthorized();
    }

    public function test_wrong_otp_attempts_are_committed_and_unknown_numbers_have_the_same_response_shape(): void
    {
        Mail::fake();
        $student = $this->pupil();
        $known = $this->postJson('/api/v1/public/clinical-student/request-otp', ['university_number' => $student->university_number])->assertOk();
        $unknown = $this->postJson('/api/v1/public/clinical-student/request-otp', ['university_number' => '99999999'])->assertOk();
        $this->assertSame(array_keys($known->json('data')), array_keys($unknown->json('data')));
        $otp = null;
        Mail::assertSent(ClinicalPortalOtpMail::class, function ($mail) use (&$otp) {
            $otp = $mail->otp;

            return true;
        });
        $wrong = $otp === '000000' ? '111111' : '000000';
        for ($n = 0; $n < 5; $n++) {
            $this->postJson('/api/v1/public/clinical-student/verify-otp', ['challenge' => $known->json('data.challenge'), 'otp' => $wrong, 'remember' => false])->assertUnprocessable();
        }
        $this->assertSame(5, DB::table('clinical_portal_challenges')->where('student_id', $student->id)->value('attempts'));
        $this->postJson('/api/v1/public/clinical-student/verify-otp', ['challenge' => $known->json('data.challenge'), 'otp' => $otp, 'remember' => false])->assertUnprocessable();
        $this->assertDatabaseCount('clinical_portal_sessions', 0);
        $this->assertNotSame($otp, DB::table('clinical_portal_challenges')->where('student_id', $student->id)->value('otp_hash'));
    }

    public function test_real_verified_cookie_round_trip_is_independent_of_sanctum_domain_configuration(): void
    {
        config(['sanctum.stateful' => []]);
        Mail::fake();
        $student = $this->pupil();
        $challenge = $this->postJson('/api/v1/public/clinical-student/request-otp', ['university_number' => $student->university_number])->assertOk()->json('data.challenge');
        $otp = null;
        Mail::assertSent(ClinicalPortalOtpMail::class, function ($mail) use (&$otp) {
            $otp = $mail->otp;

            return true;
        });
        $verified = $this->postJson('/api/v1/public/clinical-student/verify-otp', ['challenge' => $challenge, 'otp' => $otp, 'remember' => false])->assertOk();
        $cookie = collect($verified->headers->getCookies())->first(fn ($c) => $c->getName() === ClinicalStudentPortalIdentity::COOKIE);
        $this->assertNotSame(DB::table('clinical_portal_sessions')->value('token_hash'), $cookie->getValue());
        $this->withUnencryptedCookie(ClinicalStudentPortalIdentity::COOKIE, $cookie->getValue());
        $this->getJson('/api/v1/public/clinical-student/identity')->assertOk()->assertJsonPath('data.student.university_number', $student->university_number);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonCount(0, 'data.slots')->assertJsonMissingPath('data.slots.0.mark');
        $this->travel(9)->hours();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertUnauthorized();
    }

    public function test_expired_credentials_are_pruned_without_removing_active_sessions_or_participation(): void
    {
        $student = $this->pupil();
        $this->participate($student);
        $this->studentSession($student);
        DB::table('clinical_portal_sessions')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', 'expired'), 'expires_at' => now()->subDays(31)]);
        DB::table('clinical_portal_challenges')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', 'challenge'), 'otp_hash' => 'expired-hash', 'attempts' => 0, 'expires_at' => now()->subDays(3)]);
        $this->artisan('clinical-portal:prune')->assertExitCode(0);
        $this->assertDatabaseCount('clinical_portal_sessions', 1);
        $this->assertDatabaseCount('clinical_portal_challenges', 0);
        $this->assertDatabaseCount('clinical_feedback_participations', 1);
        $this->assertDatabaseCount('clinical_feedback_answers', 1);
    }

    public function test_mail_failure_leaves_no_usable_challenge_and_no_student_details_in_the_response(): void
    {
        $student = $this->pupil();
        Mail::shouldReceive('to')->once()->andReturnSelf();
        Mail::shouldReceive('send')->once()->andThrow(new \RuntimeException('SMTP unavailable'));
        $response = $this->postJson('/api/v1/public/clinical-student/request-otp', ['university_number' => $student->university_number])->assertOk();
        $this->assertSame(['challenge'], array_keys($response->json('data')));
        $this->assertNotNull(DB::table('clinical_portal_challenges')->where('student_id', $student->id)->value('consumed_at'));
        $this->assertDatabaseCount('clinical_portal_sessions', 0);
    }

    public function test_verification_email_renders_in_the_selected_language(): void
    {
        app()->setLocale('ar');
        $arabic = (new ClinicalPortalOtpMail('123456'))->render();
        $this->assertStringContainsString('dir="rtl"', $arabic);
        $this->assertStringContainsString('رمز الدخول للتقييمات السريرية', $arabic);
        app()->setLocale('en');
        $english = (new ClinicalPortalOtpMail('123456'))->render();
        $this->assertStringContainsString('Your clinical assessments verification code', $english);
        $this->assertStringContainsString('123456', $english);
    }

    public function test_mark_publication_uses_bulk_queries_and_never_releases_future_or_superseded_assessments(): void
    {
        for ($i = 0; $i < 20; $i++) {
            $this->pupil();
        }
        DB::enableQueryLog();
        $count = app(ClinicalStudentFeedback::class)->publishMarks($this->window, $this->director, 1, 1);
        $queries = count(DB::getQueryLog());
        DB::disableQueryLog();
        $this->assertSame(20, $count);
        $this->assertLessThan(45, $queries);
        $this->version->update(['is_current' => false]);
        $student = Student::first();
        $this->studentSession($student);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonCount(0, 'data.slots');
        $this->version->update(['is_current' => true]);
        $this->window->rotation->update(['start_date' => '2026-12-01', 'end_date' => '2027-02-22']);
        $this->assertSame(0, app(ClinicalStudentFeedback::class)->publishMarks($this->window->fresh(), $this->director, 1, 12));
    }

    public function test_marks_are_omitted_until_published_and_participation_is_complete(): void
    {
        $student = $this->pupil();
        $this->studentSession($student);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonMissingPath('data.slots.0.mark');
        app(ClinicalStudentFeedback::class)->publishMarks($this->window, $this->director, 1, 1);
        $locked = $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.mark_ready', true)->assertJsonMissingPath('data.slots.0.mark');
        $this->assertStringNotContainsString('Internal confidential note', $locked->getContent());
        $this->postJson('/api/v1/public/clinical-student/participate', ['key' => $this->key($student), 'experience' => 4, 'supervision' => 5, 'comment' => 'A private comment', 'score' => 100, 'student_id' => 999])->assertOk();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.mark.score', 8)->assertJsonPath('data.slots.0.mark.max_score', 10)->assertHeader('Cache-Control', 'max-age=0, no-store, private');
        $this->assertDatabaseHas('clinical_assessments', ['student_id' => $student->id, 'score' => 8]);
    }

    public function test_foreign_slot_keys_are_denied_and_duplicate_submissions_do_not_rewrite_answers(): void
    {
        $student = $this->pupil();
        $other = $this->pupil();
        $this->studentSession($student);
        $payload = ['key' => $this->key($other), 'experience' => 4, 'supervision' => 5, 'comment' => 'Original'];
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertNotFound();
        app(ClinicalStudentFeedback::class)->publishMarks($this->window, $this->director, 1, 1);
        $payload['key'] = $this->key($student);
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertOk();
        $payload['comment'] = 'Replacement';
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertOk();
        $this->assertDatabaseCount('clinical_feedback_answers', 1);
        $this->assertDatabaseCount('clinical_feedback_participations', 1);
        $row = (array) DB::table('clinical_feedback_answers')->first();
        $this->assertSame('Original', Crypt::decryptString($row['private_comment']));
        foreach (['student_id', 'participation_id', 'assessment_id', 'created_at', 'submitted_at', 'ip_address', 'respondent_key'] as $key) {
            $this->assertArrayNotHasKey($key, $row);
        }
        $this->assertArrayNotHasKey('answer_id', (array) DB::table('clinical_feedback_participations')->first());
    }

    public function test_ungraded_published_week_waits_for_supervisor_before_feedback_and_zero_is_supported(): void
    {
        $student = $this->pupil(false);
        $this->studentSession($student);
        app(ClinicalStudentFeedback::class)->publishMarks($this->window, $this->director, 1, 12);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.status', 'not_evaluated')->assertJsonPath('data.slots.0.can_participate', false);
        $payload = ['key' => $this->key($student), 'experience' => 0, 'supervision' => 0];
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertNotFound();
        $this->assertDatabaseCount('clinical_feedback_participations', 0);
        $assignment = StudentClinicalAssignment::where('student_id', $student->id)->firstOrFail();
        ClinicalAssessment::create(['student_id' => $student->id, 'student_clinical_assignment_id' => $assignment->id, 'evaluator_person_id' => $this->supervisor->id, 'assessment_kind' => 'weekly', 'evaluation_week' => 1, 'score' => 8, 'max_score' => 10, 'status' => 'submitted']);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.status', 'feedback_required')->assertJsonMissingPath('data.slots.0.mark');
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertOk();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.mark.score', 8);
        $this->assertNull(DB::table('clinical_feedback_answers')->first()->experience);
        $this->assertNull(DB::table('clinical_feedback_answers')->first()->supervision);
    }

    public function test_legacy_snapshots_require_republication_of_corrections_without_another_response(): void
    {
        $student = $this->pupil();
        $service = app(ClinicalStudentFeedback::class);
        $service->publishMarks($this->window, $this->director, 1, 1);
        $this->participate($student);
        DB::table('clinical_week_publications')->delete();
        $this->studentSession($student);
        ClinicalAssessment::where('student_id', $student->id)->update(['score' => 9]);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonMissingPath('data.slots.0.mark');
        $service->publishMarks($this->window, $this->director, 1, 1);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonPath('data.slots.0.mark.score', 9)->assertJsonPath('data.slots.0.mark.revision', 2);
        ClinicalAssessment::where('student_id', $student->id)->update(['status' => 'returned']);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonMissingPath('data.slots.0.mark');
        $this->assertDatabaseCount('clinical_feedback_participations', 1);
    }

    public function test_each_response_is_visible_immediately_during_the_period_without_manual_release(): void
    {
        $service = app(ClinicalStudentFeedback::class);
        $this->window->rotation->update(['end_date' => '2026-12-01']);
        $first = $this->pupil();
        $this->participate($first, 'First immediate response');
        $this->actingAs($this->director);
        $report = $this->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.responses', 1)->assertJsonPath('data.0.experience', 4)->assertJsonPath('data.0.supervision', 5);
        $reportId = $report->json('data.0.id');
        $this->assertSame(['id', 'window_id', 'from_week', 'to_week', 'responses', 'supervisor_ar', 'supervisor_en', 'experience', 'supervision'], array_keys($report->json('data.0')));
        $comments = $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.text', 'First immediate response');
        $this->assertSame(['id', 'window_id', 'from_week', 'to_week', 'supervisor_ar', 'supervisor_en', 'text', 'version', 'reviewed_text', 'follow_up'], array_keys($comments->json('data.0')));
        $second = $this->pupil();
        $service->publishMarks($this->window, $this->director, 1, 12);
        $service->participate($second, $this->key($second), 2, 0, 'Second immediate response');
        $this->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $reportId)->assertJsonPath('data.0.responses', 2)->assertJsonPath('data.0.experience', 3)->assertJsonPath('data.0.supervision', 5);
        $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/clinical-student-feedback/options')->assertOk()->assertJsonPath('data.minimum_responses', 1);
        $this->postJson('/api/v1/clinical-student-feedback/windows/'.$this->window->id.'/reports')->assertOk()->assertJsonPath('data.published_batches', 0)->assertJsonPath('data.automatic', true);
        $this->assertDatabaseCount('clinical_feedback_batches', 0);
    }

    public function test_reviewer_cannot_read_their_own_feedback_even_with_all_permissions_and_other_readers_only_get_redacted_comments(): void
    {
        $this->participate($this->pupil(), 'Identifying original');
        $reader = $this->actor(['view', 'comments'], 'ADMIN_ASSISTANT');
        $this->actingAs($reader)->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(0, 'data');
        $this->actingAs($this->director);
        $rows = $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->json('data');
        $this->putJson('/api/v1/clinical-student-feedback/comments/'.$rows[0]['id'], ['version' => $rows[0]['version'], 'text' => 'Redacted copy', 'follow_up' => 'reviewed'])->assertOk();
        $this->putJson('/api/v1/clinical-student-feedback/comments/'.$rows[0]['id'], ['version' => $rows[0]['version'], 'text' => 'Stale overwrite', 'follow_up' => 'resolved'])->assertUnprocessable();
        $result = $this->actingAs($reader)->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.text', 'Redacted copy');
        $this->assertStringNotContainsString('Identifying original', $result->getContent());
        $this->putJson('/api/v1/clinical-student-feedback/comments/'.$rows[0]['id'], ['version' => $rows[0]['version'], 'text' => 'Overwrite', 'follow_up' => 'reviewed'])->assertForbidden();
        $this->supervisor->update(['user_id' => $this->director->id]);
        $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(0, 'data');
        $this->putJson('/api/v1/clinical-student-feedback/comments/'.$rows[0]['id'], ['version' => $rows[0]['version'], 'text' => 'Own', 'follow_up' => 'resolved'])->assertNotFound();
    }

    public function test_permissions_scope_and_same_origin_header_are_enforced(): void
    {
        $admin = $this->actor([], 'SYS_ADMIN');
        $this->actingAs($admin)->getJson('/api/v1/clinical-student-feedback/options')->assertForbidden();
        $rta = $this->actor(['view', 'manage'], 'RTA');
        $other = Rotation::factory()->create(['academic_level' => 'fifth', 'course_id' => Course::factory()->create(['academic_level' => 'fifth'])->id]);
        $otherWindow = ClinicalFeedbackWindow::create(['rotation_id' => $other->id, 'is_enabled' => true, 'from_week' => 1]);
        $this->actingAs($rta)->putJson('/api/v1/clinical-student-feedback/rotations/'.$other->id, ['is_enabled' => true, 'from_week' => 1])->assertNotFound();
        $this->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$otherWindow->id)->assertNotFound();
        $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertForbidden();
        $rta->directPermissions()->attach(Permission::where('code', 'clinical_feedback.comments')->value('id'));
        $this->actingAs($rta->fresh())->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$otherWindow->id)->assertNotFound();
        $this->postJson('/api/v1/clinical-student-feedback/windows/'.$this->window->id.'/marks', ['from_week' => 1, 'to_week' => 1])->assertForbidden();
        $this->withHeader('Origin', 'https://attacker.example')->postJson('/api/v1/public/clinical-student/forget')->assertForbidden();
        $this->withHeader('Origin', 'http://localhost:9999')->postJson('/api/v1/public/clinical-student/forget')->assertForbidden();
    }

    public function test_published_or_participating_students_cannot_be_force_deleted_and_ephemeral_sessions_do_not_block_other_deletions(): void
    {
        $student = $this->pupil();
        $this->participate($student);
        $this->director->directPermissions()->attach(Permission::where('code', 'students.delete')->value('id'));
        $this->actingAs($this->director)->deleteJson('/api/v1/students/'.$student->id, ['force' => true, 'confirmation' => $student->university_number, 'reason' => 'test deletion'])->assertUnprocessable();
        $this->assertDatabaseHas('students', ['id' => $student->id]);
        $this->assertDatabaseCount('clinical_feedback_answers', 1);
        $temporary = Student::factory()->create(['academic_level' => 'fourth']);
        $this->studentSession($temporary);
        $this->deleteJson('/api/v1/students/'.$temporary->id)->assertOk();
        $this->assertDatabaseMissing('clinical_portal_sessions', ['student_id' => $temporary->id]);
    }

    public function test_shared_network_does_not_merge_unverified_students_into_one_small_rate_bucket(): void
    {
        for ($n = 0; $n < 160; $n++) {
            $this->getJson('/api/v1/public/clinical-student/identity')->assertOk()->assertJsonPath('data.student', null);
        }
    }

    public function test_different_weeks_remain_separate_reports_even_for_one_student(): void
    {
        $this->block->update(['to_week' => 5]);
        $student = $this->pupil();
        $assignment = StudentClinicalAssignment::where('student_id', $student->id)->firstOrFail();
        foreach (range(2, 5) as $week) {
            ClinicalAssessment::create(['student_id' => $student->id, 'student_clinical_assignment_id' => $assignment->id, 'evaluator_person_id' => $this->supervisor->id, 'assessment_kind' => 'weekly', 'evaluation_week' => $week, 'score' => 8, 'max_score' => 10, 'status' => 'submitted']);
        }
        $service = app(ClinicalStudentFeedback::class);
        $service->publishMarks($this->window, $this->director, 1, 5);
        foreach ($service->catalog($student) as $slot) {
            $service->participate($student, $slot['key'], 5, 5, 'Same student');
        }
        $this->assertDatabaseCount('clinical_feedback_answers', 5);
        $rows = $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonCount(5, 'data')->json('data');
        $this->assertSame([1, 2, 3, 4, 5], array_column($rows, 'from_week'));
        $this->assertSame([1, 1, 1, 1, 1], array_column($rows, 'responses'));
    }

    public function test_schedule_deletion_preserves_feedback_history_even_without_any_marks(): void
    {
        $student = $this->pupil(false);
        DB::table('clinical_feedback_participations')->insert(['window_id' => $this->window->id, 'student_id' => $student->id, 'slot_key' => 'weekly:1', 'completed_on' => today()->toDateString()]);
        DB::table('clinical_feedback_answers')->insert(['id' => Str::uuid()->toString(), 'window_id' => $this->window->id, 'supervisor_id' => $this->supervisor->id, 'slot_key' => 'weekly:1', 'from_week' => 1, 'to_week' => 1, 'experience' => 4, 'supervision' => 5]);
        $this->version->update(['is_current' => false, 'status' => 'draft']);
        $this->director->directPermissions()->attach(Permission::where('code', 'distribution.delete')->value('id'));
        $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/options')->assertOk()->assertJsonPath('data.rotations.0.id', $this->window->rotation_id);
        $this->actingAs($this->director)->deleteJson('/api/v1/course-distribution/rotations/'.$this->window->rotation_id)->assertUnprocessable();
        $this->assertDatabaseHas('rotations', ['id' => $this->window->rotation_id]);
        $this->assertDatabaseCount('clinical_feedback_answers', 1);
        $this->assertDatabaseMissing('audit_logs', ['action' => 'course_schedule.deleted', 'entity_id' => $this->window->rotation_id]);
    }

    public function test_empty_window_configuration_does_not_prevent_an_otherwise_deletable_rotation(): void
    {
        $rotation = Rotation::factory()->create(['course_id' => $this->window->rotation->course_id]);
        $window = ClinicalFeedbackWindow::create(['rotation_id' => $rotation->id, 'is_enabled' => false, 'from_week' => 1]);
        $this->director->directPermissions()->attach(Permission::where('code', 'rotations.delete')->value('id'));
        $this->actingAs($this->director)->deleteJson('/api/v1/rotations/'.$rotation->id)->assertOk();
        $this->assertDatabaseMissing('clinical_feedback_windows', ['id' => $window->id]);
    }

    public function test_question_average_uses_available_ratings_without_treating_unable_to_assess_as_zero(): void
    {
        $service = app(ClinicalStudentFeedback::class);
        for ($n = 0; $n < 5; $n++) {
            $s = $this->pupil();
            $service->publishMarks($this->window, $this->director, 1, 1);
            $service->participate($s, $this->key($s), $n === 0 ? 1 : 0, 5, null);
        }
        $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonPath('data.0.experience', 1)->assertJsonPath('data.0.supervision', 5);
        DB::table('clinical_feedback_answers')->update(['experience' => null]);
        $this->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonPath('data.0.experience', null);
    }

    public function test_legacy_batched_and_waiting_answers_are_visible_together_without_backfill_or_duplicates(): void
    {
        $this->participate($this->pupil(), 'Already batched');
        $batchId = Str::uuid()->toString();
        DB::table('clinical_feedback_batches')->insert(['id' => $batchId, 'window_id' => $this->window->id, 'supervisor_id' => $this->supervisor->id, 'slot_key' => 'weekly:1', 'from_week' => 1, 'to_week' => 1, 'released_on' => today()->toDateString()]);
        DB::table('clinical_feedback_answers')->update(['batch_id' => $batchId]);
        $this->participate($this->pupil(), 'Previously waiting');
        $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/reports?window_id='.$this->window->id)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.responses', 2);
        $comments = $this->getJson('/api/v1/clinical-student-feedback/comments?window_id='.$this->window->id)->assertOk()->assertJsonCount(2, 'data');
        $this->assertEqualsCanonicalizing(['Already batched', 'Previously waiting'], array_column($comments->json('data'), 'text'));
        $this->assertDatabaseCount('clinical_feedback_batches', 1);
        $this->assertSame(1, DB::table('clinical_feedback_answers')->whereNull('batch_id')->count());
        $this->assertSame(1, DB::table('clinical_feedback_answers')->where('batch_id', $batchId)->count());
    }

    public function test_period_assessment_is_one_slot_and_drafts_and_mini_osce_are_not_published(): void
    {
        $student = $this->pupil();
        $this->block->update(['to_week' => 6]);
        CourseAssessmentComponent::where('course_id', $this->window->rotation->course_id)->update(['assessment_frequency' => 'period']);
        $assessment = ClinicalAssessment::where('student_id', $student->id)->first();
        $assessment->update(['assessment_kind' => 'period', 'evaluation_week' => null, 'week_start' => '2026-08-02', 'week_end' => '2026-09-12', 'status' => 'draft']);
        $service = app(ClinicalStudentFeedback::class);
        $this->assertCount(1, $service->catalog($student));
        $this->assertSame('period', $service->catalog($student)->first()['kind']);
        $this->assertSame(0, $service->publishMarks($this->window, $this->director, 1, 12));
        $assessment->update(['status' => 'submitted']);
        $this->assertSame(1, $service->publishMarks($this->window, $this->director, 1, 12));
        $this->assertDatabaseCount('clinical_mark_releases', 1);
    }

    public function test_published_weeks_persist_for_future_and_late_assessments_without_premature_feedback_or_marks(): void
    {
        $this->window->rotation->update(['start_date' => '2026-11-22', 'end_date' => '2027-02-13']);
        $this->block->update(['to_week' => 12]);
        $student = $this->pupil();
        $service = app(ClinicalStudentFeedback::class);
        $this->actingAs($this->director)->postJson('/api/v1/clinical-student-feedback/windows/'.$this->window->id.'/marks', ['from_week' => 1, 'to_week' => 12])->assertOk()->assertJsonPath('data.published', 0);
        $this->assertDatabaseCount('clinical_week_publications', 12);
        $this->assertDatabaseCount('clinical_mark_releases', 0);
        $this->studentSession($student);
        $slots = collect($this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonCount(12, 'data.slots')->json('data.slots'))->keyBy('from_week');
        $this->assertSame('awaiting_week_end', $slots[1]['status']);
        $this->assertSame('not_evaluated', $slots[2]['status']);
        $this->assertFalse($slots[1]['can_participate']);
        $this->assertArrayNotHasKey('mark', $slots[1]);
        $this->postJson('/api/v1/public/clinical-student/participate', ['key' => $slots[1]['key'], 'experience' => 4, 'supervision' => 5])->assertNotFound();
        $this->travel(14)->days();
        $this->studentSession($student);
        $assignment = StudentClinicalAssignment::where('student_id', $student->id)->firstOrFail();
        $late = ClinicalAssessment::create(['student_id' => $student->id, 'student_clinical_assignment_id' => $assignment->id, 'evaluator_person_id' => $this->supervisor->id, 'assessment_kind' => 'weekly', 'evaluation_week' => 2, 'score' => 9, 'max_score' => 10, 'status' => 'draft']);
        $payload = ['key' => $slots[2]['key'], 'experience' => 4, 'supervision' => 5];
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertNotFound();
        $late->update(['status' => 'submitted']);
        $ready = collect($service->forStudent($student))->keyBy('from_week')[2];
        $this->assertSame('feedback_required', $ready['status']);
        $this->assertArrayNotHasKey('mark', $ready);
        $this->postJson('/api/v1/public/clinical-student/participate', $payload)->assertOk();
        $visible = collect($service->forStudent($student))->keyBy('from_week')[2];
        $this->assertSame('visible', $visible['status']);
        $this->assertSame(9.0, $visible['mark']['score']);
        $late->update(['status' => 'returned']);
        $returned = collect($service->forStudent($student))->keyBy('from_week')[2];
        $this->assertSame('not_evaluated', $returned['status']);
        $this->assertArrayNotHasKey('mark', $returned);
        $late->update(['status' => 'approved', 'score' => 10]);
        $corrected = collect($service->forStudent($student))->keyBy('from_week')[2];
        $this->assertSame(10.0, $corrected['mark']['score']);
        $this->assertFalse($corrected['can_participate']);
        $this->assertDatabaseCount('clinical_feedback_participations', 1);
        $this->assertDatabaseCount('clinical_mark_releases', 0);
        $this->assertDatabaseCount('clinical_week_publications', 12);
    }

    public function test_publication_bounds_and_start_week_are_enforced_and_unpublished_slots_cannot_accept_feedback(): void
    {
        $this->block->update(['to_week' => 3]);
        $student = $this->pupil();
        $this->actingAs($this->director);
        $url = '/api/v1/clinical-student-feedback/windows/'.$this->window->id.'/marks';
        $this->postJson($url, ['from_week' => 1, 'to_week' => 13])->assertUnprocessable();
        $this->assertDatabaseCount('clinical_week_publications', 0);
        $this->postJson($url, ['from_week' => 2, 'to_week' => 2])->assertOk();
        $this->postJson($url, ['from_week' => 2, 'to_week' => 2])->assertOk();
        $this->assertDatabaseCount('clinical_week_publications', 1);
        $this->studentSession($student);
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonCount(1, 'data.slots')->assertJsonPath('data.slots.0.from_week', 2)->assertJsonPath('data.slots.0.status', 'not_evaluated');
        $this->postJson('/api/v1/public/clinical-student/participate', ['key' => $this->key($student), 'experience' => 4, 'supervision' => 5])->assertNotFound();
        $this->window->update(['from_week' => 3]);
        $this->postJson($url, ['from_week' => 1, 'to_week' => 2])->assertUnprocessable();
        $this->window->update(['is_enabled' => false]);
        $this->postJson($url, ['from_week' => 3, 'to_week' => 3])->assertUnprocessable();
        $this->postJson('/api/v1/public/clinical-student/marks')->assertOk()->assertJsonCount(0, 'data.slots');
        $this->assertDatabaseCount('clinical_feedback_participations', 0);
    }

    public function test_period_metadata_groups_courses_and_cohorts_under_the_same_period_without_mixing_years(): void
    {
        $rotation = $this->window->rotation;
        $period = ClinicalPeriod::create(['academic_year_id' => $rotation->academic_year_id, 'code' => 'P1', 'sequence' => 1, 'name_ar' => 'الفترة السريرية الأولى', 'name_en' => 'Clinical period one', 'start_date' => '2026-08-02', 'end_date' => '2026-10-24', 'weeks_count' => 12, 'status' => 'active']);
        $rotation->update(['clinical_period_id' => $period->id]);
        $second = Rotation::factory()->create(['academic_year_id' => $rotation->academic_year_id, 'clinical_period_id' => $period->id, 'academic_level' => 'fifth', 'course_id' => Course::factory()->create(['academic_level' => 'fifth'])->id]);
        ClinicalFeedbackWindow::create(['rotation_id' => $second->id, 'is_enabled' => false, 'from_week' => 1]);
        $otherYear = Rotation::factory()->create(['academic_level' => 'fourth', 'course_id' => $rotation->course_id]);
        ClinicalFeedbackWindow::create(['rotation_id' => $otherYear->id, 'is_enabled' => false, 'from_week' => 1]);
        $rows = collect($this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/options')->assertOk()->json('data.rotations'))->keyBy('id');
        $this->assertSame($rows[$rotation->id]['period_key'], $rows[$second->id]['period_key']);
        $this->assertNotSame($rows[$rotation->id]['period_key'], $rows[$otherYear->id]['period_key']);
        $this->assertSame('Clinical period one', $rows[$second->id]['period_en']);
        $student = $this->pupil();
        $service = app(ClinicalStudentFeedback::class);
        $service->publishMarks($this->window->fresh(), $this->director, 1, 12);
        $this->assertSame($rows[$rotation->id]['period_key'], $service->forStudent($student)[0]['period_key']);
    }

    public function test_staff_testing_routes_permissions_and_tables_have_been_removed(): void
    {
        $this->assertFalse(Schema::hasTable('clinical_feedback_test_runs'));
        $this->assertFalse(Schema::hasTable('clinical_feedback_test_answers'));
        $this->assertSame(0, Permission::whereIn('code', ['clinical_feedback.test', 'clinical_feedback.delete_test'])->count());
        $this->actingAs($this->director)->getJson('/api/v1/clinical-student-feedback/test-runs')->assertNotFound();
        $this->getJson('/api/v1/clinical-student-feedback/test-students?search=22')->assertNotFound();
        $this->postJson('/api/v1/clinical-student-feedback/test-runs', ['student_id' => 1])->assertNotFound();
    }

    public function test_removal_cleans_existing_staff_tests_and_grants_and_preserves_real_feedback_and_marks(): void
    {
        $student = $this->pupil();
        $this->participate($student, 'Real student response');
        $install = require database_path('migrations/2026_11_26_190000_add_clinical_feedback_testing.php');
        $install->up();
        $this->director->directPermissions()->attach(Permission::where('code', 'clinical_feedback.test')->value('id'));
        $runId = Str::uuid()->toString();
        DB::table('clinical_feedback_test_runs')->insert(['id' => $runId, 'created_by' => $this->director->id, 'student_id' => $student->id, 'expires_at' => now()->addHour(), 'created_at' => now(), 'updated_at' => now()]);
        DB::table('clinical_feedback_test_answers')->insert(['id' => Str::uuid()->toString(), 'test_run_id' => $runId, 'window_id' => $this->window->id, 'slot_key' => 'weekly:1', 'experience' => 5, 'supervision' => 5]);
        $permissionIds = Permission::whereIn('code', ['clinical_feedback.test', 'clinical_feedback.delete_test'])->pluck('id');
        $remove = require database_path('migrations/2026_11_26_200000_remove_clinical_feedback_testing.php');
        $remove->up();
        $remove->up();
        $this->assertFalse(Schema::hasTable('clinical_feedback_test_runs'));
        $this->assertFalse(Schema::hasTable('clinical_feedback_test_answers'));
        $this->assertSame(0, DB::table('role_permissions')->whereIn('permission_id', $permissionIds)->count());
        $this->assertSame(0, DB::table('user_permission_grants')->whereIn('permission_id', $permissionIds)->count());
        $this->assertDatabaseCount('clinical_feedback_answers', 1);
        $this->assertDatabaseCount('clinical_feedback_participations', 1);
        $this->assertDatabaseHas('clinical_assessments', ['student_id' => $student->id, 'score' => 8, 'status' => 'submitted']);
        $this->assertSame(8.0, app(ClinicalStudentFeedback::class)->forStudent($student)[0]['mark']['score']);
    }
}
