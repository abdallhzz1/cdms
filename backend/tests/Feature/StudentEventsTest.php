<?php

namespace Tests\Feature;

use App\Models\AuditLog;
use App\Models\Permission;
use App\Models\Role;
use App\Models\Student;
use App\Models\StudentEvent;
use App\Models\StudentScheduleOtpChallenge;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class StudentEventsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow('2026-10-21 12:00:00');
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class]);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function admin(): User
    {
        $user = User::factory()->create();
        $user->roles()->attach(Role::where('code', 'SYS_ADMIN')->firstOrFail());
        return $user;
    }

    private function payload(): array
    {
        return ['type' => 'seminar', 'title_ar' => 'ندوة طبية', 'title_en' => 'Medical Seminar',
            'location_ar' => 'قاعة الكلية', 'location_en' => 'Faculty Hall',
            'starts_at' => '2026-10-21 11:00:00', 'ends_at' => '2026-10-21 13:00:00',
            'eligible_levels' => ['fourth', 'fifth']];
    }

    private function published(): StudentEvent
    {
        $id = $this->actingAs($this->admin())->postJson('/api/v1/student-events', $this->payload())
            ->assertCreated()->json('data.id');
        $this->postJson("/api/v1/student-events/$id/status", ['status' => 'published'])->assertOk();
        $this->postJson("/api/v1/student-events/$id/check-in", ['enabled' => true])->assertOk();
        return StudentEvent::findOrFail($id);
    }

    private function basicStudent(string $number, string $level, string $year = '2026/2027'): int
    {
        DB::table('academic_years')->updateOrInsert(['code' => '2026/2027'], [
            'start_date' => '2026-09-01', 'end_date' => '2027-08-31', 'is_current' => true,
            'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $course = DB::table('basic_courses')->insertGetId(['code' => 'BASIC-'.$level.'-'.$number,
            'name' => 'Basic course', 'academic_level' => $level, 'is_active' => true,
            'created_at' => now(), 'updated_at' => now()]);
        $section = DB::table('basic_sections')->insertGetId(['course_id' => $course, 'number' => '1',
            'academic_year' => $year, 'semester' => 'first', 'is_active' => true,
            'created_at' => now(), 'updated_at' => now()]);
        $student = DB::table('basic_students')->insertGetId(['university_number' => $number,
            'name' => 'طالب الأساسية '.$number, 'email' => $number.'@students.hebron.edu',
            'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('basic_enrollments')->insert(['section_id' => $section, 'student_id' => $student,
            'is_active' => true, 'created_at' => now(), 'updated_at' => now()]);
        return $student;
    }

    public function test_basic_students_in_all_three_years_can_use_event_qr_and_share_one_register_with_clinical_students(): void
    {
        Mail::fake();
        $payload = $this->payload();
        $payload['eligible_levels'] = ['first', 'second', 'third', 'fourth'];
        $id = $this->actingAs($this->admin())->postJson('/api/v1/student-events', $payload)->assertCreated()->json('data.id');
        $this->postJson("/api/v1/student-events/$id/status", ['status' => 'published'])->assertOk();
        $this->postJson("/api/v1/student-events/$id/check-in", ['enabled' => true])->assertOk();
        $clinical = Student::factory()->forLevel('fourth')->create();
        $this->postJson("/api/v1/student-events/$id/attendance", [
            'university_number' => $clinical->university_number, 'reason' => 'Clinical student attended the event',
        ])->assertOk();

        foreach (['first', 'second', 'third'] as $index => $level) {
            $number = '2610000'.($index + 1);
            $basicId = $this->basicStudent($number, $level);
            $token = $this->getJson("/api/v1/student-events/$id/qr")->assertOk()->json('data.token');
            $begin = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
            $intent = $begin->json('data.intent');
            $this->withCredentials()->withUnencryptedCookie('cdms_student_event_scan', $begin->headers->getCookies()[0]->getValue());
            $challenge = $this->postJson('/api/v1/public/student-events/request-otp', [
                'intent' => $intent, 'university_number' => $number,
            ])->assertOk()->json('data.challenge_token');
            $this->assertDatabaseHas('basic_otp_challenges', ['student_id' => $basicId, 'student_event_id' => $id]);
            DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $challenge))
                ->update(['otp_hash' => Hash::make('123456')]);
            $this->postJson('/api/v1/public/student-events/verify-otp', [
                'challenge_token' => $challenge, 'otp' => '000000',
            ])->assertUnprocessable();
            $access = $this->postJson('/api/v1/public/student-events/verify-otp', [
                'challenge_token' => $challenge, 'otp' => '123456',
            ])->assertOk()->json('data.access_token');
            $this->withUnencryptedCookie('basic_attendance_device', $access);
            $this->postJson('/api/v1/public/student-events/check-in', [
                'intent' => $intent, 'access_token' => $access,
            ])->assertOk()->assertJsonPath('data.already_recorded', false);
            $this->assertDatabaseHas('student_event_attendances', [
                'student_event_id' => $id, 'student_id' => null, 'basic_student_id' => $basicId,
                'university_number' => $number, 'academic_level' => $level,
            ]);
            $again = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
            $this->withUnencryptedCookie('cdms_student_event_scan', $again->headers->getCookies()[0]->getValue());
            $this->postJson('/api/v1/public/student-events/identity', [
                'intent' => $again->json('data.intent'),
            ])->assertOk()->assertJsonPath('data.university_number', $number);
            $this->postJson('/api/v1/public/student-events/check-in', [
                'intent' => $again->json('data.intent'),
            ])->assertOk()->assertJsonPath('data.already_recorded', true);
        }

        $this->getJson("/api/v1/student-events/$id/attendance")->assertOk()
            ->assertJsonPath('data.total', 4)
            ->assertJsonFragment(['academic_level' => 'third', 'university_number' => '26100003']);
        $this->assertDatabaseCount('student_event_attendances', 4);
        $this->assertDatabaseCount('basic_lecture_records', 0);
    }

    public function test_basic_student_requires_active_current_year_enrollment_and_eligible_event_year(): void
    {
        Mail::fake();
        $event = $this->published();
        $basicId = $this->basicStudent('26100100', 'first');
        $pastId = $this->basicStudent('26100101', 'second', '2025/2026');
        $token = $this->getJson("/api/v1/student-events/{$event->id}/qr")->json('data.token');
        $begin = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
        $this->withCredentials()->withUnencryptedCookie('cdms_student_event_scan', $begin->headers->getCookies()[0]->getValue());
        $this->postJson('/api/v1/public/student-events/request-otp', [
            'intent' => $begin->json('data.intent'), 'university_number' => '26100100',
        ])->assertUnprocessable();
        StudentEvent::findOrFail($event->id)->update(['eligible_levels' => ['first', 'second']]);
        $this->postJson('/api/v1/public/student-events/request-otp', [
            'intent' => $begin->json('data.intent'), 'university_number' => '26100101',
        ])->assertUnprocessable();
        DB::table('basic_enrollments')->where('student_id', $basicId)->update(['is_active' => false]);
        $this->postJson('/api/v1/public/student-events/request-otp', [
            'intent' => $begin->json('data.intent'), 'university_number' => '26100100',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('student_event_attendances', 0);
        $this->assertDatabaseHas('basic_students', ['id' => $pastId]);
    }

    public function test_basic_manual_correction_can_be_voided_and_readded_without_duplicate_or_course_absence(): void
    {
        $event = $this->published();
        $event->update(['eligible_levels' => ['second']]);
        $basicId = $this->basicStudent('26100200', 'second');
        $record = $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => '26100200', 'reason' => 'Verified against the signed paper list',
        ])->assertOk()->json('data.id');
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => '26100200', 'reason' => 'Verified against the signed paper list',
        ])->assertOk()->assertJsonPath('data.id', $record);
        $this->postJson("/api/v1/student-events/{$event->id}/attendance/$record/void", [
            'reason' => 'Correction requested by event organizer',
        ])->assertOk();
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => '26100200', 'reason' => 'Verified against the signed paper list',
        ])->assertOk()->assertJsonPath('data.id', $record);
        $this->assertDatabaseHas('student_event_attendances', ['id' => $record,
            'basic_student_id' => $basicId, 'voided_at' => null]);
        $this->assertDatabaseCount('student_event_attendances', 1);
        $this->assertDatabaseCount('basic_lecture_records', 0);
    }

    public function test_same_number_in_basic_and_clinical_directories_requires_administrator_review(): void
    {
        $event = $this->published();
        $event->update(['eligible_levels' => ['first', 'fourth']]);
        $clinical = Student::factory()->forLevel('fourth')->create();
        $this->basicStudent($clinical->university_number, 'first');
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => $clinical->university_number, 'reason' => 'Attempt to manually add ambiguous identity',
        ])->assertUnprocessable();
        $this->assertDatabaseCount('student_event_attendances', 0);
    }

    public function test_only_authorized_staff_can_create_and_display_a_short_lived_qr(): void
    {
        $this->actingAs(User::factory()->create())->postJson('/api/v1/student-events', $this->payload())->assertForbidden();
        $event = $this->published();
        $token = $this->getJson("/api/v1/student-events/{$event->id}/qr")->assertOk()->json('data.token');
        $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])
            ->assertOk()->assertJsonPath('data.event.title_en', 'Medical Seminar');
        Carbon::setTestNow('2026-10-21 12:01:00');
        $this->withHeader('Accept-Language', 'en')->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])
            ->assertUnprocessable()->assertJsonPath('message', 'This code expired. Scan the refreshed code on the screen.');
        $this->assertDatabaseHas('audit_logs', ['action' => 'student_event.status_changed', 'entity_id' => $event->id]);
    }

    public function test_email_verification_eligibility_and_unique_qr_attendance(): void
    {
        Mail::fake();
        $event = $this->published();
        $eligible = Student::factory()->forLevel('fourth')->create();
        $ineligible = Student::factory()->forLevel('sixth')->create();
        $token = $this->getJson("/api/v1/student-events/{$event->id}/qr")->json('data.token');
        $begin = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
        $intent = $begin->json('data.intent');
        $this->assertSame('cdms_student_event_scan', $begin->headers->getCookies()[0]->getName());
        $this->assertSame(80, strlen($begin->headers->getCookies()[0]->getValue()));
        $this->postJson('/api/v1/public/student-events/check-in', ['intent' => $intent])->assertUnprocessable();
        $this->withCredentials()->withUnencryptedCookie('cdms_student_event_scan', $begin->headers->getCookies()[0]->getValue());
        $this->postJson('/api/v1/public/student-events/check-in', ['intent' => $intent])->assertUnauthorized();
        $this->withHeader('Accept-Language', 'en')->postJson('/api/v1/public/student-events/request-otp',
            ['intent' => $intent, 'university_number' => $ineligible->university_number])
            ->assertUnprocessable()->assertJsonPath('message', 'This event is not open to your academic year.');
        $challengeToken = $this->postJson('/api/v1/public/student-events/request-otp',
            ['intent' => $intent, 'university_number' => $eligible->university_number])->assertOk()->json('data.challenge_token');
        $challenge = StudentScheduleOtpChallenge::where('challenge_token_hash', hash('sha256', $challengeToken))->firstOrFail();
        $challenge->update(['otp_hash' => Hash::make('123456')]);
        $this->postJson('/api/v1/public/student-events/verify-otp',
            ['challenge_token' => $challengeToken, 'otp' => '000000'])->assertUnprocessable();
        $access = $this->postJson('/api/v1/public/student-events/verify-otp',
            ['challenge_token' => $challengeToken, 'otp' => '123456'])->assertOk()->json('data.access_token');
        $this->postJson('/api/v1/public/student-events/check-in', ['intent' => $intent, 'access_token' => $access])
            ->assertOk()->assertJsonPath('data.already_recorded', false);
        $this->assertDatabaseCount('student_event_attendances', 1);
        $secondBegin = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
        $newIntent = $secondBegin->json('data.intent');
        $this->withUnencryptedCookie('cdms_student_event_scan', $secondBegin->headers->getCookies()[0]->getValue());
        $this->postJson('/api/v1/public/student-events/check-in', ['intent' => $newIntent, 'access_token' => $access])
            ->assertOk()->assertJsonPath('data.already_recorded', true);
        $this->assertDatabaseCount('student_event_attendances', 1);
        $this->assertSame(1, AuditLog::where('action', 'student_event.qr_check_in')->count());
    }

    public function test_manual_correction_is_audited_and_archiving_preserves_the_register(): void
    {
        $event = $this->published();
        $student = Student::factory()->forLevel('fifth')->create();
        $id = $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => $student->university_number, 'reason' => 'تأكيد الحضور من القائمة الورقية',
        ])->assertOk()->json('data.id');
        $this->postJson("/api/v1/student-events/{$event->id}/attendance/$id/void", [
            'reason' => 'إدخال الطالب بالخطأ في الكشف',
        ])->assertOk();
        $this->getJson("/api/v1/student-events/{$event->id}/attendance")->assertJsonCount(0, 'data.data');
        $this->postJson("/api/v1/student-events/{$event->id}/status", [
            'status' => 'archived', 'reason' => 'إلغاء الندوة لأسباب تنظيمية',
        ])->assertOk();
        $this->assertDatabaseHas('student_event_attendances', ['id' => $id, 'student_id' => $student->id]);
        $this->assertDatabaseHas('audit_logs', ['action' => 'student_event.attendance_voided', 'entity_id' => $event->id]);
        $this->getJson("/api/v1/student-events/{$event->id}/qr")->assertUnprocessable();
    }

    public function test_attended_event_cannot_change_schedule_and_delete_requires_reason_and_exact_title(): void
    {
        $event = $this->published();
        $student = Student::factory()->forLevel('fourth')->create();
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => $student->university_number, 'reason' => 'تم إثبات الحضور من المنظم',
        ])->assertOk();
        $changed = $this->payload();
        $changed['eligible_levels'] = ['sixth'];
        $this->putJson("/api/v1/student-events/{$event->id}", $changed)->assertUnprocessable();
        $this->deleteJson("/api/v1/student-events/{$event->id}")->assertUnprocessable();
        $this->deleteJson("/api/v1/student-events/{$event->id}", [
            'confirmation' => 'wrong title', 'reason' => 'Administrative correction',
        ])->assertUnprocessable();
        $draftId = $this->postJson('/api/v1/student-events', $this->payload())->assertCreated()->json('data.id');
        $this->deleteJson("/api/v1/student-events/$draftId", [
            'confirmation' => 'ندوة طبية', 'reason' => 'Duplicated draft created by mistake',
        ])->assertOk();
        $this->assertDatabaseMissing('student_events', ['id' => $draftId]);
        $this->deleteJson("/api/v1/student-events/{$event->id}", [
            'confirmation' => 'ندوة طبية', 'reason' => 'This published event was entered twice',
        ])->assertOk();
        $this->assertDatabaseMissing('student_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('student_event_attendances', ['student_event_id' => $event->id]);
        $audit = AuditLog::where('action', 'student_event.deleted')->where('entity_id', $event->id)->firstOrFail();
        $this->assertSame($student->id, $audit->changes['attendance_snapshot'][0]['student_id']);
    }

    public function test_view_permission_does_not_allow_management_or_attendance_corrections(): void
    {
        $event = $this->published();
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        $role->permissions()->syncWithoutDetaching([
            Permission::where('code', 'student_events.view')->firstOrFail()->id => ['scope_type' => 'global'],
        ]);
        $viewer = User::factory()->create();
        $viewer->roles()->attach($role);
        $this->actingAs($viewer)->getJson('/api/v1/student-events')->assertOk();
        $this->postJson('/api/v1/student-events', $this->payload())->assertForbidden();
        $this->getJson("/api/v1/student-events/{$event->id}/qr")->assertForbidden();
        $this->post("/api/v1/student-events/{$event->id}/poster", [
            'poster' => UploadedFile::fake()->image('not-allowed.png'),
        ], ['Accept' => 'application/json'])->assertForbidden();
        $this->deleteJson("/api/v1/student-events/{$event->id}/poster")->assertForbidden();
        $this->postJson("/api/v1/student-events/{$event->id}/check-in", ['enabled' => false])->assertForbidden();
        $this->deleteJson("/api/v1/student-events/{$event->id}", [
            'confirmation' => 'ندوة طبية', 'reason' => 'No delete permission assigned',
        ])->assertForbidden();
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => '22000001', 'reason' => 'تصحيح إداري موثق',
        ])->assertForbidden();
    }

    public function test_publishing_stays_closed_and_authorized_organizer_controls_qr_outside_schedule(): void
    {
        $admin = $this->admin();
        $id = $this->actingAs($admin)->postJson('/api/v1/student-events', $this->payload())
            ->assertCreated()->json('data.id');
        $this->postJson("/api/v1/student-events/$id/status", ['status' => 'published'])->assertOk()
            ->assertJsonPath('data.check_in_enabled', false);
        $this->getJson("/api/v1/student-events/$id/qr")->assertUnprocessable();
        Carbon::setTestNow('2026-10-22 09:00:00');
        $this->postJson("/api/v1/student-events/$id/check-in", ['enabled' => true])->assertOk()
            ->assertJsonPath('data.check_in_enabled', true);
        $token = $this->getJson("/api/v1/student-events/$id/qr")->assertOk()->json('data.token');
        $begin = $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk();
        $this->postJson("/api/v1/student-events/$id/check-in", ['enabled' => false])->assertOk()
            ->assertJsonPath('data.check_in_enabled', false);
        $this->getJson("/api/v1/student-events/$id/qr")->assertUnprocessable();
        $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertUnprocessable();
        $this->withCredentials()->withUnencryptedCookie('cdms_student_event_scan', $begin->headers->getCookies()[0]->getValue());
        $this->postJson('/api/v1/public/student-events/request-otp', [
            'intent' => $begin->json('data.intent'), 'university_number' => '22000001',
        ])->assertUnprocessable();
        $this->postJson('/api/v1/public/student-events/check-in', [
            'intent' => $begin->json('data.intent'),
        ])->assertUnprocessable();
        $this->assertDatabaseHas('audit_logs', ['action' => 'student_event.check_in_closed', 'entity_id' => $id]);
    }

    public function test_archived_event_with_attendance_can_be_deleted_by_delete_permission(): void
    {
        $event = $this->published();
        $student = Student::factory()->forLevel('fourth')->create();
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => $student->university_number, 'reason' => 'Administrative attendance correction',
        ])->assertOk();
        $this->postJson("/api/v1/student-events/{$event->id}/status", [
            'status' => 'archived', 'reason' => 'This event has ended and is archived',
        ])->assertOk()->assertJsonPath('data.check_in_enabled', false);
        $this->deleteJson("/api/v1/student-events/{$event->id}", [
            'confirmation' => $event->title_en, 'reason' => 'Administrative permanent deletion requested',
        ])->assertOk();
        $this->assertDatabaseMissing('student_events', ['id' => $event->id]);
        $this->assertDatabaseMissing('student_event_attendances', ['student_event_id' => $event->id]);
    }

    public function test_management_permission_alone_cannot_delete_but_matrix_delete_grant_can(): void
    {
        $event = $this->published();
        $role = Role::where('code', 'ADMIN_ASSISTANT')->firstOrFail();
        foreach (['student_events.view', 'student_events.manage'] as $code) {
            $role->permissions()->syncWithoutDetaching([
                Permission::where('code', $code)->firstOrFail()->id => ['scope_type' => 'global'],
            ]);
        }
        $assistant = User::factory()->create();
        $assistant->roles()->attach($role);
        $payload = ['confirmation' => $event->title_ar, 'reason' => 'Administrative record cleanup'];
        $this->actingAs($assistant)->deleteJson("/api/v1/student-events/{$event->id}", $payload)->assertForbidden();
        $role->permissions()->syncWithoutDetaching([
            Permission::where('code', 'student_events.delete')->firstOrFail()->id => ['scope_type' => 'global'],
        ]);
        $this->deleteJson("/api/v1/student-events/{$event->id}", $payload)->assertOk();
        $this->assertDatabaseMissing('student_events', ['id' => $event->id]);
    }

    public function test_presenters_and_poster_can_be_shown_replaced_removed_and_are_public_only_when_published(): void
    {
        Storage::fake('local');
        $payload = $this->payload();
        $payload['presenters'] = [
            ['name_ar' => 'د. شذى ملحم', 'name_en' => 'Dr. Shatha Melhem',
                'role_ar' => 'أخصائية نسائية وتوليد', 'role_en' => 'OB/GYN Specialist'],
            ['name_ar' => 'د. أحمد', 'name_en' => 'Dr. Ahmad'],
        ];
        $id = $this->actingAs($this->admin())->postJson('/api/v1/student-events', $payload)
            ->assertCreated()->assertJsonPath('data.presenters.0.name_en', 'Dr. Shatha Melhem')
            ->json('data.id');
        $event = StudentEvent::findOrFail($id);
        $this->get("/api/v1/public/student-events/posters/{$event->public_id}")->assertNotFound();
        $this->post("/api/v1/student-events/$id/poster", [
            'poster' => UploadedFile::fake()->image('announcement.png', 800, 800),
        ], ['Accept' => 'application/json'])->assertOk()
            ->assertJsonPath('data.poster_url', "/api/v1/student-events/$id/poster");
        $this->get("/api/v1/student-events/$id/poster")->assertOk();
        $this->assertCount(1, Storage::disk('local')->allFiles("student-events/$id"));
        $this->postJson("/api/v1/student-events/$id/status", ['status' => 'published'])->assertOk();
        $this->get("/api/v1/public/student-events/posters/{$event->public_id}")->assertOk();
        $this->postJson("/api/v1/student-events/$id/check-in", ['enabled' => true])->assertOk();
        $token = $this->getJson("/api/v1/student-events/$id/qr")->json('data.token');
        $this->postJson('/api/v1/public/student-events/begin', ['qr_token' => $token])->assertOk()
            ->assertJsonPath('data.event.presenters.1.name_en', 'Dr. Ahmad')
            ->assertJsonPath('data.event.poster_url', "/api/v1/public/student-events/posters/{$event->public_id}");
        $oldPath = Storage::disk('local')->allFiles("student-events/$id")[0];
        $this->post("/api/v1/student-events/$id/poster", [
            'poster' => UploadedFile::fake()->image('replacement.jpg', 800, 800),
        ], ['Accept' => 'application/json'])->assertOk();
        $this->assertFalse(Storage::disk('local')->exists($oldPath));
        $this->assertCount(1, Storage::disk('local')->allFiles("student-events/$id"));
        $this->deleteJson("/api/v1/student-events/$id/poster")->assertOk()->assertJsonPath('data.poster_url', null);
        $this->assertSame([], Storage::disk('local')->allFiles("student-events/$id"));
        $this->get("/api/v1/public/student-events/posters/{$event->public_id}")->assertNotFound();
        $this->assertDatabaseHas('audit_logs', ['action' => 'student_event.poster_uploaded', 'entity_id' => $id]);
    }

    public function test_bad_poster_is_rejected_and_deleting_event_removes_its_file(): void
    {
        Storage::fake('local');
        $event = $this->published();
        $this->post("/api/v1/student-events/{$event->id}/poster", [
            'poster' => UploadedFile::fake()->create('document.pdf', 10, 'application/pdf'),
        ], ['Accept' => 'application/json'])->assertUnprocessable();
        $this->post("/api/v1/student-events/{$event->id}/poster", [
            'poster' => UploadedFile::fake()->image('poster.webp', 800, 800),
        ], ['Accept' => 'application/json'])->assertOk();
        $this->postJson("/api/v1/student-events/{$event->id}/status", [
            'status' => 'archived', 'reason' => 'Event already ended and archived',
        ])->assertOk();
        $this->get("/api/v1/public/student-events/posters/{$event->public_id}")->assertNotFound();
        $this->get("/api/v1/student-events/{$event->id}/poster")->assertOk();
        $path = Storage::disk('local')->allFiles("student-events/{$event->id}")[0];
        $this->deleteJson("/api/v1/student-events/{$event->id}", [
            'confirmation' => $event->title_ar, 'reason' => 'Delete duplicated public event and poster',
        ])->assertOk();
        $this->assertFalse(Storage::disk('local')->exists($path));
    }

    public function test_published_poster_is_a_real_image_for_an_unauthenticated_visitor(): void
    {
        Storage::fake('local');
        $event = $this->published();
        $this->post("/api/v1/student-events/{$event->id}/poster", [
            'poster' => UploadedFile::fake()->image('public-poster.png', 640, 800),
        ], ['Accept' => 'application/json'])->assertOk();
        auth()->forgetGuards();

        $response = $this->get("/api/v1/public/student-events/posters/{$event->public_id}");
        $response->assertOk()->assertHeader('Content-Type', 'image/png');
        $this->assertStringStartsWith('image/png', (string) $response->headers->get('Content-Type'));
        $this->get("/api/v1/student-events/{$event->id}/poster")->assertUnauthorized();

        // A browser may still send an old staff cookie when opening the public image in a tab.
        $this->actingAs($this->admin(), 'web')->withSession(['password_hash_web' => 'stale-hash'])
            ->withHeader('Origin', 'http://localhost');
        $this->get("/api/v1/public/student-events/posters/{$event->public_id}")
            ->assertOk()->assertHeader('Content-Type', 'image/png');
    }
}
