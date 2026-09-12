<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class OperationalWorkflowReadinessTest extends TestCase
{
    use RefreshDatabase;

    public function test_workflow_readiness_reports_missing_operational_data_without_changing_it(): void
    {
        $before = collect(['users', 'students', 'academic_years', 'distribution_versions'])
            ->mapWithKeys(fn (string $table) => [$table => \DB::table($table)->count()]);

        $this->artisan('cdms:workflow-readiness', ['--json' => true])
            ->expectsOutputToContain('academic_year.current')
            ->assertFailed();

        $after = $before->keys()->mapWithKeys(fn (string $table) => [$table => \DB::table($table)->count()]);
        $this->assertSame($before->all(), $after->all());
    }
}
