<?php

return [

    'default' => env('FILESYSTEM_DISK', 'local'),

    /*
    |--------------------------------------------------------------------------
    | Filesystem Disks
    |--------------------------------------------------------------------------
    | 'local' (private) is the default: matches PROJECT_RULES.md §5/§6 — file
    | content lives in controlled storage, never a public/unauthenticated
    | path, and every download goes through an authorized route. No business
    | document/attachment storage is wired up yet; this is only the
    | Foundation-phase disk configuration.
    */
    'disks' => [

        'local' => [
            'driver' => 'local',
            'root' => storage_path('app/private'),
            'serve' => true,
            'throw' => false,
            'report' => false,
        ],

        'public' => [
            'driver' => 'local',
            'root' => storage_path('app/public'),
            'url' => env('APP_URL').'/storage',
            'visibility' => 'public',
            'throw' => false,
            'report' => false,
        ],

        's3' => [
            'driver' => 's3',
            'key' => env('AWS_ACCESS_KEY_ID'),
            'secret' => env('AWS_SECRET_ACCESS_KEY'),
            'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
            'bucket' => env('AWS_BUCKET'),
            'url' => env('AWS_URL'),
            'endpoint' => env('AWS_ENDPOINT'),
            'use_path_style_endpoint' => env('AWS_USE_PATH_STYLE_ENDPOINT', false),
            'visibility' => 'private',
            'throw' => true,
            'report' => true,
        ],

    ],

    'links' => [
        public_path('storage') => storage_path('app/public'),
    ],

];
