<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Covers Prompt 02 §30's required backend test cases 1-6, 10, 11 (the
 * remaining three — permission granted/denied, scope enforced — live in
 * AuthorizationMiddlewareTest.php since they need a role/permission grant,
 * not just a user).
 *
 * RefreshDatabase is safe to use here (unlike HealthEndpointTest — see its
 * ADR-018 note): nothing in this class swaps the database connection
 * mid-test, so there is no transaction-corruption risk.
 *
 * Tests that need an ALREADY-authenticated user to make a second request
 * use `$this->actingAs($user, 'web')` rather than a real
 * `postJson('/auth/login')` followed by a second call. This is deliberate,
 * not a shortcut taken for convenience: Laravel's test client does not
 * replay the session cookie a login response sets on later calls within
 * the same test (`MakesHttpRequests::call()` only sends cookies explicitly
 * passed to it), so a real login response's session is invisible to a
 * follow-up `getJson()`/`postJson()` unless that cookie is threaded through
 * by hand. `actingAs($user, 'web')` sets the SAME 'web' guard instance that
 * (a) AuthController's login/logout use directly and (b) Sanctum's request
 * guard delegates to for stateful requests (config/sanctum.php's
 * `'guard' => ['web']`, see vendor/laravel/sanctum/src/Guard.php) — so it
 * exercises the real `auth:sanctum` middleware + AuthController::logout()
 * code path faithfully, just without needing real HTTP-level cookie
 * plumbing in the test harness. The login endpoint itself (which this
 * shortcut does NOT exercise) is still tested for real in
 * test_user_can_login_with_valid_credentials() below, verified via
 * assertAuthenticated() — which checks the same in-process guard state
 * `postJson()` just populated, with no second request involved.
 */
class AuthenticationTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // AuthController touches $request->session() directly (regenerate
        // on login, invalidate on logout). That only exists on the request
        // when Sanctum's EnsureFrontendRequestsAreStateful decides the
        // request is "from the frontend" (Origin/Referer matches
        // config('sanctum.stateful') — phpunit.xml fixes that list to just
        // "localhost" for tests) and attaches the session/CSRF middleware
        // chain. Every request in this class needs that, so it's set once
        // here rather than repeated per test.
        $this->withHeader('Origin', 'http://localhost');
    }

    public function test_user_can_login_with_valid_credentials(): void
    {
        User::factory()->create([
            'email' => 'director@cdms.local',
            'password' => 'correct-password',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'director@cdms.local',
            'password' => 'correct-password',
        ]);

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => ['email' => 'director@cdms.local'],
            ]);

        $this->assertAuthenticated('web');
    }

    public function test_login_fails_with_invalid_password(): void
    {
        User::factory()->create([
            'email' => 'director@cdms.local',
            'password' => 'correct-password',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'director@cdms.local',
            'password' => 'wrong-password',
        ]);

        $response->assertStatus(422)
            ->assertJson(['success' => false]);

        $this->assertGuest('web');
    }

    public function test_inactive_user_cannot_login(): void
    {
        User::factory()->inactive()->create([
            'email' => 'suspended@cdms.local',
            'password' => 'correct-password',
        ]);

        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'suspended@cdms.local',
            'password' => 'correct-password',
        ]);

        // Same generic failure as a wrong password — no "this account is
        // disabled" disclosure (Prompt 02 §11).
        $response->assertStatus(422)
            ->assertJson(['success' => false]);

        $this->assertGuest('web');
    }

    public function test_authenticated_user_can_fetch_their_own_profile_via_me(): void
    {
        $user = User::factory()->create(['email' => 'director@cdms.local']);
        $this->actingAs($user, 'web');

        $response = $this->getJson('/api/v1/auth/me');

        $response->assertOk()
            ->assertJson([
                'success' => true,
                'data' => ['email' => 'director@cdms.local'],
            ])
            ->assertJsonStructure([
                'data' => ['id', 'name', 'email', 'roles', 'permissions'],
            ]);
    }

    public function test_protected_routes_reject_unauthenticated_requests(): void
    {
        $response = $this->getJson('/api/v1/auth/me');

        $response->assertStatus(401)
            ->assertJson(['success' => false]);
    }

    public function test_user_can_logout(): void
    {
        $user = User::factory()->create(['email' => 'director@cdms.local']);
        $this->actingAs($user, 'web');

        $this->getJson('/api/v1/auth/me')->assertOk();

        $this->postJson('/api/v1/auth/logout')->assertOk();

        // Sanctum's `auth:sanctum` guard is a RequestGuard, which memoizes
        // the user it resolved on its FIRST call and returns that same
        // instance for the rest of the guard object's life
        // (vendor/laravel/sanctum -> Illuminate\Auth\RequestGuard::user()).
        // In production that memoization is invisible: every HTTP request
        // gets a fresh container and therefore a fresh guard. Inside one
        // test, all three calls below share one container, so without this
        // line the third request would return the user cached back on the
        // first — reporting a logout failure that does not exist in the
        // running application. Forgetting the guards reproduces what a real
        // subsequent request does; AuthController::logout() itself is
        // verified directly by the assertions that follow.
        $this->app['auth']->forgetGuards();

        $this->getJson('/api/v1/auth/me')->assertStatus(401);

        // Belt-and-braces on the server-side state itself, independent of
        // any guard-caching subtlety above: the session guard really is
        // logged out, not merely reported as such by a 401.
        $this->assertGuest('web');
    }

    public function test_password_hash_is_never_returned_in_any_auth_response(): void
    {
        $user = User::factory()->create([
            'email' => 'director@cdms.local',
            'password' => 'correct-password',
        ]);

        $loginResponse = $this->postJson('/api/v1/auth/login', [
            'email' => 'director@cdms.local',
            'password' => 'correct-password',
        ]);

        // actingAs rather than a second real request for the same reason
        // documented on the class: this checks /me's own response shape,
        // independent of whether a real login's session round-trips
        // through the test client (it doesn't — see class doc comment).
        $this->actingAs($user, 'web');
        $meResponse = $this->getJson('/api/v1/auth/me');

        foreach ([$loginResponse, $meResponse] as $response) {
            $raw = $response->getContent();
            $this->assertStringNotContainsString('password', strtolower($raw));
            // Bcrypt/Argon2id hashes always contain one of these prefixes —
            // an extra guard in case a future refactor adds a differently
            // named field that still leaks the hash.
            $this->assertStringNotContainsString('$2y$', $raw);
            $this->assertStringNotContainsString('$argon2', $raw);
        }
    }

    public function test_auth_error_responses_use_the_standard_envelope(): void
    {
        $response = $this->postJson('/api/v1/auth/login', [
            'email' => 'not-a-real-user@cdms.local',
            'password' => 'whatever',
        ]);

        $response->assertJsonStructure([
            'success', 'data', 'message', 'errors', 'meta',
        ]);
    }
}
