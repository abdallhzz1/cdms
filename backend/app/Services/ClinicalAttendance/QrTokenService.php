<?php

namespace App\Services\ClinicalAttendance;

use App\Models\ClinicalQrAttendanceSession;
use Illuminate\Support\Str;

class QrTokenService
{
    public function issue(ClinicalQrAttendanceSession $session): array
    {
        $seconds = max(5, (int) config('clinical_attendance.rotation_seconds', 15));
        $issued = now()->timestamp;
        $claims = ['s' => $session->public_id, 'p' => $session->state === 'check_out_open' ? 'check_out' : 'check_in', 'iat' => $issued, 'exp' => $issued + $seconds, 'n' => Str::random(32)];
        $encoded = rtrim(strtr(base64_encode(json_encode($claims, JSON_THROW_ON_ERROR)), '+/', '-_'), '=');
        $signature = hash_hmac('sha256', $encoded, $this->key());

        return ['token' => $encoded.'.'.$signature, 'phase' => $claims['p'], 'expires_at' => now()->addSeconds($seconds)->toIso8601String()];
    }

    public function validate(string $token, bool $allowExpired = false): array
    {
        [$encoded, $signature] = array_pad(explode('.', $token, 2), 2, null);
        if (!$encoded || !$signature || !hash_equals(hash_hmac('sha256', $encoded, $this->key()), $signature)) abort(422, 'رمز الحضور غير صالح. وجّه الكاميرا إلى الرمز الحالي.');
        $json = base64_decode(strtr($encoded, '-_', '+/'), true);
        $claims = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($claims) || !isset($claims['s'], $claims['p'], $claims['iat'], $claims['exp'], $claims['n']) || !in_array($claims['p'], ['check_in', 'check_out'], true)) abort(422, 'رمز الحضور غير صالح.');
        if (! $allowExpired && (int) $claims['exp'] + max(0, (int) config('clinical_attendance.grace_seconds', 5)) < now()->timestamp) abort(422, 'انتهت صلاحية الرمز. انتظر الرمز التالي ثم امسحه.');
        return $claims;
    }

    private function key(): string { return hash_hmac('sha256', 'clinical-qr-attendance-v1', (string) config('app.key')); }
}
