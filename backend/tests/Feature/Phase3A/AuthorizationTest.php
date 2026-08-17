<?php

namespace Tests\Feature\Phase3A;

use App\Models\AcademicYear;
use App\Models\User;
use Database\Seeders\PermissionSeeder;
use Database\Seeders\Phase3PermissionSeeder;
use Database\Seeders\RolePermissionSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    protected User $unauthorizedUser;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed([RoleSeeder::class, PermissionSeeder::class, Phase3PermissionSeeder::class, RolePermissionSeeder::class]);
        $this->unauthorizedUser = User::factory()->create(); // No roles, no permissions
    }

    /**
     * Data provider for endpoints that require specific permissions.
     */
    public static function protectedEndpoints(): array
    {
        return [
            ['GET', '/api/v1/academic-years'],
            ['POST', '/api/v1/academic-years'],
            ['GET', '/api/v1/departments'],
            ['POST', '/api/v1/departments'],
            ['GET', '/api/v1/people'],
            ['POST', '/api/v1/people'],
            ['GET', '/api/v1/students'],
            ['POST', '/api/v1/students'],
            ['GET', '/api/v1/student-groups'],
            ['POST', '/api/v1/student-groups'],
            ['GET', '/api/v1/training-sites'],
            ['POST', '/api/v1/training-sites'],
            ['GET', '/api/v1/partnerships'],
            ['POST', '/api/v1/partnerships'],
        ];
    }

    /**
     * @dataProvider protectedEndpoints
     */
    public function test_endpoints_reject_unauthorized_users(string $method, string $uri)
    {
        $response = $this->actingAs($this->unauthorizedUser)->json($method, $uri, []);
        $response->assertStatus(403);
    }

    /**
     * @dataProvider protectedEndpoints
     */
    public function test_endpoints_reject_unauthenticated_guests(string $method, string $uri)
    {
        $response = $this->json($method, $uri, []);
        $response->assertStatus(401);
    }
}
