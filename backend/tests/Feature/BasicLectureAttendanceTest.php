<?php

namespace Tests\Feature;

use App\Models\{Permission, Role, User};
use App\Services\{AuthorizationService, BasicAttendanceService};
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Mail\Message;
use Illuminate\Support\Facades\{DB, Mail};
use PhpOffice\PhpSpreadsheet\IOFactory;
use Symfony\Component\Mime\Email;
use Tests\TestCase;

class BasicLectureAttendanceTest extends TestCase
{
    use RefreshDatabase;

    private User $lecturer;
    private User $other;
    private User $manager;
    private int $section;
    private int $otherSection;
    private array $students;
    private string $otp = '';
    private string $recipient = '';

    protected function setUp(): void
    {
        parent::setUp();
        $this->withCredentials();
        $this->travelTo(Carbon::parse('2026-09-29 09:00:00'));
        $this->seed([\Database\Seeders\PermissionSeeder::class, \Database\Seeders\RoleSeeder::class, \Database\Seeders\BasicAttendancePermissionSeeder::class]);
        $this->lecturer = $this->user('BASIC_LECTURER');
        $this->other = $this->user('BASIC_LECTURER');
        $this->manager = $this->user('BASIC_ATTENDANCE_ADMIN');
        $course = DB::table('basic_courses')->insertGetId(['code' => 'BASIC101', 'name' => 'مساق تجريبي', 'academic_level' => 'first', 'created_at' => now(), 'updated_at' => now()]);
        foreach ([$this->lecturer, $this->other] as $index => $user) {
            $id = DB::table('basic_sections')->insertGetId(['course_id' => $course, 'number' => (string) ($index + 1), 'academic_year' => '2026/2027', 'semester' => 'first', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('basic_section_lecturers')->insert(['section_id' => $id, 'user_id' => $user->id]);
            if ($index === 0) $this->section = $id; else $this->otherSection = $id;
        }
        $this->students = [];
        for ($n = 1; $n <= 3; $n++) {
            $id = DB::table('basic_students')->insertGetId(['university_number' => '260000'.$n, 'name' => 'طالب اختبار '.$n, 'email' => 'basic'.$n.'@example.edu', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('basic_enrollments')->insert(['section_id' => $this->section, 'student_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
            $this->students[] = $id;
        }
    }

    private function user(string $role): User
    {
        $u = User::factory()->create(['is_active' => true]);
        $u->roles()->attach(Role::where('code', $role)->firstOrFail(), ['scope_type' => 'global']);
        return $u;
    }

    private function start(string $mode = 'double'): int
    {
        return $this->actingAs($this->lecturer)->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/sessions', ['title' => 'محاضرة اختبار', 'mode' => $mode, 'window_minutes' => 5, 'late_after_minutes' => 2])->assertCreated()->json('data.id');
    }

    private function token(int $id): string
    {
        return app(BasicAttendanceService::class)->token(DB::table('basic_lecture_sessions')->find($id));
    }

    private function transition(int $id, string $action): void
    {
        $this->actingAs($this->lecturer)->postJson('/api/v1/basic-attendance/sessions/'.$id.'/transition', compact('action'))->assertOk();
    }

    private function device(int $student): string
    {
        $token = str_repeat((string) $student, 80);
        $token = substr($token, 0, 80);
        DB::table('basic_trusted_devices')->insert(['student_id' => $student, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addDays(30), 'created_at' => now(), 'updated_at' => now()]);
        return $token;
    }

    private function scan(string $device, string $qr)
    {
        return $this->withUnencryptedCookie(BasicAttendanceService::COOKIE, $device)->postJson('/api/v1/public/basic-attendance/scan', compact('qr'));
    }

    private function mail(): void
    {
        Mail::shouldReceive('raw')->andReturnUsing(function ($body, $configure) {
            preg_match('/[0-9]{6}/', $body, $matches); $this->otp = $matches[0];
            $email = new Email; $configure(new Message($email));
            $this->recipient = $email->getTo()[0]->getAddress();
        });
    }

    public function test_roles_have_no_clinical_grants_and_existing_grants_are_not_reset(): void
    {
        foreach ([$this->lecturer, $this->manager] as $u) {
            foreach (['students.view', 'grades.view', 'attendance.record', 'distribution.view', 'supervisor.workspace.view', 'users.manage'] as $p) $this->assertFalse(app(AuthorizationService::class)->can($u, $p));
            foreach (['students', 'operational/clinical-schedule', 'operational/my-supervisor-workspace', 'users'] as $route) $this->actingAs($u)->getJson('/api/v1/'.$route)->assertForbidden();
        }
        $this->actingAs($this->lecturer)->getJson('/api/v1/basic-attendance/options')->assertForbidden();
        $this->actingAs($this->manager)->getJson('/api/v1/basic-attendance/options')->assertOk();
        $before = DB::table('role_permissions')->count();
        $this->seed(\Database\Seeders\BasicAttendancePermissionSeeder::class);
        $this->assertSame($before, DB::table('role_permissions')->count());
        $admin = $this->user('SYS_ADMIN');
        $this->assertTrue(app(AuthorizationService::class)->can($admin, 'basic_attendance.manage'));
    }

    public function test_scope_is_checked_on_every_read_and_write(): void
    {
        $id = $this->start();
        $this->actingAs($this->other)->getJson('/api/v1/basic-attendance/sections')->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->otherSection);
        foreach (['roster', 'sessions', 'report', 'export'] as $route) $this->getJson('/api/v1/basic-attendance/sections/'.$this->section.'/'.$route)->assertNotFound();
        foreach (['', '/qr', '/audit'] as $route) $this->getJson('/api/v1/basic-attendance/sessions/'.$id.$route)->assertNotFound();
        $this->postJson('/api/v1/basic-attendance/sessions/'.$id.'/transition', ['action' => 'close'])->assertNotFound();
        $this->putJson('/api/v1/basic-attendance/sessions/'.$id.'/records/'.$this->students[0], ['status' => 'present', 'is_late' => false, 'reason' => 'سبب اختبار'])->assertNotFound();
        $this->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/sessions', ['title' => 'اختبار', 'mode' => 'single', 'window_minutes' => 5, 'late_after_minutes' => 2])->assertNotFound();
        $this->actingAs($this->manager)->getJson('/api/v1/basic-attendance/sessions/'.$id)->assertOk();
    }

    public function test_roster_snapshot_duplicate_active_guard_import_and_withdrawal(): void
    {
        $id = $this->start();
        $this->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/sessions', ['title' => 'نسخة', 'mode' => 'single', 'window_minutes' => 5, 'late_after_minutes' => 2])->assertUnprocessable();
        $row = ['university_number' => '2600004', 'name' => 'طالب جديد', 'email' => 'new@example.edu'];
        $this->actingAs($this->manager)->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster', ['rows' => [$row]])->assertOk();
        $this->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster', ['rows' => [$row, $row]])->assertUnprocessable();
        $this->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster', ['rows' => [array_replace($row, ['university_number' => '2600005', 'email' => 'basic1@example.edu'])]])->assertUnprocessable();
        $this->deleteJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster/'.$this->students[0])->assertOk();
        $this->assertSame(3, DB::table('basic_lecture_records')->where('session_id', $id)->count());
        $this->assertDatabaseCount('students', 0);
        $this->assertDatabaseCount('attendance_records', 0);
        $this->transition($id, 'finalize');
        $this->assertSame(3, DB::table('basic_lecture_records')->where('session_id', $this->start())->count());
    }

    public function test_manual_student_addition_preserves_existing_data_and_lecture_rosters(): void
    {
        $session = $this->start();
        $url = '/api/v1/basic-attendance/sections/'.$this->section.'/roster/student';
        $row = ['university_number' => '2600004', 'name' => 'طالب يدوي', 'email' => 'manual@example.edu'];

        $this->actingAs($this->lecturer)->postJson($url, $row)->assertForbidden();
        $this->actingAs($this->manager)->postJson($url, $row)->assertCreated()->assertJsonPath('data.existing_student', false);
        $this->assertDatabaseHas('basic_students', $row);
        $studentId = DB::table('basic_students')->where('university_number', $row['university_number'])->value('id');
        $this->assertDatabaseHas('basic_enrollments', ['section_id' => $this->section, 'student_id' => $studentId, 'is_active' => true]);
        $this->assertSame(3, DB::table('basic_lecture_records')->where('session_id', $session)->count());

        $this->postJson($url, $row)->assertUnprocessable();
        $this->postJson($url, array_replace($row, ['university_number' => '2600005']))->assertUnprocessable();
        $this->postJson($url, array_replace($row, ['email' => 'different@example.edu']))->assertUnprocessable();

        $otherUrl = '/api/v1/basic-attendance/sections/'.$this->otherSection.'/roster/student';
        $this->postJson($otherUrl, ['university_number' => '2600001', 'name' => 'اسم مختلف', 'email' => 'basic1@example.edu'])
            ->assertCreated()->assertJsonPath('data.existing_student', true);
        $this->assertDatabaseHas('basic_students', ['university_number' => '2600001', 'name' => 'طالب اختبار 1', 'email' => 'basic1@example.edu']);
        $this->assertDatabaseHas('basic_enrollments', ['section_id' => $this->otherSection, 'student_id' => $this->students[0], 'is_active' => true]);
    }

    public function test_double_check_late_duplicate_and_final_states(): void
    {
        $id = $this->start(); $service = app(BasicAttendanceService::class);
        $a = $this->device($this->students[0]); $b = $this->device($this->students[1]);
        $this->scan($a, $this->token($id))->assertOk()->assertJsonPath('data.already_recorded', false);
        $this->scan($a, $this->token($id))->assertOk()->assertJsonPath('data.already_recorded', true);
        $this->travel(3)->minutes();
        $this->scan($b, $this->token($id))->assertOk();
        $old = $this->token($id); $this->transition($id, 'close');
        $this->scan($a, $old)->assertUnprocessable();
        $this->transition($id, 'open_exit');
        $this->scan($this->device($this->students[2]), $this->token($id))->assertUnprocessable();
        $this->scan($a, $this->token($id))->assertOk()->assertJsonPath('data.phase', 'check_out');
        $this->scan($a, $this->token($id))->assertOk()->assertJsonPath('data.already_recorded', true);
        $this->transition($id, 'finalize');
        $this->assertDatabaseHas('basic_lecture_records', ['session_id' => $id, 'student_id' => $this->students[0], 'status' => 'present', 'is_late' => false]);
        $this->assertDatabaseHas('basic_lecture_records', ['session_id' => $id, 'student_id' => $this->students[1], 'status' => 'incomplete', 'is_late' => true]);
        $this->assertDatabaseHas('basic_lecture_records', ['session_id' => $id, 'student_id' => $this->students[2], 'status' => 'absent']);
        $this->scan($a, $old)->assertUnprocessable();
        $this->assertFalse($service->accepting(DB::table('basic_lecture_sessions')->find($id)));
    }

    public function test_expired_tampered_cross_phase_and_outsider_scans_are_rejected(): void
    {
        $id = $this->start(); $a = $this->device($this->students[0]); $qr = $this->token($id);
        $this->scan($a, $qr.'bad')->assertUnprocessable();
        $this->travel(19)->seconds(); $this->scan($a, $qr)->assertUnprocessable();
        $this->transition($id, 'close'); $this->transition($id, 'reopen_entry');
        $this->scan($a, $qr)->assertUnprocessable();
        $outsider = DB::table('basic_students')->insertGetId(['university_number' => '2600099', 'name' => 'خارج الشعبة', 'email' => 'outside@example.edu']);
        $this->scan($this->device($outsider), $this->token($id))->assertUnprocessable();
        $this->travel(6)->minutes(); $this->scan($a, $this->token($id))->assertUnprocessable();
        $this->assertDatabaseMissing('basic_lecture_records', ['session_id' => $id, 'source' => 'manual']);
    }

    public function test_manual_correction_requires_reason_preserves_scans_and_is_audited(): void
    {
        $id = $this->start('single'); $a = $this->device($this->students[0]);
        $this->scan($a, $this->token($id))->assertOk();
        $time = DB::table('basic_lecture_records')->where('student_id', $this->students[0])->value('check_in_at');
        $url = '/api/v1/basic-attendance/sessions/'.$id.'/records/'.$this->students[0];
        $this->actingAs($this->lecturer)->putJson($url, ['status' => 'excused', 'is_late' => false, 'reason' => ''])->assertUnprocessable();
        $this->putJson($url, ['status' => 'excused', 'is_late' => false, 'reason' => 'مشكلة تقنية موثقة'])->assertOk();
        $this->scan($a, $this->token($id))->assertUnprocessable();
        $this->transition($id, 'finalize');
        $this->assertDatabaseHas('basic_lecture_records', ['student_id' => $this->students[0], 'source' => 'manual', 'status' => 'excused', 'check_in_at' => $time]);
        $this->assertDatabaseHas('basic_attendance_audits', ['session_id' => $id, 'user_id' => $this->lecturer->id, 'event' => 'record.corrected']);
    }

    public function test_fresh_scan_preparation_otp_delay_and_saved_device(): void
    {
        $this->mail(); $id = $this->start('single');
        $ticket = $this->postJson('/api/v1/public/basic-attendance/prepare', ['qr' => $this->token($id)])->assertOk()->json('data.scan_ticket');
        $this->travel(30)->seconds();
        $challenge = $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '٢٦٠٠٠٠١', 'scan_ticket' => $ticket])->assertOk()->json('data.challenge_token');
        $this->assertSame('basic1@example.edu', $this->recipient);
        $this->travel(30)->seconds();
        $response = $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $challenge, 'otp' => $this->otp, 'remember' => true])->assertOk()->assertJsonPath('data.attendance.phase', 'check_in')->assertJsonPath('data.attendance_error', null)->assertJsonPath('data.remembered_days', 30);
        $cookie = $response->getCookie(BasicAttendanceService::COOKIE, false);
        $this->assertTrue($cookie->isHttpOnly()); $this->assertSame('/', $cookie->getPath()); $this->assertSame('lax', $cookie->getSameSite());
        $this->assertEqualsWithDelta(now()->addMinutes(30 * 24 * 60)->timestamp, $cookie->getExpiresTime(), 3);
        $this->withUnencryptedCookie(BasicAttendanceService::COOKIE, $cookie->getValue())->getJson('/api/v1/public/basic-attendance/identity')->assertJsonPath('data.student.university_number', '2600001');
        $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $challenge, 'otp' => $this->otp, 'remember' => true])->assertUnprocessable();
        $this->postJson('/api/v1/public/basic-attendance/forget')->assertOk();
        $this->getJson('/api/v1/public/basic-attendance/identity')->assertJsonPath('data.student', null);
    }

    public function test_closed_phase_during_otp_does_not_record_attendance_but_identity_survives(): void
    {
        $this->mail(); $id = $this->start();
        $challenge = $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001', 'qr' => $this->token($id)])->assertOk()->json('data.challenge_token');
        $this->transition($id, 'close'); $this->transition($id, 'reopen_entry');
        $r = $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $challenge, 'otp' => $this->otp, 'remember' => false])->assertOk()->assertJsonPath('data.attendance', null)->assertJsonPath('data.student.university_number', '2600001');
        $this->assertNotEmpty($r->json('data.attendance_error'));
        $this->assertDatabaseHas('basic_lecture_records', ['session_id' => $id, 'student_id' => $this->students[0], 'check_in_at' => null]);
        $cookie = $r->getCookie(BasicAttendanceService::COOKIE, false);
        $this->assertEqualsWithDelta(now()->addMinutes(120)->timestamp, $cookie->getExpiresTime(), 3);
        $this->scan($cookie->getValue(), $this->token($id))->assertOk();
    }

    public function test_unknown_number_wrong_otp_attempts_and_mail_failure(): void
    {
        $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '99999999'])->assertUnprocessable();
        $this->mail();
        $c = $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001'])->assertOk()->json('data.challenge_token');
        for ($i = 0; $i < 5; $i++) $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $c, 'otp' => '000000', 'remember' => false])->assertUnprocessable();
        $this->assertDatabaseHas('basic_otp_challenges', ['token_hash' => hash('sha256', $c), 'attempts' => 5]);
        $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $c, 'otp' => $this->otp, 'remember' => false])->assertUnprocessable();
        $this->assertDatabaseCount('basic_trusted_devices', 0);
    }

    public function test_mail_failure_leaves_no_usable_challenge_or_device(): void
    {
        Mail::shouldReceive('raw')->once()->andThrow(new \RuntimeException('mock transport failure'));
        $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001'])->assertUnprocessable();
        $this->assertDatabaseCount('basic_otp_challenges', 0);
        $this->assertDatabaseCount('basic_trusted_devices', 0);
    }

    public function test_basic_account_creation_does_not_provision_a_clinical_identity(): void
    {
        $admin = $this->user('SYS_ADMIN');
        $admin->directPermissions()->attach(Permission::where('code', 'users.manage')->firstOrFail());
        $this->actingAs($admin)->postJson('/api/v1/users', ['name' => 'Basic Lecturer Test', 'email' => 'lecturer@example.edu', 'password' => 'Strong!Password123', 'roles' => ['BASIC_LECTURER'], 'is_active' => true])->assertOk();
        $user = User::where('email', 'lecturer@example.edu')->firstOrFail();
        $this->assertSame(['BASIC_LECTURER'], $user->roles()->pluck('code')->all());
        $this->assertDatabaseMissing('clinical_supervisor_profiles', ['user_id' => $user->id]);
        $this->assertDatabaseMissing('people', ['user_id' => $user->id]);
        $clinical = $this->user('CLINICAL_SUPERVISOR');
        $data = ['course_id' => DB::table('basic_courses')->value('id'), 'number' => '3', 'academic_year' => '2026/2027', 'semester' => 'first', 'lecturer_ids' => [$clinical->id]];
        $this->actingAs($this->manager)->postJson('/api/v1/basic-attendance/sections', $data)->assertUnprocessable();
        $data['lecturer_ids'] = [$user->id];
        $this->postJson('/api/v1/basic-attendance/sections', $data)->assertOk();
        $this->postJson('/api/v1/basic-attendance/sections', $data)->assertUnprocessable();
        $this->actingAs($user)->getJson('/api/v1/basic-attendance/sections')->assertJsonCount(1, 'data');
    }

    public function test_email_changes_revoke_devices_and_outstanding_challenges(): void
    {
        $this->mail(); $a = $this->device($this->students[0]);
        $c = $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001'])->assertOk()->json('data.challenge_token');
        $this->actingAs($this->manager)->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster', ['rows' => [['university_number' => '2600001', 'name' => 'طالب اختبار', 'email' => 'changed@example.edu']]])->assertOk();
        $this->withUnencryptedCookie(BasicAttendanceService::COOKIE, $a)->getJson('/api/v1/public/basic-attendance/identity')->assertJsonPath('data.student', null);
        $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $c, 'otp' => $this->otp, 'remember' => false])->assertUnprocessable();
    }

    public function test_pending_tickets_expire_and_section_history_cannot_be_rewritten(): void
    {
        $id = $this->start();
        $ticket = $this->postJson('/api/v1/public/basic-attendance/prepare', ['qr' => $this->token($id)])->assertOk()->json('data.scan_ticket');
        $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001', 'scan_ticket' => $ticket.'bad'])->assertUnprocessable();
        $this->travel(6)->minutes();
        $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001', 'scan_ticket' => $ticket])->assertUnprocessable();
        $s = DB::table('basic_sections')->find($this->section);
        $this->actingAs($this->manager)->putJson('/api/v1/basic-attendance/sections/'.$s->id, ['course_id' => $s->course_id, 'number' => 'changed', 'academic_year' => $s->academic_year, 'semester' => $s->semester, 'lecturer_ids' => [$this->lecturer->id]])->assertUnprocessable();
    }

    public function test_same_origin_encrypted_cookie_round_trip_registers_the_second_check(): void
    {
        $this->mail(); $id = $this->start();
        $this->withHeader('Origin', 'http://localhost');
        $c = $this->postJson('/api/v1/public/basic-attendance/request-otp', ['university_number' => '2600001', 'qr' => $this->token($id)])->assertOk()->json('data.challenge_token');
        $r = $this->postJson('/api/v1/public/basic-attendance/verify-otp', ['challenge_token' => $c, 'otp' => $this->otp, 'remember' => true])->assertOk();
        $cookie = $r->getCookie(BasicAttendanceService::COOKIE, false);
        $this->assertGreaterThan(80, strlen($cookie->getValue()));
        $this->withUnencryptedCookie(BasicAttendanceService::COOKIE, $cookie->getValue())->getJson('/api/v1/public/basic-attendance/identity')->assertJsonPath('data.student.university_number', '2600001');
        $this->transition($id, 'close'); $this->transition($id, 'open_exit');
        $this->postJson('/api/v1/public/basic-attendance/scan', ['qr' => $this->token($id)])->assertOk()->assertJsonPath('data.phase', 'check_out');
    }

    public function test_anonymous_students_sharing_campus_ip_are_not_one_device(): void
    {
        for ($i = 0; $i < 40; $i++) $this->getJson('/api/v1/public/basic-attendance/identity')->assertOk();
        $a = $this->device($this->students[0]);
        for ($i = 0; $i < 30; $i++) $this->withUnencryptedCookie(BasicAttendanceService::COOKIE, $a)->getJson('/api/v1/public/basic-attendance/identity')->assertOk();
        $this->getJson('/api/v1/public/basic-attendance/identity')->assertStatus(429);
    }

    public function test_report_pagination_export_and_large_section_snapshot(): void
    {
        $rows = [];
        for ($n = 100; $n < 450; $n++) $rows[] = ['university_number' => '2600'.$n, 'name' => 'Student '.$n, 'email' => 'bulk'.$n.'@example.edu'];
        $this->actingAs($this->manager)->postJson('/api/v1/basic-attendance/sections/'.$this->section.'/roster', compact('rows'))->assertOk();
        $id = $this->start('single');
        $this->assertSame(353, DB::table('basic_lecture_records')->where('session_id', $id)->count());
        $this->transition($id, 'finalize');
        for ($i = 0; $i < 7; $i++) $this->transition($this->start('single'), 'finalize');
        $this->getJson('/api/v1/basic-attendance/sections/'.$this->section.'/report')->assertJsonCount(7, 'data.sessions')->assertJsonPath('data.pagination.total', 8);
        $this->getJson('/api/v1/basic-attendance/sections/'.$this->section.'/report?offset=7')->assertJsonCount(1, 'data.sessions');
        $download = $this->get('/api/v1/basic-attendance/sections/'.$this->section.'/export')->assertOk();
        $this->assertStringContainsString('.xlsx', $download->headers->get('Content-Disposition'));
        $book = IOFactory::load($download->baseResponse->getFile()->getPathname());
        $sheet = $book->getActiveSheet();
        $this->assertSame(__('basic_attendance.report_title'), $sheet->getCell('A1')->getValue());
        $this->assertSame(__('basic_attendance.message15'), $sheet->getCell('A7')->getValue());
        $this->assertSame('Student 100', $sheet->getCell('B8')->getValue());
        $this->assertSame('2600100', $sheet->getCell('A8')->getValue());
        $this->assertSame('s', $sheet->getCell('A8')->getDataType());
        $this->assertSame(__('basic_attendance.status_absent'), $sheet->getCell('F8')->getValue());
        $this->assertSame('C8', $sheet->getFreezePane());
        $this->assertIsNumeric($sheet->getCell('D8')->getValue());
        $book->disconnectWorksheets();
    }
}
