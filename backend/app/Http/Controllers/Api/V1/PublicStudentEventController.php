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
use App\Services\StudentEventParticipantService;
use App\Services\BasicAttendanceService;
use App\Services\StudentPublicIdentityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PublicStudentEventController extends Controller
{
    private const SCAN_COOKIE = 'cdms_student_event_scan';

    public function poster(string $publicId)
    {
        $event = StudentEvent::where('public_id', $publicId)->where('status', 'published')->firstOrFail();
        abort_unless($event->poster_storage_path && Storage::disk('local')->exists($event->poster_storage_path), 404);
        return Storage::disk('local')->response($event->poster_storage_path, null, [
            'Content-Type' => $event->poster_mime_type,
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'no-store',
        ]);
    }

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

    public function identity(Request $request, StudentEventParticipantService $participants): JsonResponse
    {
        $data = $request->validate(['intent' => ['required', 'string', 'size:80'],
            'access_token' => ['nullable', 'string', 'size:80']]);
        $event = $this->intentEvent($request, $data['intent']);
        $participant = $participants->identity($request, $event, $data['access_token'] ?? null);
        abort_unless($participant, 401, __('student_events.identity_required'));
        return ApiResponse::success(['name_ar' => $participant['name_ar'], 'name_en' => $participant['name_en'],
            'university_number' => $participant['number']]);
    }

    public function requestOtp(Request $request, StudentEventParticipantService $participants): JsonResponse
    {
        $data = $request->validate(['intent' => ['required', 'string', 'size:80'],
            'university_number' => ['required', 'string', 'regex:/^[0-9]+$/', 'max:20']]);
        $event = $this->intentEvent($request, $data['intent']);
        $participant = $participants->byNumber($data['university_number'], $event);
        if ($participant['source'] === 'basic' && DB::table('basic_otp_challenges')
            ->where('student_id', $participant['id'])->where('created_at', '>', now()->subHour())->count() >= 10)
            throw ValidationException::withMessages(['university_number' => [__('student_events.otp_rate_limited')]]);
        $code = (string) random_int(100000, 999999);
        $token = Str::random(64);
        if ($participant['source'] === 'clinical') {
            $challenge = StudentScheduleOtpChallenge::create([
                'student_id' => $participant['id'], 'challenge_token_hash' => hash('sha256', $token),
                'otp_hash' => Hash::make($code), 'expires_at' => now()->addMinutes(10),
                'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key')),
            ]);
        } else {
            DB::table('basic_otp_challenges')->insert(['student_id' => $participant['id'],
                'student_event_id' => $event->id,
                'token_hash' => hash('sha256', $token), 'otp_hash' => Hash::make($code),
                'expires_at' => now()->addMinutes(10), 'created_at' => now(), 'updated_at' => now()]);
        }
        try {
            Mail::raw(__('student_events.otp_mail', ['code' => $code]),
                fn ($mail) => $mail->to($participant['email'])->subject(__('student_events.otp_subject')));
        } catch (\Throwable $e) {
            if ($participant['source'] === 'clinical') $challenge->delete();
            else DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $token))->delete();
            throw ValidationException::withMessages(['university_number' => [__('student_events.otp_failed')]]);
        }
        return ApiResponse::success(['challenge_token' => $token], __('student_events.otp_sent'));
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['challenge_token' => ['required', 'string', 'size:64'],
            'otp' => ['required', 'digits:6']]);
        if (DB::table('basic_otp_challenges')->whereNotNull('student_event_id')
            ->where('token_hash', hash('sha256', $data['challenge_token']))->exists())
            return $this->verifyBasicOtp($request, $data);
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

    private function verifyBasicOtp(Request $request, array $data): JsonResponse
    {
        [$accessToken, $error] = DB::transaction(function () use ($data) {
            $challenge = DB::table('basic_otp_challenges')->whereNotNull('student_event_id')
                ->where('token_hash', hash('sha256', $data['challenge_token']))
                ->lockForUpdate()->first();
            if (!$challenge || $challenge->consumed_at || now()->greaterThanOrEqualTo($challenge->expires_at)
                || $challenge->attempts >= 5) return [null, __('student_events.otp_invalid')];
            if (!Hash::check($data['otp'], $challenge->otp_hash)) {
                DB::table('basic_otp_challenges')->where('id', $challenge->id)->increment('attempts');
                return [null, __('student_events.otp_invalid')];
            }
            if (!DB::table('basic_students')->where('id', $challenge->student_id)->where('is_active', true)->exists())
                return [null, __('student_events.student_missing')];
            DB::table('basic_otp_challenges')->where('id', $challenge->id)->update(['consumed_at' => now()]);
            $token = Str::random(80);
            DB::table('basic_trusted_devices')->insert(['student_id' => $challenge->student_id,
                'token_hash' => hash('sha256', $token), 'expires_at' => now()->addDays(30),
                'created_at' => now(), 'updated_at' => now()]);
            return [$token, null];
        });
        if (!$accessToken) throw ValidationException::withMessages(['otp' => [$error]]);
        return ApiResponse::success(['access_token' => $accessToken])
            ->cookie(cookie(BasicAttendanceService::COOKIE, $accessToken, 30 * 24 * 60, '/', null,
                app()->isProduction() || $request->isSecure(), true, false, 'Lax'));
    }

    public function checkIn(Request $request, StudentEventParticipantService $participants): JsonResponse
    {
        $data = $request->validate(['intent' => ['required', 'string', 'size:80'],
            'access_token' => ['nullable', 'string', 'size:80']]);
        $event = $this->intentEvent($request, $data['intent']);
        $participant = $participants->identity($request, $event, $data['access_token'] ?? null);
        abort_unless($participant, 401, __('student_events.identity_required'));
        try {
            $result = DB::transaction(function () use ($event, $participant) {
                // Use the same row lock as the organizer's close action: no check-in can commit after close.
                $locked = StudentEvent::whereKey($event->id)->lockForUpdate()->firstOrFail();
                if ($locked->status !== 'published' || !$locked->check_in_enabled)
                    throw ValidationException::withMessages(['event' => [__('student_events.window_closed')]]);
                $attendance = StudentEventAttendance::where('student_event_id', $event->id)
                    ->where('university_number', $participant['number'])->lockForUpdate()->first();
                if ($attendance && !$attendance->voided_at) return [$attendance, true];
                if ($attendance) $attendance->update(['checked_in_at' => now(), 'source' => 'qr', 'recorded_by' => null,
                    'reason' => null, 'voided_at' => null, 'voided_by' => null, 'void_reason' => null]);
                else $attendance = StudentEventAttendance::create(['student_event_id' => $event->id,
                    'student_id' => $participant['source'] === 'clinical' ? $participant['id'] : null,
                    'basic_student_id' => $participant['source'] === 'basic' ? $participant['id'] : null,
                    'university_number' => $participant['number'], 'academic_level' => $participant['level'],
                    'checked_in_at' => now(), 'source' => 'qr']);
                AuditLog::create(['action' => 'student_event.qr_check_in', 'entity_type' => 'student_event',
                    'entity_id' => $event->id, 'student_id' => $attendance->student_id,
                    'changes' => ['attendance_id' => $attendance->id, 'basic_student_id' => $attendance->basic_student_id,
                        'source' => 'qr']]);
                return [$attendance, false];
            });
        } catch (UniqueConstraintViolationException $e) {
            // Two simultaneous scans must return the one committed record, never create two.
            $attendance = StudentEventAttendance::where('student_event_id', $event->id)
                ->where('university_number', $participant['number'])->whereNull('voided_at')->first();
            if (!$attendance) throw $e;
            $result = [$attendance, true];
        }
        Cache::forget($this->key($data['intent']));
        return ApiResponse::success(['event' => $this->publicEvent($event), 'student_name' => $participant['name_ar'],
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
            'starts_at', 'ends_at', 'eligible_levels', 'presenters', 'poster_url']);
    }
}
