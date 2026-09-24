<?php

namespace App\Services;

use App\Models\Student;
use App\Models\StudentScheduleOtpChallenge;
use App\Models\StudentScheduleTrustedDevice;
use Illuminate\Http\Request;

class StudentPublicIdentityService
{
    public const COOKIE = 'cdms_student_schedule';

    public function resolve(Request $request, ?string $accessToken = null): ?Student
    {
        if (is_string($accessToken) && strlen($accessToken) === 80) {
            return StudentScheduleOtpChallenge::with('student')
                ->where('access_token_hash', hash('sha256', $accessToken))
                ->whereNotNull('verified_at')->where('access_expires_at', '>', now())->first()?->student;
        }

        return $this->trustedDevice($request)?->student;
    }

    public function trustedDevice(Request $request): ?StudentScheduleTrustedDevice
    {
        $token = $request->cookie(self::COOKIE);
        if (!is_string($token) || strlen($token) !== 80) return null;

        return StudentScheduleTrustedDevice::with('student')
            ->where('token_hash', hash('sha256', $token))->whereNull('revoked_at')
            ->where('expires_at', '>', now())->first();
    }
}
