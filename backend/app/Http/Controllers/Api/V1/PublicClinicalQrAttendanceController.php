<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Responses\ApiResponse;
use App\Services\ClinicalAttendance\QrAttendanceService;
use App\Services\StudentPublicIdentityService;
use App\Models\Student;
use App\Models\StudentScheduleOtpChallenge;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PublicClinicalQrAttendanceController extends Controller
{
    public function requestOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['university_number' => ['required', 'string', 'max:20', 'regex:/^[0-9]+$/']]);
        $student = Student::where('university_number', $data['university_number'])->first();
        if (!$student || $student->academic_registration_status !== 'registered') {
            throw ValidationException::withMessages(['university_number' => ['تعذر متابعة الطلب. يرجى التواصل مع إدارة الدائرة السريرية.']]);
        }
        if (!config('group_registration.otp_enabled')) {
            $token = Str::random(80);
            StudentScheduleOtpChallenge::create(['student_id' => $student->id, 'challenge_token_hash' => hash('sha256', Str::random(64)), 'otp_hash' => Hash::make(Str::random(32)), 'expires_at' => now(), 'verified_at' => now(), 'consumed_at' => now(), 'access_token_hash' => hash('sha256', $token), 'access_expires_at' => now()->addMinutes(config('group_registration.session_ttl_minutes')), 'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key'))]);
            return ApiResponse::success(['otp_required' => false, 'access_token' => $token], 'تم فتح جلسة تحقق مؤقتة.');
        }
        $otp = (string) random_int(100000, 999999); $challengeToken = Str::random(64);
        StudentScheduleOtpChallenge::create(['student_id' => $student->id, 'challenge_token_hash' => hash('sha256', $challengeToken), 'otp_hash' => Hash::make($otp), 'expires_at' => now()->addMinutes(config('group_registration.otp_ttl_minutes')), 'request_ip_hash' => hash_hmac('sha256', (string) $request->ip(), (string) config('app.key'))]);
        try { Mail::raw("رمز التحقق الخاص بالحضور السريري هو: {$otp}\n\nلا تشارك الرمز مع أي شخص.", fn ($mail) => $mail->to($student->university_number.'@'.config('group_registration.student_email_domain'))->subject('رمز التحقق للحضور السريري')); }
        catch (\Throwable) { throw ValidationException::withMessages(['university_number' => ['تعذر إرسال الرمز حالياً.']]); }
        return ApiResponse::success(['otp_required' => true, 'challenge_token' => $challengeToken, 'expires_in_seconds' => config('group_registration.otp_ttl_minutes') * 60], 'تم إرسال رمز التحقق إلى بريدك الجامعي.');
    }

    public function verifyOtp(Request $request): JsonResponse
    {
        $data = $request->validate(['challenge_token' => ['required', 'string', 'size:64'], 'otp' => ['required', 'digits:6']]);
        [$token, $error] = DB::transaction(function () use ($data): array {
            $challenge = StudentScheduleOtpChallenge::where('challenge_token_hash', hash('sha256', $data['challenge_token']))->lockForUpdate()->first();
            if (!$challenge || $challenge->consumed_at || $challenge->expires_at->isPast() || $challenge->attempts >= config('group_registration.max_otp_attempts')) return [null, 'رمز التحقق غير صالح أو انتهت صلاحيته.'];
            if (!Hash::check($data['otp'], $challenge->otp_hash)) { $challenge->increment('attempts'); return [null, 'رمز التحقق غير صحيح.']; }
            $token = Str::random(80); $challenge->update(['verified_at' => now(), 'consumed_at' => now(), 'access_token_hash' => hash('sha256', $token), 'access_expires_at' => now()->addMinutes(config('group_registration.session_ttl_minutes'))]);
            return [$token, null];
        });
        if (!$token) throw ValidationException::withMessages(['otp' => [$error]]);
        return ApiResponse::success(['access_token' => $token, 'expires_in_seconds' => config('group_registration.session_ttl_minutes') * 60], 'تم التحقق بنجاح.');
    }

    public function identity(Request $request, StudentPublicIdentityService $identity): JsonResponse
    {
        $data = $request->validate(['access_token' => ['nullable', 'string', 'size:80']]);
        $student = $identity->resolve($request, $data['access_token'] ?? null);
        abort_unless($student?->academic_registration_status === 'registered', 401, 'يلزم التحقق برقمك الجامعي ورمز البريد أولاً.');
        return ApiResponse::success(['student' => ['name' => $student->full_name_ar, 'university_number' => $student->university_number]]);
    }

    public function scan(Request $request, StudentPublicIdentityService $identity, QrAttendanceService $service): JsonResponse
    {
        $data = $request->validate(['qr_token' => ['required', 'string', 'max:1000'], 'access_token' => ['nullable', 'string', 'size:80']]);
        $student = $identity->resolve($request, $data['access_token'] ?? null);
        abort_unless($student?->academic_registration_status === 'registered', 401, 'انتهت جلسة التحقق. يرجى التحقق من رقمك الجامعي مجدداً.');
        return ApiResponse::success($service->scan($request, $student, $data['qr_token']), 'تم تسجيل العملية بنجاح.');
    }
}
