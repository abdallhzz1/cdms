<?php

// Standard Laravel auth configuration. 'web' (session-based) is the guard
// Auth::attempt()/login()/logout() use in AuthController — Sanctum's SPA
// mode authenticates API requests via that same session, not a separate
// token guard (see config/sanctum.php, bootstrap/app.php's statefulApi()).
// The 'sanctum' guard below is what `auth:sanctum` route middleware checks;
// Sanctum's own service provider resolves it to session-or-token
// automatically once laravel/sanctum is installed (composer.json).

return [

    'defaults' => [
        'guard' => 'web',
        'passwords' => 'users',
    ],

    'guards' => [
        'web' => [
            'driver' => 'session',
            'provider' => 'users',
        ],

        'sanctum' => [
            'driver' => 'sanctum',
            'provider' => 'users',
        ],
    ],

    'providers' => [
        'users' => [
            'driver' => 'eloquent',
            'model' => env('AUTH_MODEL', App\Models\User::class),
        ],
    ],

    'passwords' => [
        'users' => [
            'provider' => 'users',
            'table' => 'password_reset_tokens',
            'expire' => 60,
            'throttle' => 60,
        ],
    ],

    // No password-reset flow is exposed in Phase 2 (Prompt 02 does not ask
    // for one) — this value only controls the timeout window Laravel's
    // password broker would use if/when that feature is added.
    'password_timeout' => 10800,

];
