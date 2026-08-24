<?php

// As of Phase 2, the API genuinely uses sessions: Sanctum's SPA mode
// (bootstrap/app.php's statefulApi()) authenticates requests from the
// configured frontend origin via this session cookie rather than a bearer
// token — see config/sanctum.php and app/Http/Controllers/Api/V1/
// AuthController.php. `secure` must be false for local http:// development
// (see .env.example's SESSION_SECURE_COOKIE) and true in any real
// deployment, which always serves over https.

return [

    'driver' => env('SESSION_DRIVER', 'database'),

    'lifetime' => (int) env('SESSION_LIFETIME', 120),

    'expire_on_close' => false,

    'encrypt' => env('SESSION_ENCRYPT', true),

    'files' => storage_path('framework/sessions'),

    'connection' => env('SESSION_CONNECTION'),

    'table' => env('SESSION_TABLE', 'sessions'),

    'store' => env('SESSION_STORE'),

    'lottery' => [2, 100],

    'cookie' => env('SESSION_COOKIE', 'cdms_session'),

    'path' => '/',

    'domain' => env('SESSION_DOMAIN'),

    'secure' => env('SESSION_SECURE_COOKIE', true),

    'http_only' => true,

    'same_site' => env('SESSION_SAME_SITE', 'lax'),

    'partitioned' => false,

];
