<?php

namespace Tests\Feature;

use Illuminate\Console\Scheduling\Schedule;
use Tests\TestCase;

class OperationalReadinessTest extends TestCase
{
    public function test_readiness_fails_when_automatic_backups_are_disabled(): void
    {
        config()->set('operations.backup.enabled', false);

        $this->artisan('cdms:readiness')
            ->expectsOutputToContain('BACKUP_ENABLED is false')
            ->assertFailed();
    }

    public function test_failed_job_pruning_is_scheduled(): void
    {
        $events = app(Schedule::class)->events();

        $this->assertTrue(collect($events)->contains(
            fn ($event) => str_contains($event->command ?? '', 'queue:prune-failed --hours=720')
        ));
    }
}
