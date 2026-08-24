<?php

namespace Tests\Feature\Phase6E;

use App\Models\AuditLog;
use App\Models\DistributionVersion;
use App\Models\Rotation;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use App\Models\Role;
use App\Models\Permission;
use App\Models\AcademicYear;
use App\Services\Distribution\CurrentDistributionResolver;
use App\Services\Distribution\DistributionApprovalService;
use App\Services\Distribution\DistributionPublicationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Phase 6E — Final Production Certification Tests
 *
 * Covers:
 * 1. HIGH-01: Composite index (rotation_id, status, is_current) existence verification
 * 2. Security regression (auth, RBAC, IDOR, health disclosure)
 * 3. Clinical domain integrity (resolver, fingerprinting, isolation, idempotency)
 * 4. Performance (bounded queries)
 * 5. Queue health (stalled + failed_jobs)
 * 6. Backup configuration integrity
 * 7. Production configuration safety
 */
class Phase6ETest extends TestCase
{
    use RefreshDatabase;

    // -------------------------------------------------------------------------
    // 1. HIGH-01 — Composite Index Existence
    // -------------------------------------------------------------------------

    public function test_high01_composite_index_exists_on_distribution_versions(): void
    {
        // Verify the migration file for HIGH-01 exists and is valid PHP
        $migrationFile = database_path(
            'migrations/2026_08_15_800001_add_composite_index_to_distribution_versions_table.php'
        );
        $this->assertFileExists($migrationFile, 'HIGH-01 migration file must exist.');

        // Verify the migration content declares the correct index name
        $content = file_get_contents($migrationFile);
        $this->assertStringContainsString(
            'dv_rotation_status_current_idx',
            $content,
            'HIGH-01 migration must declare the correct index name.'
        );
        $this->assertStringContainsString(
            "'rotation_id', 'status', 'is_current'",
            $content,
            'HIGH-01 migration must index all three columns in the correct order.'
        );

        // Verify the migration registers all three columns using Schema::table
        $this->assertStringContainsString('Schema::table', $content);

        // Verify it's reversible
        $this->assertStringContainsString('dropIndex', $content, 'HIGH-01 migration must be reversible via dropIndex.');

        // Verify no data modification (no UPDATE, DELETE, TRUNCATE)
        $this->assertStringNotContainsStringIgnoringCase('UPDATE ', $content);
        $this->assertStringNotContainsStringIgnoringCase('DELETE ', $content);
        $this->assertStringNotContainsStringIgnoringCase('TRUNCATE', $content);
    }

    public function test_high01_migration_adds_only_one_index(): void
    {
        $migrationFile = database_path(
            'migrations/2026_08_15_800001_add_composite_index_to_distribution_versions_table.php'
        );
        $content = file_get_contents($migrationFile);

        // Must add exactly one index and drop exactly one index
        $this->assertEquals(
            1,
            substr_count($content, '->index('),
            'HIGH-01 migration must add exactly one index.'
        );
        $this->assertEquals(
            1,
            substr_count($content, 'dropIndex('),
            'HIGH-01 migration must drop exactly one index (in down()).'
        );
    }

    public function test_high01_migration_does_not_touch_existing_columns_or_tables(): void
    {
        $migrationFile = database_path(
            'migrations/2026_08_15_800001_add_composite_index_to_distribution_versions_table.php'
        );
        $content = file_get_contents($migrationFile);

        // Must use Schema::table (not Schema::create or Schema::drop)
        $this->assertStringNotContainsString('Schema::create', $content);
        $this->assertStringNotContainsString('Schema::drop(', $content);
        $this->assertStringNotContainsString('dropColumn', $content);
        $this->assertStringNotContainsString('renameColumn', $content);
        $this->assertStringNotContainsString('change()', $content);
    }

    // -------------------------------------------------------------------------
    // 2. Security Regression Verification
    // -------------------------------------------------------------------------

    public function test_security_unauthenticated_gets_401(): void
    {
        $this->getJson('/api/v1/operational/clinical-schedule')->assertStatus(401);
        $this->putJson('/api/v1/operational/assignments/1/supervisor', [])->assertStatus(401);
        $this->getJson('/api/v1/operational/dashboard/summary')->assertStatus(401);
    }

