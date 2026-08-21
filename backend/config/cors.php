<?php

// CORS is scoped deliberately: only /api/* responds cross-origin, and only to
// the explicitly configured frontend origin(s) — never '*'. Add further
// origins (e.g. a staging frontend URL) via FRONTEND_URLS in .env rather than
// widening this file.

$configuredOrigins = array_unique(array_merge(
    array_filter(array_map(
        'trim',
        explode(',', (string) env('FRONTEND_URLS', env('FRONTEND_URL', 'http://localhost:5173')))
    )),
    ['https://cdms.four7.ps', 'http://cdms.four7.ps', 'http://localhost:5173']
));

return [

    'paths' => ['api/*', 'up', 'sanctum/csrf-cookie'],

    'allowed_methods' => ['*'],

    'allowed_origins' => $configuredOrigins,

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    // Required for Sanctum's SPA cookie authentication (Prompt 02 §5): the
    // frontend's fetch calls send `credentials: 'include'`, and the browser
    // will only actually attach/accept the session + XSRF-TOKEN cookies
    // cross-origin (http://localhost:5173 -> http://localhost:8000 in dev)
    // if this is true AND allowed_origins is an explicit list (never '*',
    // which the CORS spec forbids combining with credentials anyway).
    'supports_credentials' => true,

];
