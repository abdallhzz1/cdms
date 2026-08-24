<?php

return [
    'health' => [
        'minimum_free_storage_mb' => (int) env('HEALTH_MIN_FREE_STORAGE_MB', 100),
        'stalled_job_minutes' => (int) env('HEALTH_STALLED_JOB_MINUTES', 5),
    ],
    'backup' => [
        'enabled' => (bool) env('BACKUP_ENABLED', false),
    ],
];
