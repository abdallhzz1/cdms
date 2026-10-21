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
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
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
            'check_in_opens_at' => '2026-10-21 10:30:00', 'check_in_closes_at' => '2026-10-21 13:30:00',
            'eligible_levels' => ['fourth', 'fifth']];
    }

    private function published(): StudentEvent
    {
        $id = $this->actingAs($this->admin())->postJson('/api/v1/student-events', $this->payload())
            ->assertCreated()->json('data.id');
        $this->postJson("/api/v1/student-events/$id/status", ['status' => 'published'])->assertOk();
        return StudentEvent::findOrFail($id);
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

    public function test_attended_event_cannot_change_schedule_or_eligibility_and_only_empty_drafts_can_be_deleted(): void
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
        $draftId = $this->postJson('/api/v1/student-events', $this->payload())->assertCreated()->json('data.id');
        $this->deleteJson("/api/v1/student-events/$draftId")->assertOk();
        $this->assertDatabaseMissing('student_events', ['id' => $draftId]);
        $this->assertDatabaseHas('student_event_attendances', ['student_event_id' => $event->id, 'student_id' => $student->id]);
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
        $this->postJson("/api/v1/student-events/{$event->id}/attendance", [
            'university_number' => '22000001', 'reason' => 'تصحيح إداري موثق',
        ])->assertForbidden();
    }
}
