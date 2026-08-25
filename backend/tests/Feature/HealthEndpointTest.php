<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HealthEndpointTest extends TestCase
{
    // Deliberately NOT using RefreshDatabase: there are no migrations in
    // this phase to refresh, and — importantly — RefreshDatabase wraps
    // every test in a transaction on the *default* connection. The second
    // test below intentionally repoints the default connection mid-test to
    // simulate an outage; combined with RefreshDatabase's transaction
    // bookkeeping that produced exactly the cross-test failure a real run
    // surfaced ("cannot start a transaction within a transaction" on the
    // *next* test) — see docs/DECISIONS.md ADR-018.

    protected function tearDown(): void
    {
        // Defense in depth: guarantee no test leaves the default connection
        // pointed at the simulated-outage config for whichever test runs
        // next, even if an assertion above throws first. phpunit.xml always
        // sets DB_CONNECTION=sqlite for the test environment.
        config(['database.default' => 'sqlite']);
        DB::purge('mysql');

        parent::tearDown();
    }

    public function test_health_endpoint_reports_ok_when_database_is_reachable(): void
    {
        // The test environment's DB connection is SQLite in-memory
        // (phpunit.xml), which is reachable by definition here — this proves
        // the endpoint correctly reports "ok" for a live connection using
        // whatever connection is configured, not a hardcoded assumption.
        $response = $this->getJson('/api/v1/health');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'message' => null,
                'data' => [
                    'application' => 'ok',
                    'database' => 'ok',
                ],
            ])
            ->assertJsonStructure([
                'success', 'data' => ['application', 'database'], 'message', 'meta' => ['checked_at'],
            ]);
    }

    public function test_health_endpoint_reports_failure_without_leaking_internal_details(): void
    {
        // Point the default connection at a port nothing is listening on, so
        // the PDO connection fails (connection refused / timeout) rather
        // than hanging on a DNS lookup — a realistic "database unreachable"
        // case. Restored unconditionally in tearDown() above.
        config([
            'database.default' => 'mysql',
            'database.connections.mysql.host' => '127.0.0.1',
            'database.connections.mysql.port' => 1,
        ]);
        DB::purge('mysql');

        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(503)
            ->assertJson([
                'success' => true,
                'data' => [
                    'application' => 'ok',
                    'database' => 'unreachable',
                ],
            ]);

        $body = $response->json();

        // No connection string, host, credentials, or driver exception text
        // may appear anywhere in the response body.
        $raw = json_encode($body);
        $this->assertStringNotContainsString('127.0.0.1', $raw);
        $this->assertStringNotContainsString('PDO', $raw);
        $this->assertStringNotContainsString('SQLSTATE', $raw);
    }

    public function test_health_response_matches_the_standard_api_envelope(): void
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertJsonStructure([
            'success',
            'data',
            'message',
            'meta',
        ]);
    }
}
