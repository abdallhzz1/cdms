<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Models\AuditLog;
use App\Models\Student;
use App\Models\StudentEvent;
use App\Models\StudentEventAttendance;
use App\Models\StudentScheduleOtpChallenge;
use App\Models\StudentScheduleTrustedDevice;
use App\Services\StudentEventQrService;
use App\Services\StudentPublicIdentityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PublicStudentEventController extends Controller
{
    private const SCAN_COOKIE = 'cdms_student_event_scan';

    public function begin(Request $request, StudentEventQrService $qr): JsonResponse
    {
        $data = $request->validate(['qr_token' => ['required', 'string', 'max:1000']]);
        $event = $qr->validate($data['qr_token']);
        $intent = Str::random(80);
        $claim = Str::random(80);
        Cache::put($this->key($intent), ['event_id' => $event->id, 'claim_hash' => hash('sha256', $claim)], now()->addMinutes(15));
        return ApiResponse::success(['intent' => $intent, 'event' => $this->publicEvent($event)], null)
            ->cookie(cookie(self::SCAN_COOKIE, $claim, 15, '/', null,
                app()->isProduction() || $request->isSecure(), true, false, 'Lax'));
    }

    public function identity(Request $request, StudentPublicIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['access_token' => ['nullable', 'string', 'size:80']]);
        $student = $identity->resolve($request, $data['access_token'] ?? null);
        abort_unless($student?->academic_registration_status === 'registered', 401, __('student_events.identity_required'));
        return ApiResponse::success(['name_ar' => $student->full_name_ar, 'name_en' => $student->full_name_en,
            'university_number' => $student->university_number]);
    }

    public function requestOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['intent' => ['required', 'string', 'size:80'],
            'university_number' => ['required', 'string', 'regex:/^[0-9]+$/', 'max:20']]);
        $event = $this->intentEvent($request, $data['intent']);
        $student = Student::where('university_number', $data['university_number'])->first();
        if (!$student || $student->academic_registration_status !== 'registered')
            throw ValidationException::withMessages(['university_number' => [__('student_events.student_missing')]]);
        if (!in_array($student->academic_level, $event->eligible_levels, true))
            throw ValidationException::withMessages(['university_number' => [__('student_events.ineligible')]]);
        $code = (string) random_int(100000, 999999);
        $token = Str::random(64);
        $challenge = StudentScheduleOtpChallenge::create([
            'student_id' => $student->id, 'challenge_token_hash' => hash('sha256', $token),
            'otp_hash' => Hash::make($code), 'expires_at' => now()->addMinutes(10),
            'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
        ]);
        try {
            Mail::raw(__('student_events.otp_mail', ['code' => $code]),
                fn ($mail) => $mail->to($student->resolvedUniversityEmail())->subject(__('student_events.otp_subject')));
        } catch (\Throwable $e) {
            $challenge->delete();
            throw ValidationException::withMessages(['university_number' => [__('student_events.otp_failed')]]);
        }
        return ApiResponse::success(['challenge_token' => $token], __('student_events.otp_sent'));
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['challenge_token' => ['required', 'string', 'size:64'],
            'otp' => ['required', 'digits:6']]);
        [$accessToken, $error] = DB::transaction(function () use ($data) {
            $challenge = StudentScheduleOtpChallenge::where('challenge_token_hash', hash('sha256', $data['challenge_token']))
                ->lockForUpdate()->first();
            if (!$challenge || $challenge->consumed_at || $challenge->expires_at->isPast() || $challenge->attempts >= 5) {
                return [null, __('student_events.otp_invalid')];
            }
            if (!Hash::check($data['otp'], $challenge->otp_hash)) {
                $challenge->increment('attempts');
                return [null, __('student_events.otp_invalid')];
            }
            $accessToken = Str::random(80);
            $challenge->update(['verified_at' => now(), 'consumed_at' => now(),
                'access_token_hash' => hash('sha256', $accessToken), 'access_expires_at' => now()->addMinutes(60)]);
            return [$accessToken, null];
        });
        if (!$accessToken) throw ValidationException::withMessages(['otp' => [$error]]);

        $challenge = StudentScheduleOtpChallenge::where('access_token_hash', hash('sha256', $accessToken))->firstOrFail();
        $trustedToken = Str::random(80);
        StudentScheduleTrustedDevice::create(['student_id' => $challenge->student_id,
            'token_hash' => hash('sha256', $trustedToken), 'expires_at' => now()->addDays(30)]);
        return ApiResponse::success(['access_token' => $accessToken])
            ->cookie(cookie(StudentPublicIdentityService::COOKIE, $trustedToken, 30 * 24 * 60, '/', null,
                app()->isProduction() || $request->isSecure(), true, false, 'Lax'));
    }

    public function checkIn(Request $request, StudentPublicIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['intent' => ['required', 'string', 'size:80'],
            'access_token' => ['nullable', 'string', 'size:80']]);
        $event = $this->intentEvent($request, $data['intent']);
        $student = $identity->resolve($request, $data['access_token'] ?? null);
        abort_unless($student?->academic_registration_status === 'registered', 401, __('student_events.identity_required'));
        if (!in_array($student->academic_level, $event->eligible_levels, true))
            throw ValidationException::withMessages(['student' => [__('student_events.ineligible')]]);
        try {
            $result = DB::transaction(function () use ($event, $student) {
                // Use the same row lock as the organizer's close action: no check-in can commit after close.
                $locked = StudentEvent::whereKey($event->id)->lockForUpdate()->firstOrFail();
                if ($locked->status !== 'published' || !$locked->check_in_enabled)
                    throw ValidationException::withMessages(['event' => [__('student_events.window_closed')]]);
                $attendance = StudentEventAttendance::where('student_event_id', $event->id)
                    ->where('student_id', $student->id)->lockForUpdate()->first();
                if ($attendance && !$attendance->voided_at) return [$attendance, true];
                if ($attendance) $attendance->update(['checked_in_at' => now(), 'source' => 'qr', 'recorded_by' => null,
                    'reason' => null, 'voided_at' => null, 'voided_by' => null, 'void_reason' => null]);
                else $attendance = StudentEventAttendance::create(['student_event_id' => $event->id,
                    'student_id' => $student->id, 'checked_in_at' => now(), 'source' => 'qr']);
                AuditLog::create(['action' => 'student_event.qr_check_in', 'entity_type' => 'student_event',
                    'entity_id' => $event->id, 'student_id' => $student->id,
                    'changes' => ['attendance_id' => $attendance->id, 'source' => 'qr']]);
                return [$attendance, false];
            });
        } catch (UniqueConstraintViolationException $e) {
            // Two simultaneous scans must return the one committed record, never create two.
            $attendance = StudentEventAttendance::where('student_event_id', $event->id)
                ->where('student_id', $student->id)->whereNull('voided_at')->first();
            if (!$attendance) throw $e;
            $result = [$attendance, true];
        }
        Cache::forget($this->key($data['intent']));
        return ApiResponse::success(['event' => $this->publicEvent($event), 'student_name' => $student->full_name_ar,
            'checked_in_at' => $result[0]->checked_in_at, 'already_recorded' => $result[1]],
            __($result[1] ? 'student_events.already_recorded' : 'student_events.recorded'));
    }

    private function intentEvent(Request $request, string $intent): StudentEvent
    {
        $saved = Cache::get($this->key($intent));
        $claim = $request->cookie(self::SCAN_COOKIE);
        if (!is_array($saved) || !is_string($claim) || strlen($claim) !== 80
            || !hash_equals((string) ($saved['claim_hash'] ?? ''), hash('sha256', $claim)))
            throw ValidationException::withMessages(['intent' => [__('student_events.invalid_intent')]]);
        $event = StudentEvent::find($saved['event_id'] ?? 0);
        if (!$event || $event->status !== 'published')
            throw ValidationException::withMessages(['intent' => [__('student_events.invalid_intent')]]);
        if (!$event->check_in_enabled)
            throw ValidationException::withMessages(['event' => [__('student_events.window_closed')]]);
        return $event;
    }

    private function key(string $intent): string
    {
        return 'student_event_intent:'.hash('sha256', $intent);
    }

    private function publicEvent(StudentEvent $event): array
    {
        return $event->only(['public_id', 'type', 'title_ar', 'title_en', 'location_ar', 'location_en',
            'starts_at', 'ends_at', 'eligible_levels']);
    }
}
