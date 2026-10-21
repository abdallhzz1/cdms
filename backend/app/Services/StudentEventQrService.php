<?php

namespace App\Services;

use App\Models\StudentEvent;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class StudentEventQrService
{
    public function issue(StudentEvent $event): array
    {
        $expires = now()->addSeconds(20);
        $payload = rtrim(strtr(base64_encode(json_encode([
            'event' => $event->public_id, 'exp' => $expires->timestamp, 'nonce' => Str::random(20),
        ], JSON_THROW_ON_ERROR)), '+/', '-_'), '=');

        return ['token' => $payload.'.'.hash_hmac('sha256', $payload, $this->key()),
            'expires_at' => $expires->toIso8601String()];
    }

    public function validate(string $token): StudentEvent
    {
        [$payload, $signature] = array_pad(explode('.', $token, 2), 2, '');
        if (!$payload || !hash_equals(hash_hmac('sha256', $payload, $this->key()), $signature)) {
            throw ValidationException::withMessages(['qr_token' => [__('student_events.invalid_qr')]]);
        }
        $claims = json_decode((string) base64_decode(strtr($payload, '-_', '+/'), true), true);
        if (!is_array($claims) || !is_string($claims['event'] ?? null) || !is_int($claims['exp'] ?? null)
            || $claims['exp'] + 5 < now()->timestamp) {
            throw ValidationException::withMessages(['qr_token' => [__('student_events.expired_qr')]]);
        }
        $event = StudentEvent::where('public_id', $claims['event'])->first();
        if (!$event || $event->status !== 'published')
            throw ValidationException::withMessages(['qr_token' => [__('student_events.unavailable')]]);
        if (!now()->betweenIncluded($event->check_in_opens_at, $event->check_in_closes_at))
            throw ValidationException::withMessages(['qr_token' => [__('student_events.window_closed')]]);
        return $event;
    }

    private function key(): string
    {
        return hash_hmac('sha256', 'student-event-qr-v1', (string) config('app.key'));
    }
}
