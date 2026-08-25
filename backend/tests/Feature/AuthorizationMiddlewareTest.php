<?php

namespace Tests\Feature;

use App\Http\Responses\ApiResponse;
use App\Models\Permission;
use App\Models\Role;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/**
 * Covers Prompt 02 §30's backend cases 7-9: permission granted, permission
 * denied (403), scope enforced. No real business module/route exists yet
 * to test the `permission:<code>` middleware against, so this class
 * registers a throwaway route on the fly (inside setUp, torn down
 * implicitly with the rest of the test's app instance) purely to exercise
 * the middleware + Gate + AuthorizationService chain end to end — this is
 * a test fixture, not a real API endpoint, and nothing outside this file
 * knows it exists (routes/api.php is untouched).
 *
 * Authentication fixture: `$this->actingAs($user, 'web')`, NOT
 * `Sanctum::actingAs($user)`. Sanctum's helper is for its personal-access-
 * token mode — it builds a TransientToken and calls
 * `$user->withAccessToken()`, which only exists on the `HasApiTokens` trait.
 * `App\Models\User` deliberately does not use that trait (ADR-019 item 1:
 * this application is Sanctum SPA cookie/session mode and never issues a
 * token), so `Sanctum::actingAs()` cannot work here by construction and
 * would fail during fixture setup without ever reaching the middleware
 * under test. The 'web' guard is what Sanctum's request guard delegates to
 * for stateful requests (config/sanctum.php's `'guard' => ['web']`), so
 * this exercises the real chain — identical to the reasoning already
 * documented at length in AuthenticationTest's class docblock.
 */
class AuthorizationMiddlewareTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Same reason as AuthenticationTest::setUp() — marks these requests
        // as coming "from the frontend" so Sanctum treats them as stateful.
        $this->withHeader('Origin', 'http://localhost');

        Route::middleware(['api', 'auth:sanctum'])->group(function () {
            Route::get('/__test/needs-users-manage', function () {
                return ApiResponse::success(message: 'ok');
            })->middleware('permission:users.manage');

            Route::get('/__test/needs-any-operational-permission', function () {
                return ApiResponse::success(message: 'ok');
            })->middleware('permission.any:distribution.view,grades.view,advising.view');
        });
    }

    public function test_permission_middleware_allows_a_user_with_the_required_permission(): void
    {
        $role = Role::factory()->create();
        $permission = Permission::firstOrCreate(['code' => 'users.manage'], ['module' => 'Security', 'action' => 'MANAGE', 'description_key' => 'permissions.users_manage.description']);
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->actingAs($user, 'web');

        $this->getJson('/__test/needs-users-manage')->assertOk();
    }

    public function test_permission_middleware_denies_a_user_without_the_required_permission(): void
    {
        $user = User::factory()->create(); // no roles at all

        $this->actingAs($user, 'web');

        $response = $this->getJson('/__test/needs-users-manage');

        $response->assertStatus(403)
            ->assertJson(['success' => false]);
    }

    public function test_permission_middleware_denies_a_non_global_scope_grant_pending_a_real_scope_resolver(): void
    {
        // The permission IS granted to the user's role, but with a
        // non-'global' scope_type. AuthorizationService::resolveScope()
        // conservatively denies every scope_type it doesn't yet have a real
        // resolver for (Phase 2 has no business module to resolve against)
        // — this proves that mechanism, not a specific business scope rule.
        $role = Role::factory()->create();
        $permission = Permission::firstOrCreate(['code' => 'users.manage'], ['module' => 'Security', 'action' => 'MANAGE', 'description_key' => 'permissions.users_manage.description']);
        $role->permissions()->attach($permission->id, ['scope_type' => 'department']);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->actingAs($user, 'web');

        $this->getJson('/__test/needs-users-manage')->assertStatus(403);
    }

    public function test_any_permission_middleware_allows_one_matching_permission(): void
    {
        $role = Role::factory()->create();
        $permission = Permission::firstOrCreate(['code' => 'grades.view'], ['module' => 'Grades', 'action' => 'VIEW', 'description_key' => 'permissions.grades_view.description']);
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->actingAs($user, 'web')
            ->getJson('/__test/needs-any-operational-permission')
            ->assertOk();
    }

    public function test_any_permission_middleware_denies_when_none_match(): void
    {
        $role = Role::factory()->create();
        $permission = Permission::firstOrCreate(['code' => 'tasks.view'], ['module' => 'Tasks', 'action' => 'VIEW', 'description_key' => 'permissions.tasks_view.description']);
        $role->permissions()->attach($permission->id, ['scope_type' => 'global']);

        $user = User::factory()->create();
        $user->roles()->attach($role->id);

        $this->actingAs($user, 'web')
            ->getJson('/__test/needs-any-operational-permission')
            ->assertStatus(403)
            ->assertJson(['success' => false]);
    }
}
