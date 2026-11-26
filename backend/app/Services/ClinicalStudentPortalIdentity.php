<?php

namespace App\Services;

use App\Mail\ClinicalPortalOtpMail;
use App\Models\Student;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Cookie;

class ClinicalStudentPortalIdentity
{
    public const COOKIE = 'cdms_clinical_marks';

    public function student(Request $request): ?Student
    {
        $token = $request->cookie(self::COOKIE);
        if (! is_string($token) || strlen($token) !== 80) {
            return null;
        }
        $id = DB::table('clinical_portal_sessions')->where('token_hash', hash('sha256', $token))
            ->whereNull('revoked_at')->where('expires_at', '>', now())->value('student_id');

        return $id ? $this->eligible()->find($id) : null;
    }

    public function requestCode(string $number): string
    {
        $student = $this->eligible()->where('university_number', $number)->first();
        $token = Str::random(64);
        $otp = (string) random_int(100000, 999999);
        // The same response for unknown/ineligible numbers prevents directory enumeration.
        $id = DB::table('clinical_portal_challenges')->insertGetId([
            'token_hash' => hash('sha256', $token), 'student_id' => $student?->id,
            'otp_hash' => Hash::make($otp), 'attempts' => 0, 'expires_at' => now()->addMinutes(10),
        ]);
        if ($student) {
            try {
                Mail::to($student->university_number.'@'.config('group_registration.student_email_domain'))->send(new ClinicalPortalOtpMail($otp));
            } catch (\Throwable $error) {
                Log::warning('Clinical student verification delivery failed', ['exception_class' => $error::class]);
                DB::table('clinical_portal_challenges')->where('id', $id)->update(['consumed_at' => now()]);
                // Do not reveal eligibility, OTP values, or email addresses in the response/log.
            }
        }

        return $token;
    }

    public function verify(string $challenge, string $otp): ?string
    {
        // Commit failed-attempt counters rather than throwing inside the transaction.
        return DB::transaction(function () use ($challenge, $otp) {
            $row = DB::table('clinical_portal_challenges')->where('token_hash', hash('sha256', $challenge))->lockForUpdate()->first();
            if (! $row || $row->consumed_at || now()->gte($row->expires_at) || $row->attempts >= 5) {
                return null;
            }
            DB::table('clinical_portal_challenges')->where('id', $row->id)->increment('attempts');
            if (! Hash::check($otp, $row->otp_hash) || ! $row->student_id || ! $this->eligible()->whereKey($row->student_id)->exists()) {
                return null;
            }
            DB::table('clinical_portal_challenges')->where('id', $row->id)->update(['consumed_at' => now()]);

            return (string) $row->student_id;
        });
    }

    public function createSession(int $studentId, bool $remember, Request $request): Cookie
    {
        $this->forget($request);
        $token = Str::random(80);
        $minutes = $remember ? 30 * 24 * 60 : 8 * 60;
        DB::table('clinical_portal_sessions')->insert(['student_id' => $studentId, 'token_hash' => hash('sha256', $token), 'expires_at' => now()->addMinutes($minutes)]);

        return cookie(self::COOKIE, $token, $remember ? $minutes : 0, '/api/v1/public/clinical-student', null, app()->isProduction() || $request->isSecure(), true, false, 'Lax');
    }

    public function forget(Request $request): void
    {
        $token = $request->cookie(self::COOKIE);
        if (is_string($token)) {
            DB::table('clinical_portal_sessions')->where('token_hash', hash('sha256', $token))->update(['revoked_at' => now()]);
        }
    }

    private function eligible()
    {
        return Student::query()->whereIn('academic_level', ['fourth', 'fifth', 'sixth'])
            ->where('registration_status', 'active')->where('academic_registration_status', 'registered');
    }
}
