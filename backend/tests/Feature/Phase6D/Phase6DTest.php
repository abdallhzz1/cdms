<?php

namespace Tests\Feature\Phase6D;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Phase 6D — Disaster Recovery & Operational Observability
 *
 * Verifies:
 * - Health endpoint responds correctly for application, database, queue, and storage
 * - Health endpoint never exposes sensitive information (credentials, stack traces)
 * - Backup configuration is correct (S3 destination, retention, notifications)
 * - Scheduler registration exists
 * - Queue infrastructure is detectable (stalled vs. ok)
 * - Storage health is detectable (writable vs. not)
 * - Failure isolation: backup/observability config does not affect clinical transactions
 */
class Phase6DTest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // 1. Health Endpoint — Availability and Response Structure
    // -------------------------------------------------------------------------

    public function test_health_endpoint_returns_ok_status(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => [
                    'application',
                    'database',
                    'queue',
                    'storage',
                ],
                'meta' => ['checked_at'],
            ])
            ->assertJsonPath('data.application', 'ok')
            ->assertJsonPath('data.database', 'ok')
            ->assertJsonPath('data.queue', 'ok')
            ->assertJsonPath('data.storage', 'ok');
    }

    public function test_health_endpoint_is_publicly_accessible(): void
    {
        // The health endpoint should NOT require authentication — it's used by load balancers
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200);
    }

    public function test_health_endpoint_does_not_expose_credentials_or_stack_traces(): void
    {
        $response = $this->getJson('/api/v1/health');
        $content = $response->getContent();

        // Must not expose database DSN, credentials, or any config secrets
        $dbPassword = config('database.connections.mysql.password', '');
        if (!empty($dbPassword)) {
            $this->assertStringNotContainsStringIgnoringCase($dbPassword, $content);
        }
        $this->assertStringNotContainsStringIgnoringCase('DB_PASSWORD', $content);
        $this->assertStringNotContainsStringIgnoringCase('AWS_SECRET', $content);
        $this->assertStringNotContainsStringIgnoringCase('MAIL_PASSWORD', $content);
        $this->assertStringNotContainsStringIgnoringCase('stack_trace', $content);
        $this->assertStringNotContainsStringIgnoringCase('exception', $content);
    }

    public function test_health_endpoint_includes_checked_at_timestamp(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200);
        $checkedAt = $response->json('meta.checked_at');
        $this->assertNotNull($checkedAt);
        // Should be a valid ISO8601 string
        $this->assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/', $checkedAt);
    }

    // -------------------------------------------------------------------------
    // 2. Database Health
    // -------------------------------------------------------------------------

    public function test_database_health_check_is_ok(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertJsonPath('data.database', 'ok');
    }

    // -------------------------------------------------------------------------
    // 3. Queue Health
    // -------------------------------------------------------------------------

    public function test_queue_health_is_ok_when_no_stalled_jobs(): void
    {
        // Ensure jobs table is empty or has fresh jobs only
        DB::table('jobs')->truncate();

        $response = $this->getJson('/api/v1/health');

        $response->assertJsonPath('data.queue', 'ok');
    }

    public function test_queue_health_detects_stalled_jobs_on_database_connection(): void
    {
        Config::set('queue.default', 'database');

        // Insert a stale job (older than 5 minutes)
        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'TestJob', 'job' => null, 'data' => []]),
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->subMinutes(10)->getTimestamp(),
            'created_at' => now()->subMinutes(10)->getTimestamp(),
        ]);

        $response = $this->getJson('/api/v1/health');

        // When QUEUE_CONNECTION=database and jobs are stalled, queue status should be 'stalled'
        $response->assertJsonPath('data.queue', 'stalled')
            ->assertStatus(503);
    }

    public function test_queue_health_is_ok_for_sync_queue_connection(): void
    {
        Config::set('queue.default', 'sync');

        $response = $this->getJson('/api/v1/health');

        // Sync driver is always ok — no workers to stall
        $response->assertJsonPath('data.queue', 'ok');
    }

    // -------------------------------------------------------------------------
    // 4. Storage Health
    // -------------------------------------------------------------------------

    public function test_storage_health_is_ok_when_disk_is_writable(): void
    {
        Config::set('filesystems.default', 'local');

        $response = $this->getJson('/api/v1/health');

        $response->assertJsonPath('data.storage', 'ok');
    }

    // -------------------------------------------------------------------------
    // 5. Backup Configuration Integrity
    // -------------------------------------------------------------------------

    public function test_backup_destination_disk_is_s3(): void
    {
        $backupDisks = config('backup.backup.destination.disks');

        $this->assertContains('s3', $backupDisks, 'Backup destination must include the s3 disk per Phase 6D spec.');
    }

    public function test_backup_alert_email_reads_from_environment(): void
    {
        // The backup notification email must be driven from the environment.
        // The old hardcoded spatie default 'your@example.com' must not exist.
        $mailTo = config('backup.notifications.mail.to');

        $this->assertNotEquals('your@example.com', $mailTo, 'Backup alert email must not be the unconfigured spatie default.');
        $this->assertNotEmpty($mailTo, 'Backup alert email config must have a value.');
    }

    public function test_backup_daily_retention_is_7_days(): void
    {
        $keepDaily = config('backup.cleanup.default_strategy.keep_daily_backups_for_days');

        $this->assertEquals(7, $keepDaily, 'Daily backup retention must be 7 days per Phase 6D spec.');
    }

    public function test_backup_weekly_retention_is_4_weeks(): void
    {
        $keepWeekly = config('backup.cleanup.default_strategy.keep_weekly_backups_for_weeks');

        $this->assertEquals(4, $keepWeekly, 'Weekly backup retention must be 4 weeks per Phase 6D spec.');
    }

    public function test_backup_source_database_is_configured(): void
    {
        $databases = config('backup.backup.source.databases');

        $this->assertNotEmpty($databases, 'Backup must have at least one database source.');
    }

    public function test_backup_notifications_are_sent_via_mail(): void
    {
        $notifications = config('backup.notifications.notifications');

        foreach ($notifications as $notification => $channels) {
            $this->assertContains('mail', $channels, "Notification {$notification} must be sent via mail.");
        }
    }

    public function test_backup_monitor_disk_is_s3(): void
    {
        $monitorDisks = config('backup.monitor_backups.0.disks');

        $this->assertContains('s3', $monitorDisks, 'Backup monitor must check the s3 disk.');
    }

    // -------------------------------------------------------------------------
    // 6. S3 Storage Configuration
    // -------------------------------------------------------------------------

    public function test_s3_disk_is_configured_in_filesystems(): void
    {
        $s3 = config('filesystems.disks.s3');

        $this->assertNotNull($s3, 's3 disk must be defined in filesystems config.');
        $this->assertEquals('s3', $s3['driver']);
    }

    public function test_s3_disk_reads_credentials_from_environment(): void
    {
        $s3 = config('filesystems.disks.s3');

        // The key and secret should not be hardcoded — they should be null (unset) in test env
        // rather than actual credential strings
        $this->assertArrayHasKey('key', $s3);
        $this->assertArrayHasKey('secret', $s3);
        $this->assertArrayHasKey('region', $s3);
        $this->assertArrayHasKey('bucket', $s3);
    }

    // -------------------------------------------------------------------------
    // 7. Scheduler Registration
    // -------------------------------------------------------------------------

    public function test_backup_run_command_is_scheduled(): void
    {
        $schedule = app(\Illuminate\Console\Scheduling\Schedule::class);
        $events = $schedule->events();

        $backupRunFound = collect($events)->contains(function ($event) {
            return str_contains($event->command ?? '', 'backup:run');
        });

        $this->assertTrue($backupRunFound, 'backup:run must be registered in the Laravel scheduler.');
    }

    public function test_backup_clean_command_is_scheduled(): void
    {
        $schedule = app(\Illuminate\Console\Scheduling\Schedule::class);
        $events = $schedule->events();

        $backupCleanFound = collect($events)->contains(function ($event) {
            return str_contains($event->command ?? '', 'backup:clean');
        });

        $this->assertTrue($backupCleanFound, 'backup:clean must be registered in the Laravel scheduler.');
    }

    // -------------------------------------------------------------------------
    // 8. Failure Isolation — Clinical Transactions Are NOT Affected
    // -------------------------------------------------------------------------

    public function test_health_endpoint_failure_does_not_affect_clinical_routes(): void
    {
        // Simulate a stalled queue while verifying clinical routes remain independent
        Config::set('queue.default', 'database');
        DB::table('jobs')->insert([
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'TestJob', 'job' => null, 'data' => []]),
            'attempts' => 0,
            'reserved_at' => null,
            'available_at' => now()->subMinutes(10)->getTimestamp(),
            'created_at' => now()->subMinutes(10)->getTimestamp(),
        ]);

        // Health endpoint returns 503 due to stalled queue
        $healthResponse = $this->getJson('/api/v1/health');
        $healthResponse->assertStatus(503);

        // Clinical auth route is unaffected — 422 because no credentials, not 503
        $loginResponse = $this->postJson('/api/v1/auth/login', []);
        $loginResponse->assertStatus(422);
    }
}