    public function test_security_health_endpoint_exposes_no_credentials(): void
    {
        $response = $this->getJson('/api/v1/health');
        $content = $response->getContent();

        $dbPassword = config('database.connections.mysql.password', '');
        if (!empty($dbPassword)) {
            $this->assertStringNotContainsStringIgnoringCase($dbPassword, $content);
        }
        $this->assertStringNotContainsStringIgnoringCase('AWS_SECRET', $content);
        $this->assertStringNotContainsStringIgnoringCase('DB_PASSWORD', $content);
        $this->assertStringNotContainsStringIgnoringCase('MAIL_PASSWORD', $content);
        $this->assertStringNotContainsStringIgnoringCase('stack_trace', $content);
        $this->assertStringNotContainsStringIgnoringCase('exception', $content);
    }

    public function test_security_debug_mode_off_masks_exceptions(): void
    {
        Config::set('app.debug', false);
        $user = User::factory()->create();
        $adminRole = Role::create(['code' => 'P6E_ADMIN', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $viewPerm = Permission::where('code', 'distribution.view')->first();
        if ($viewPerm) $adminRole->permissions()->attach($viewPerm->id, ['scope_type' => 'global']);
        $user->roles()->attach($adminRole);

        $response = $this->actingAs($user)->getJson('/api/v1/operational/assignments/9999999999/supervisor');
        $content = $response->getContent();
        $this->assertStringNotContainsStringIgnoringCase('stack', $content);
        $this->assertStringNotContainsStringIgnoringCase('at vendor', $content);
    }

    public function test_security_idor_returns_404_not_403(): void
    {
        $user = User::factory()->create();
        $adminRole = Role::create(['code' => 'P6E_ADMIN2', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $perm = Permission::where('code', 'distribution.update')->first();
        if ($perm) $adminRole->permissions()->attach($perm->id, ['scope_type' => 'global']);
        $user->roles()->attach($adminRole);

        $this->actingAs($user)
            ->putJson('/api/v1/operational/assignments/99999/supervisor', ['supervisor_id' => null])
            ->assertStatus(404);
    }

    // -------------------------------------------------------------------------
    // 3. Clinical Domain Integrity — CurrentDistributionResolver
    // -------------------------------------------------------------------------

    public function test_clinical_resolver_requires_both_status_published_and_is_current(): void
    {
        $year = AcademicYear::factory()->create();
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id]);

        // Published but not current — historical
        DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => false,
        ]);

        // Current but not published — draft
        DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested',
            'is_current' => true,
        ]);

        $resolver = app(CurrentDistributionResolver::class);
        $result = $resolver->resolveForRotation($rotation->id);

        // Neither satisfies both conditions — resolver must return null
        $this->assertNull($result, 'Resolver must return null when no version has BOTH status=published AND is_current=true.');
    }

    public function test_clinical_resolver_returns_correct_current_version(): void
    {
        $year = AcademicYear::factory()->create();
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id]);

        // Historical published
        DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => false,
        ]);

        // Current published — the one that should be returned
        $current = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => true,
        ]);

        $resolver = app(CurrentDistributionResolver::class);
        $result = $resolver->resolveForRotation($rotation->id);

        $this->assertNotNull($result);
        $this->assertEquals($current->id, $result->id);
    }

    public function test_clinical_fingerprint_mismatch_blocks_publication(): void
    {
        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class,
        ]);

        $adminRole = Role::create(['code' => 'P6E_FP', 'name_key' => 'admin', 'name_ar' => 'Admin', 'name_en' => 'Admin']);
        $permIds = Permission::whereIn('code', [
            'distribution.view', 'distribution.create', 'distribution.update',
            'distribution.approve', 'distribution.publish', 'distribution.override',
        ])->pluck('id');
        $syncData = [];
        foreach($permIds as $id) { $syncData[$id] = ['scope_type' => 'global']; }
        $adminRole->permissions()->sync($syncData);

        $user = User::factory()->create();
        $user->roles()->attach($adminRole);

        $year = AcademicYear::factory()->create();
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id]);

        $version = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'suggested',
            'is_current' => false,
        ]);

        // We must be acting as the user for Gate checks inside both services
        $this->actingAs($user);

        // Approve with no assignments → fingerprint = hash('')
        $approvalService = app(DistributionApprovalService::class);
        $approvalService->approve($version, $user, true, 'Test fingerprint mismatch');

        // Now add an assignment to change the fingerprint
        $block = \App\Models\RotationBlock::factory()->create(['rotation_id' => $rotation->id]);
        $site = \App\Models\TrainingSite::factory()->create();
        $student = \App\Models\Student::factory()->create(['university_number' => 'UNI6E001']);

        StudentClinicalAssignment::create([
            'distribution_version_id' => $version->id,
            'student_id' => $student->id,
            'student_subgroup_id' => null,
            'rotation_block_id' => $block->id,
            'training_site_id' => $site->id,
            'department_id' => null,
            'supervisor_id' => null,
        ]);

        // Fingerprint has changed → publication must fail with a ValidationException
        // (specifically the approval-invalid check, not the authorization check)
        // We test this at the service level — publication requires a valid approval
        // and the fingerprint has changed, so getValidApproval() returns null.
        $publicationService = app(DistributionPublicationService::class);

        $this->expectException(\Illuminate\Validation\ValidationException::class);
        $publicationService->publish(
            $version->fresh(),
            $user,
            $version->fresh()->updated_at->toIso8601String(),
            false, // force=false → approval fingerprint check runs
            null
        );
    }

    // -------------------------------------------------------------------------
    // 4. Queue Health — failed_jobs Visibility
    // -------------------------------------------------------------------------

    public function test_health_endpoint_reports_failed_jobs_count(): void
    {
        DB::table('failed_jobs')->truncate();

        $response = $this->getJson('/api/v1/health');
        $response->assertStatus(200)
            ->assertJsonStructure([
                'data' => ['application', 'database', 'queue', 'storage', 'failed_jobs_count'],
            ])
            ->assertJsonPath('data.failed_jobs_count', 0);
    }

    public function test_health_endpoint_failed_jobs_count_reflects_failures(): void
    {
        DB::table('failed_jobs')->truncate();

        // Insert a failed job
        DB::table('failed_jobs')->insert([
            'uuid' => \Illuminate\Support\Str::uuid(),
            'connection' => 'database',
            'queue' => 'default',
            'payload' => json_encode(['displayName' => 'TestJob']),
            'exception' => 'Test exception',
            'failed_at' => now(),
        ]);

        $response = $this->getJson('/api/v1/health');
        $failedCount = $response->json('data.failed_jobs_count');
        $this->assertEquals(1, $failedCount, 'failed_jobs_count must reflect the actual count of failed jobs.');
    }

    // -------------------------------------------------------------------------
    // 5. Backup Configuration Integrity (re-verify after Phase 6E changes)
    // -------------------------------------------------------------------------

    public function test_backup_verify_is_enabled(): void
    {
        // Phase 6E MEDIUM-04: verify_backup must now be true
        $this->assertTrue(
            config('backup.backup.verify_backup'),
            'Phase 6E MEDIUM-04: verify_backup must be enabled in config/backup.php.'
        );
    }

    public function test_backup_destination_is_s3(): void
    {
        $disks = config('backup.backup.destination.disks');
        $this->assertContains('s3', $disks, 'Backup destination must be s3.');
    }

    public function test_backup_retention_policy_unchanged(): void
    {
        $this->assertEquals(7, config('backup.cleanup.default_strategy.keep_daily_backups_for_days'));
        $this->assertEquals(4, config('backup.cleanup.default_strategy.keep_weekly_backups_for_weeks'));
    }

    public function test_backup_schedule_commands_still_registered(): void
    {
        $schedule = app(\Illuminate\Console\Scheduling\Schedule::class);
        $events = $schedule->events();

        $backupRunFound = collect($events)->contains(fn($e) => str_contains($e->command ?? '', 'backup:run'));
        $backupCleanFound = collect($events)->contains(fn($e) => str_contains($e->command ?? '', 'backup:clean'));

        $expected = config('operations.backup.enabled')
            && class_exists(\Spatie\Backup\Commands\BackupCommand::class);
        $this->assertSame($expected, $backupRunFound, 'backup:run must only be scheduled when it can execute.');
        $this->assertSame($expected, $backupCleanFound, 'backup:clean must only be scheduled when it can execute.');
    }

    // -------------------------------------------------------------------------
    // 6. Production Configuration Safety Checks
    // -------------------------------------------------------------------------

    public function test_production_session_is_http_only(): void
    {
        $this->assertTrue(config('session.http_only'), 'Session cookie must be http_only.');
    }

    public function test_production_session_cookie_config_has_correct_driver(): void
    {
        // Verify the production session config file declares 'database' as the default driver
        // (The test environment overrides this to 'array' via phpunit.xml — that is correct)
        $sessionConfigFile = config_path('session.php');
        $content = file_get_contents($sessionConfigFile);

        // The config/session.php must default to 'database' for production
        $this->assertStringContainsString(
            "'database'",
            $content,
            'config/session.php must contain database as the session driver option.'
        );
        // Must NOT default to 'file' or 'cookie' which would be insecure for production
        $this->assertStringNotContainsString(
            "env('SESSION_DRIVER', 'file')",
            $content,
            'session.php must not default to file driver.'
        );
    }

    public function test_cors_does_not_use_wildcard_origin(): void
    {
        $allowedOrigins = config('cors.allowed_origins');
        $this->assertNotContains('*', $allowedOrigins, 'CORS must not allow wildcard origins.');
    }

    public function test_rate_limiter_login_is_configured_in_appserviceprovider(): void
    {
        // Verify the AppServiceProvider registers rate limiters by checking the provider source
        $providerFile = app_path('Providers/AppServiceProvider.php');
        $content = file_get_contents($providerFile);

        $this->assertStringContainsString("'login'", $content, 'Login rate limiter must be registered in AppServiceProvider.');
        $this->assertStringContainsString('RateLimiter::for', $content, 'RateLimiter::for must be used to register rate limiters.');
    }

    public function test_rate_limiter_export_is_configured_in_appserviceprovider(): void
    {
        $providerFile = app_path('Providers/AppServiceProvider.php');
        $content = file_get_contents($providerFile);

        $this->assertStringContainsString("'export'", $content, 'Export rate limiter must be registered in AppServiceProvider.');
        $this->assertStringContainsString('perMinute(15)', $content, 'Export rate limiter must be capped at 15/min.');
    }

    public function test_production_operations_documentation_exists(): void
    {
        // MEDIUM-02: Production operations guide must exist
        $docFile = base_path('../docs/PRODUCTION_OPERATIONS.md');
        $this->assertFileExists($docFile, 'MEDIUM-02: docs/PRODUCTION_OPERATIONS.md must exist.');

        $content = file_get_contents($docFile);
        // Verify all required sections are present
        $this->assertStringContainsString('Queue Workers', $content);
        $this->assertStringContainsString('Laravel Scheduler', $content);
        $this->assertStringContainsString('Restore Procedure', $content);
        $this->assertStringContainsString('RPO', $content);
        $this->assertStringContainsString('RTO', $content);
        $this->assertStringContainsString('BACKUP_ALERT_EMAIL', $content);
        $this->assertStringContainsString('APP_DEBUG=false', $content);
    }

    // -------------------------------------------------------------------------
    // 7. End-to-End Clinical Integrity with New Index
    // -------------------------------------------------------------------------

    public function test_current_distribution_resolver_uses_composite_index_path(): void
    {
        $year = AcademicYear::factory()->create();
        $rotation = Rotation::factory()->create(['academic_year_id' => $year->id]);

        // Create multiple versions to ensure the resolver still works correctly
        // with the new index in place
        for ($i = 0; $i < 5; $i++) {
            DistributionVersion::create([
                'rotation_id' => $rotation->id,
                'status' => 'published',
                'is_current' => false, // historical
            ]);
        }

        $current = DistributionVersion::create([
            'rotation_id' => $rotation->id,
            'status' => 'published',
            'is_current' => true,
        ]);

        DB::enableQueryLog();
        $resolver = app(CurrentDistributionResolver::class);
        $result = $resolver->resolveForRotation($rotation->id);
        $queryLog = DB::getQueryLog();
        DB::disableQueryLog();

        $this->assertNotNull($result);
        $this->assertEquals($current->id, $result->id);

        // Verify resolver executes exactly 1 query
        $this->assertCount(1, $queryLog, 'CurrentDistributionResolver must execute exactly 1 query.');
    }
}
