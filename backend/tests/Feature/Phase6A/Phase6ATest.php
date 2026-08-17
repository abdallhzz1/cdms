<?php

namespace Tests\Feature\Phase6A;

use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Config;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class Phase6ATest extends TestCase
{
    use RefreshDatabase;

    private User $viewer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed([
            \Database\Seeders\PermissionSeeder::class,
            \Database\Seeders\RoleSeeder::class,
            \Database\Seeders\RolePermissionSeeder::class
        ]);

        $viewerRole = Role::create([
            'code' => 'P6A_VIEWER',
            'name_key' => 'viewer',
            'name_ar' => 'Viewer',
            'name_en' => 'Viewer'
        ]);
        $viewerRole->permissions()->attach(Permission::where('code', 'distribution.view')->pluck('id'), ['scope_type' => 'global']);

        $this->viewer = User::factory()->create();
        $this->viewer->roles()->attach($viewerRole);
    }

    public function test_health_endpoint_returns_ok()
    {
        $response = $this->getJson('/api/v1/health');

        $response->assertStatus(200)
            ->assertJson([
                'success' => true,
                'data' => [
                    'application' => 'ok',
                    'database' => 'ok',
                ]
            ]);
    }

    public function test_production_debug_false_masks_exception_internals()
    {
        Config::set('app.debug', false);

        // Force a non-existent API route to trigger 404 exception envelope
        $response = $this->getJson('/api/v1/non-existent-endpoint');

        $response->assertStatus(404)
            ->assertJson([
                'success' => false,
                'message' => 'The requested resource was not found.',
            ]);

        $this->assertArrayNotHasKey('trace', $response->json());
    }

    public function test_rate_limiting_throttles_login_endpoint()
    {
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/v1/auth/login', [
                'email' => 'baduser@example.com',
                'password' => 'wrongpass'
            ]);
        }

        // 6th request must trigger rate limit 429 Too Many Requests
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'baduser@example.com',
            'password' => 'wrongpass'
        ]);

        $response->assertStatus(429);
    }

    public function test_rate_limiting_throttles_export_endpoint_after_limit()
    {
        $this->actingAs($this->viewer);

        for ($i = 0; $i < 15; $i++) {
            $this->getJson('/api/v1/operational/reports/unassigned');
        }

        // 16th request MUST be throttled by export rate limiter (15 req/min limit)
        $response = $this->getJson('/api/v1/operational/reports/unassigned');

        $response->assertStatus(429);
    }

    public function test_queue_jobs_table_exists()
    {
        $this->assertTrue(Schema::hasTable('jobs'));
        $this->assertTrue(Schema::hasTable('failed_jobs'));
        $this->assertTrue(Schema::hasTable('job_batches'));
    }

    public function test_cors_configuration_rejects_unlisted_origin()
    {
        $response = $this->withHeaders([
            'Origin' => 'http://unauthorized-domain.com'
        ])->getJson('/api/v1/health');

        // CORS header must never reflect the untrusted unauthorized origin
        $this->assertNotEquals('http://unauthorized-domain.com', $response->headers->get('Access-Control-Allow-Origin'));
    }
}
