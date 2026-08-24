<?php

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schedule;

Artisan::command('cdms:readiness', function () {
    $failures = [];

    if (! config('app.key')) {
        $failures[] = 'APP_KEY is missing.';
    }
    if (app()->environment('production') && config('app.debug')) {
        $failures[] = 'APP_DEBUG must be false in production.';
    }
    if (app()->environment('production') && config('queue.default') === 'sync') {
        $failures[] = 'QUEUE_CONNECTION must use database or redis in production.';
    }
    if (config('session.driver') !== 'database') {
        $failures[] = 'SESSION_DRIVER must be database.';
    }
    if (app()->environment('production') && ! config('session.secure')) {
        $failures[] = 'SESSION_SECURE_COOKIE must be true in production.';
    }

    $origins = config('cors.allowed_origins', []);
    if ($origins === [] || in_array('*', $origins, true)) {
        $failures[] = 'FRONTEND_URLS must contain explicit trusted origins.';
    }

    if (config('operations.backup.enabled')) {
        if (! class_exists(\Spatie\Backup\Commands\BackupCommand::class)) {
            $failures[] = 'BACKUP_ENABLED=true but spatie/laravel-backup is not installed.';
        }
        if (! in_array('s3', config('backup.backup.destination.disks', []), true)) {
            $failures[] = 'The backup destination must include s3.';
        }
        if (! config('filesystems.disks.s3.key') || ! config('filesystems.disks.s3.secret') || ! config('filesystems.disks.s3.bucket')) {
            $failures[] = 'S3 backup credentials/bucket are incomplete.';
        }
        if (! config('backup.backup.password')) {
            $failures[] = 'BACKUP_ARCHIVE_PASSWORD is required when backups are enabled.';
        }
    } else {
        $failures[] = 'BACKUP_ENABLED is false; no automatic recovery point will be created.';
    }

    if ($failures !== []) {
        $this->error('CDMS is not production-ready:');
        foreach ($failures as $failure) {
            $this->line(" - {$failure}");
        }
        return \Symfony\Component\Console\Command\Command::FAILURE;
    }

    $this->info('CDMS production readiness checks passed.');
    return \Symfony\Component\Console\Command\Command::SUCCESS;
})->purpose('Validate production-critical CDMS configuration');

if (config('operations.backup.enabled') && class_exists(\Spatie\Backup\Commands\BackupCommand::class)) {
    Schedule::command('backup:run --only-db')
        ->dailyAt('02:00')
        ->withoutOverlapping(180)
        ->onOneServer();
    Schedule::command('backup:clean')
        ->dailyAt('02:30')
        ->withoutOverlapping(180)
        ->onOneServer();
    Schedule::command('backup:monitor')
        ->dailyAt('03:00')
        ->withoutOverlapping(60)
        ->onOneServer();
} elseif (config('operations.backup.enabled')) {
    Log::critical('Automatic backup requested but spatie/laravel-backup is not installed.');
}

Schedule::command('queue:prune-failed --hours=720')
    ->dailyAt('03:30')
    ->withoutOverlapping();
