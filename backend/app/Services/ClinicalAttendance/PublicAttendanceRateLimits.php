<?php

namespace App\Services\ClinicalAttendance;

use App\Http\Responses\ApiResponse;
use App\Services\StudentPublicIdentityService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;

/** A campus NAT is a network, not a student identity. Never bucket missing tokens together. */
class PublicAttendanceRateLimits
{
    public static function reads(Request $request): array
    {
        $limits = [self::limit(3000, 'attendance-read-network:'.$request->ip())];
        if ($identity = self::identity($request)) {
            $limits[] = self::limit(60, 'attendance-read-identity:'.$identity);
        }

        return $limits;
    }

    public static function scans(Request $request): array
    {
        $limits = [self::limit(3000, 'attendance-scan-network:'.$request->ip())];
        if ($identity = self::identity($request)) {
            $limits[] = self::limit(30, 'attendance-scan-identity:'.$identity);
        }

        return $limits;
    }

    public static function requestOtp(Request $request): array
    {
        $limits = [self::limit(1000, 'attendance-otp-network:'.$request->ip())];
        $number = trim((string) $request->input('university_number'));
        if ($number !== '') {
            $limits[] = Limit::perHour(10)->by('attendance-otp-student:'.hash('sha256', $number))->response(self::response(...));
        }

        return $limits;
    }

    public static function verifyOtp(Request $request): array
    {
        $limits = [self::limit(3000, 'attendance-verify-network:'.$request->ip())];
        $challenge = (string) $request->input('challenge_token');
        if ($challenge !== '') {
            $limits[] = self::limit(10, 'attendance-verify-challenge:'.hash('sha256', $challenge));
        }
        if ($identity = self::identity($request)) {
            $limits[] = self::limit(30, 'attendance-verify-identity:'.$identity);
        }

        return $limits;
    }

    private static function identity(Request $request): ?string
    {
        $value = (string) ($request->input('access_token') ?: $request->cookie(StudentPublicIdentityService::COOKIE));

        return $value !== '' ? hash('sha256', $value) : null;
    }

    private static function limit(int $count, string $key): Limit
    {
        return Limit::perMinute($count)->by($key)->response(self::response(...));
    }

    private static function response(Request $request, array $headers)
    {
        $seconds = max(1, (int) ($headers['Retry-After'] ?? 60));

        return ApiResponse::error(app()->getLocale() === 'en' ? "Please wait {$seconds} seconds before trying again." : "يرجى الانتظار {$seconds} ثانية قبل إعادة المحاولة.", [], ['retry_after_seconds' => $seconds], 429)->withHeaders($headers);
    }
}
