<?php

use Laravel\Sanctum\Sanctum;

// Hand-authored to match laravel/sanctum's own published default config
// (this sandbox cannot run `composer require` + `vendor:publish` — see
// docs/DECISIONS.md ADR-019). Review against the installed package's
// stub after `composer update` if a newer Sanctum major changes its shape.

return [

    /*
    |--------------------------------------------------------------------------
    | Stateful Domains
    |--------------------------------------------------------------------------
    | Requests from these origins authenticate via the session cookie
    | (first-party SPA) instead of needing a bearer token. Only the
    | configured frontend origin(s) belong here — never a wildcard.
    | SANCTUM_STATEFUL_DOMAINS is host[:port], no scheme (e.g.
    | "localhost:5173", not "http://localhost:5173").
    */
    'stateful' => explode(',', (string) env(
        'SANCTUM_STATEFUL_DOMAINS',
        sprintf(
            '%s,%s',
            'localhost,localhost:3000,127.0.0.1,127.0.0.1:8000,::1,cdms.four7.ps',
            Sanctum::currentApplicationUrlWithPort(),
        )
    )),

    'guard' => ['web'],

    /*
    | Token expiration in minutes. Irrelevant to the SPA cookie flow this
    | app uses (no personal access tokens are issued — see
    | docs/DECISIONS.md ADR-019); kept null (never expire) for forward
    | compatibility if a token-issuing endpoint is added later.
    */
    'expiration' => null,

    'token_prefix' => env('SANCTUM_TOKEN_PREFIX', ''),

    'middleware' => [
        'authenticate_session' => Laravel\Sanctum\Http\Middleware\AuthenticateSession::class,
        'encrypt_cookies' => Illuminate\Cookie\Middleware\EncryptCookies::class,
        'validate_csrf_token' => Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class,
    ],

];
