<?php

return [
    'student_email_domain' => env('STUDENT_EMAIL_DOMAIN', 'students.hebron.edu'),
    'otp_enabled' => (bool) env('GROUP_REGISTRATION_OTP_ENABLED', true),
    'otp_ttl_minutes' => (int) env('GROUP_REGISTRATION_OTP_TTL_MINUTES', 10),
    'session_ttl_minutes' => (int) env('GROUP_REGISTRATION_SESSION_TTL_MINUTES', 20),
    'max_otp_attempts' => 5,
];
