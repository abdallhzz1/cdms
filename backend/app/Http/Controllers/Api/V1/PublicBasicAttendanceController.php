<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\BasicAttendanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{Crypt, DB, Hash, Mail};
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class PublicBasicAttendanceController extends Controller
{
    public function __construct(private BasicAttendanceService $service) {}

    public function identity(Request $r)
    {
        return ApiResponse::success(['student' => $this->service->identity((string) $r->cookie(BasicAttendanceService::COOKIE))]);
    }

    public function forget(Request $r)
    {
        DB::table('basic_trusted_devices')->where('token_hash', hash('sha256', (string) $r->cookie(BasicAttendanceService::COOKIE)))->update(['revoked_at' => now()]);
        return ApiResponse::success(null)->withoutCookie(BasicAttendanceService::COOKIE);
    }

    public function prepare(Request $r)
    {
        $data = $r->validate(['qr' => ['required', 'string', 'max:1000']]);
        $s = $this->service->validateToken($data['qr']);
        // Capture the fresh scan before typing a number / waiting for email.
        // This ticket never permits a trusted device to skip QR expiry checks.
        $expires = min(now()->addMinutes(5)->timestamp, \Carbon\Carbon::parse($s->phase_expires_at)->timestamp);
        return ApiResponse::success(['scan_ticket' => Crypt::encryptString(json_encode(['purpose' => 'basic-otp-scan', 'id' => $s->id, 'version' => (int) $s->version, 'state' => $s->state, 'expires' => $expires]))]);
    }

    private function pendingSession(array $data): ?object
    {
        if (! empty($data['scan_ticket'])) {
            try { $ticket = json_decode(Crypt::decryptString($data['scan_ticket']), true, 512, JSON_THROW_ON_ERROR); }
            catch (\Throwable $e) { $ticket = null; }
            if (! is_array($ticket) || ($ticket['purpose'] ?? '') !== 'basic-otp-scan' || ($ticket['expires'] ?? 0) <= now()->timestamp) throw ValidationException::withMessages(['qr' => [__('basic_attendance.message26')]]);
            $s = DB::table('basic_lecture_sessions')->find($ticket['id'] ?? 0);
            if (! $s || (int) $s->version !== ($ticket['version'] ?? null) || $s->state !== ($ticket['state'] ?? null) || ! $this->service->accepting($s)) throw ValidationException::withMessages(['qr' => [__('basic_attendance.message27')]]);
            return $s;
        }
        return empty($data['qr']) ? null : $this->service->validateToken($data['qr']);
    }

    public function requestOtp(Request $r)
    {
        $r->merge(['university_number' => strtr(trim((string) $r->input('university_number')), array_combine(preg_split('//u', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY), str_split('01234567890123456789')))]);
        $data = $r->validate(['university_number' => ['required', 'string', 'regex:/^[0-9]{6,20}$/'], 'qr' => ['nullable', 'string', 'max:1000'], 'scan_ticket' => ['nullable', 'string', 'max:2000']]);
        $student = DB::table('basic_students')->where('university_number', $data['university_number'])->where('is_active', true)->first();
        if (! $student) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message28')]]);
        if (DB::table('basic_otp_challenges')->where('student_id', $student->id)->where('created_at', '>', now()->subHour())->count() >= 10) throw ValidationException::withMessages(['otp' => [__('basic_attendance.message29')]]);
        $session = $this->pendingSession($data);
        if ($session && ! DB::table('basic_lecture_records')->where('session_id', $session->id)->where('student_id', $student->id)->exists()) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message30')]]);
        $plain = Str::random(64); $otp = (string) random_int(100000, 999999);
        DB::table('basic_otp_challenges')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', $plain), 'otp_hash' => Hash::make($otp), 'expires_at' => now()->addMinutes(5), 'pending_session_id' => $session?->id, 'pending_version' => $session?->version, 'pending_phase' => $session?->state, 'created_at' => now(), 'updated_at' => now()]);
        try { Mail::raw(__('basic_attendance.email_body', ['otp' => $otp]), fn ($mail) => $mail->to($student->email)->subject(__('basic_attendance.message31'))); }
        catch (\Throwable $e) { DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $plain))->delete(); throw ValidationException::withMessages(['email' => [__('basic_attendance.message32')]]); }
        return ApiResponse::success(['challenge_token' => $plain], __('basic_attendance.message33'));
    }

    public function verifyOtp(Request $r)
    {
        $data = $r->validate(['challenge_token' => ['required', 'string', 'size:64'], 'otp' => ['required', 'digits:6'], 'remember' => ['required', 'boolean']]);
        $result = DB::transaction(function () use ($data) {
            $c = DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $data['challenge_token']))->lockForUpdate()->first();
            if (! $c || $c->consumed_at || now()->greaterThanOrEqualTo($c->expires_at) || $c->attempts >= 5) return ['error' => __('basic_attendance.message34')];
            if (! Hash::check($data['otp'], $c->otp_hash)) { DB::table('basic_otp_challenges')->where('id', $c->id)->increment('attempts'); return ['error' => __('basic_attendance.message35')]; }
            $student = DB::table('basic_students')->where('id', $c->student_id)->where('is_active', true)->first();
            if (! $student) return ['error' => __('basic_attendance.message36')];
            DB::table('basic_otp_challenges')->where('id', $c->id)->update(['consumed_at' => now()]);
            $token = Str::random(80); $minutes = $data['remember'] ? 30 * 24 * 60 : 120;
            DB::table('basic_trusted_devices')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addMinutes($minutes), 'created_at' => now(), 'updated_at' => now()]);
            return ['token' => $token, 'minutes' => $minutes, 'student' => ['id' => $student->id, 'name' => $student->name, 'university_number' => $student->university_number], 'challenge' => $c];
        });
        if (isset($result['error'])) throw ValidationException::withMessages(['otp' => [$result['error']]]);
        $attendance = null; $attendanceError = null; $c = $result['challenge'];
        if ($c->pending_session_id) {
            // The original QR had to be fresh when the challenge was issued.
            // OTP delay does not extend the window or bypass a phase/version change.
            $expected = (object) ['id' => $c->pending_session_id, 'version' => $c->pending_version, 'state' => $c->pending_phase];
            try { $attendance = $this->service->scan($result['student']['id'], $expected); }
            catch (ValidationException $e) { $attendanceError = collect($e->errors())->flatten()->first(); }
        }
        return ApiResponse::success(['student' => $result['student'], 'attendance' => $attendance, 'attendance_error' => $attendanceError, 'remembered_days' => $data['remember'] ? 30 : null])
            ->cookie(cookie(BasicAttendanceService::COOKIE, $result['token'], $result['minutes'], '/', null, app()->isProduction() || $r->isSecure(), true, false, 'Lax'));
    }

    public function scan(Request $r)
    {
        $data = $r->validate(['qr' => ['required', 'string', 'max:1000']]);
        $student = $this->service->identity((string) $r->cookie(BasicAttendanceService::COOKIE));
        abort_unless($student, 401);
        return ApiResponse::success($this->service->scan($student->id, $this->service->validateToken($data['qr'])), __('basic_attendance.message37'));
    }
}
