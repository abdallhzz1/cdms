<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\BasicAttendanceService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\{DB, Hash, Mail};
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
        return ApiResponse::success(null)->withoutCookie(BasicAttendanceService::COOKIE)->withoutCookie(BasicAttendanceService::SCAN_CLAIM_COOKIE);
    }

    public function prepare(Request $r)
    {
        $data = $r->validate(['qr' => ['required', 'string', 'max:1000']]);
        $s = $this->service->validateToken($data['qr']);
        $claim = $this->service->prepareClaim($s, (string) $r->cookie(BasicAttendanceService::SCAN_CLAIM_COOKIE));
        return ApiResponse::success(['scan_ticket' => $claim['token'], 'claim_expires_at' => $claim['expires_at']->toIso8601String()])
            ->cookie(cookie(BasicAttendanceService::SCAN_CLAIM_COOKIE, $claim['token'], BasicAttendanceService::SCAN_CLAIM_MINUTES, '/', null, app()->isProduction() || $r->isSecure(), true, false, 'Lax'));
    }

    private function boundClaim(Request $r, array $data, int $student): ?array
    {
        if (! empty($data['scan_ticket'])) {
            $token = $data['scan_ticket'];
            if (strlen($token) !== 64 || ! hash_equals($token, (string) $r->cookie(BasicAttendanceService::SCAN_CLAIM_COOKIE))) {
                throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_browser_mismatch')]]);
            }
            $claim = DB::table('basic_scan_claims')->where('token_hash', hash('sha256', $token))->first();
            if (! $claim) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
            return $this->bindClaimToStudent($claim->id, $student, $token);
        }
        if (empty($data['qr'])) return null;
        $session = $this->service->validateToken($data['qr']);
        $claim = $this->service->prepareClaim($session);
        try { return $this->bindClaimToStudent($claim['id'], $student, $claim['token']); }
        catch (\Throwable $e) { DB::table('basic_scan_claims')->where('id', $claim['id'])->delete(); throw $e; }
    }

    private function bindClaimToStudent(int $claimId, int $student, string $token): array
    {
        return DB::transaction(function () use ($claimId, $student, $token): array {
            $claim = DB::table('basic_scan_claims')->where('id', $claimId)->lockForUpdate()->first();
            if (! $claim || $claim->consumed_at || now()->greaterThanOrEqualTo($claim->expires_at)) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
            if ($claim->student_id && (int) $claim->student_id !== $student) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_student_mismatch')]]);
            $session = DB::table('basic_lecture_sessions')->where('id', $claim->session_id)->whereNull('archived_at')->first();
            if (! $session || $session->state === 'finalized') throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
            $visible = DB::table('basic_sections as section')->join('basic_courses as course', 'course.id', '=', 'section.course_id')
                ->where('section.id', $session->section_id)->whereNull('section.archived_at')->whereNull('course.archived_at')->exists();
            if (! $visible) throw ValidationException::withMessages(['qr' => [__('basic_attendance.claim_expired')]]);
            if (! DB::table('basic_lecture_records')->where('session_id', $session->id)->where('student_id', $student)->exists()) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message30')]]);
            if (! $claim->student_id) DB::table('basic_scan_claims')->where('id', $claimId)->update(['student_id' => $student, 'updated_at' => now()]);
            return ['claim' => $claim, 'session' => $session, 'token' => $token];
        });
    }

    public function requestOtp(Request $r)
    {
        $r->merge(['university_number' => strtr(trim((string) $r->input('university_number')), array_combine(preg_split('//u', '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', -1, PREG_SPLIT_NO_EMPTY), str_split('01234567890123456789')))]);
        $data = $r->validate(['university_number' => ['required', 'string', 'regex:/^[0-9]{6,20}$/'], 'qr' => ['nullable', 'string', 'max:1000'], 'scan_ticket' => ['nullable', 'string', 'max:2000']]);
        $student = DB::table('basic_students')->where('university_number', $data['university_number'])->where('is_active', true)->first();
        if (! $student) throw ValidationException::withMessages(['university_number' => [__('basic_attendance.message28')]]);
        if (DB::table('basic_otp_challenges')->where('student_id', $student->id)->where('created_at', '>', now()->subHour())->count() >= 10) throw ValidationException::withMessages(['otp' => [__('basic_attendance.message29')]]);
        $bound = $this->boundClaim($r, $data, $student->id);
        $claim = $bound['claim'] ?? null;
        $session = $bound['session'] ?? null;
        $plain = Str::random(64); $otp = (string) random_int(100000, 999999);
        $expiresAt = now()->addMinutes(5);
        if ($claim && $expiresAt->greaterThan($claim->expires_at)) $expiresAt = \Carbon\Carbon::parse($claim->expires_at);
        DB::table('basic_otp_challenges')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', $plain), 'otp_hash' => Hash::make($otp), 'expires_at' => $expiresAt, 'scan_claim_id' => $claim?->id, 'pending_session_id' => $session?->id, 'pending_version' => $claim?->version, 'pending_phase' => $claim?->phase, 'created_at' => now(), 'updated_at' => now()]);
        try { Mail::raw(__('basic_attendance.email_body', ['otp' => $otp]), fn ($mail) => $mail->to($student->email)->subject(__('basic_attendance.message31'))); }
        catch (\Throwable $e) {
            DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $plain))->delete();
            if ($claim && empty($data['scan_ticket'])) DB::table('basic_scan_claims')->where('id', $claim->id)->delete();
            throw ValidationException::withMessages(['email' => [__('basic_attendance.message32')]]);
        }
        $response = ApiResponse::success(['challenge_token' => $plain, 'claim_expires_at' => $claim ? \Carbon\Carbon::parse($claim->expires_at)->toIso8601String() : null], __('basic_attendance.message33'));
        $minutes = $claim ? max(1, (int) ceil((\Carbon\Carbon::parse($claim->expires_at)->timestamp - now()->timestamp) / 60)) : 0;
        return $claim ? $response->cookie(cookie(BasicAttendanceService::SCAN_CLAIM_COOKIE, $bound['token'], $minutes, '/', null, app()->isProduction() || $r->isSecure(), true, false, 'Lax')) : $response;
    }

    public function verifyOtp(Request $r)
    {
        $data = $r->validate(['challenge_token' => ['required', 'string', 'size:64'], 'otp' => ['required', 'digits:6'], 'remember' => ['required', 'boolean']]);
        $result = DB::transaction(function () use ($data, $r) {
            $c = DB::table('basic_otp_challenges')->where('token_hash', hash('sha256', $data['challenge_token']))->lockForUpdate()->first();
            if (! $c || $c->consumed_at || now()->greaterThanOrEqualTo($c->expires_at) || $c->attempts >= 5) return ['error' => __('basic_attendance.message34')];
            if (! Hash::check($data['otp'], $c->otp_hash)) { DB::table('basic_otp_challenges')->where('id', $c->id)->increment('attempts'); return ['error' => __('basic_attendance.message35')]; }
            $student = DB::table('basic_students')->where('id', $c->student_id)->where('is_active', true)->first();
            if (! $student) return ['error' => __('basic_attendance.message36')];
            if ($c->scan_claim_id) {
                $claim = DB::table('basic_scan_claims')->where('id', $c->scan_claim_id)->first();
                $browserToken = (string) $r->cookie(BasicAttendanceService::SCAN_CLAIM_COOKIE);
                if (! $claim || strlen($browserToken) !== 64 || ! hash_equals($claim->token_hash, hash('sha256', $browserToken))) return ['error' => __('basic_attendance.claim_browser_mismatch')];
            }
            $attendance = null; $attendanceError = null;
            if ($c->scan_claim_id) {
                try { $attendance = $this->service->confirmClaim($student->id, $c->scan_claim_id); }
                catch (ValidationException $e) {
                    $attendanceError = collect($e->errors())->flatten()->first();
                    DB::table('basic_scan_claims')->where('id', $c->scan_claim_id)->whereNull('consumed_at')->update(['consumed_at' => now(), 'updated_at' => now()]);
                }
            }
            DB::table('basic_otp_challenges')->where('id', $c->id)->update(['consumed_at' => now()]);
            $token = Str::random(80); $minutes = $data['remember'] ? 30 * 24 * 60 : 120;
            DB::table('basic_trusted_devices')->insert(['student_id' => $student->id, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addMinutes($minutes), 'created_at' => now(), 'updated_at' => now()]);
            return ['token' => $token, 'minutes' => $minutes, 'student' => ['id' => $student->id, 'name' => $student->name, 'university_number' => $student->university_number], 'challenge' => $c, 'attendance' => $attendance, 'attendance_error' => $attendanceError];
        });
        if (isset($result['error'])) throw ValidationException::withMessages(['otp' => [$result['error']]]);
        $response = ApiResponse::success(['student' => $result['student'], 'attendance' => $result['attendance'], 'attendance_error' => $result['attendance_error'], 'remembered_days' => $data['remember'] ? 30 : null])
            ->cookie(cookie(BasicAttendanceService::COOKIE, $result['token'], $result['minutes'], '/', null, app()->isProduction() || $r->isSecure(), true, false, 'Lax'));
        return $result['challenge']->scan_claim_id ? $response->withoutCookie(BasicAttendanceService::SCAN_CLAIM_COOKIE) : $response;
    }

    public function scan(Request $r)
    {
        $data = $r->validate(['qr' => ['required', 'string', 'max:1000']]);
        $student = $this->service->identity((string) $r->cookie(BasicAttendanceService::COOKIE));
        abort_unless($student, 401);
        return ApiResponse::success($this->service->scan($student->id, $this->service->validateToken($data['qr'])), __('basic_attendance.message37'));
    }
}
