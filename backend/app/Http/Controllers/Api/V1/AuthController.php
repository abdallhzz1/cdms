<?php

namespace App\Http\Controllers\Api\V1;

use App\Http\Controllers\Controller;
use App\Http\Requests\Auth\LoginRequest;
use App\Http\Responses\ApiResponse;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Validation\ValidationException;

/**
 * Sanctum SPA (cookie/session) authentication — Prompt 02 §5. The frontend
 * first GETs /sanctum/csrf-cookie (registered automatically by Sanctum's
 * service provider), then calls these three endpoints with credentials
 * included. There is no token in any response body: the session cookie
 * (config/session.php, httpOnly) is the only credential, exactly as
 * Laravel's own SPA authentication guide describes — never a custom
 * token stored in localStorage/sessionStorage (Prompt 02 §17).
 */
class AuthController extends Controller
{
    public function login(LoginRequest $request): JsonResponse
    {
        $credentials = $request->validated();

        // 'is_active' is included as a query condition, not checked
        // separately after the fact — an inactive user fails exactly the
        // same way as a wrong password (Prompt 02 §11: no account-existence
        // or account-status disclosure; see also backend test case
        // "inactive user is blocked from logging in").
        $attempted = Auth::attempt([
            'email' => $credentials['email'],
            'password' => $credentials['password'],
            'is_active' => true,
        ]);

        if (! $attempted) {
            // Routed through the same centralized ValidationException ->
            // 422 handling as every other form (bootstrap/app.php) — one
            // error-shape code path, not a bespoke one for login. Message
            // is deliberately generic: never "no such user" vs "wrong
            // password" vs "account disabled".
            throw ValidationException::withMessages([
                'email' => ['These credentials do not match our records.'],
            ]);
        }

        // Regenerate the session ID on privilege escalation (anonymous ->
        // authenticated) to prevent session fixation — standard Laravel
        // guidance for any custom login flow.
        if ($request->hasSession()) {
            $request->session()->regenerate();
        }

        /** @var User $user */
        $user = $request->user();

        return ApiResponse::success(data: $this->presentUser($user));
    }

    public function logout(Request $request): JsonResponse
    {
        Auth::guard('web')->logout();

        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }

        return ApiResponse::success(message: 'Logged out successfully.');
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return ApiResponse::success(data: $this->presentUser($user));
    }

    /**
     * Single place the authenticated-user payload is shaped, used by both
     * login and me() so the two never drift apart. Never includes the
     * password hash or any other sensitive column — User::$hidden already
     * guarantees this for a raw model, but this method builds the array
     * explicitly rather than relying solely on that guarantee.
     *
     * @return array{id: int, name: string, email: string, roles: array<int, string>, permissions: array<int, array{code: string, scope: string}>}
     */
    private function presentUser(User $user): array
    {
        $user->loadMissing('roles.permissions');

        $permissions = $user->roles
            ->flatMap(fn ($role) => $role->permissions)
            ->unique('id')
            ->map(fn ($permission) => [
                'code' => $permission->code,
                'scope' => $permission->pivot->scope_type,
            ])
            ->values()
            ->all();

        // Resolve scoped department IDs for DEPARTMENT_HEAD / RTA
        // Wrapped in try/catch so login never breaks if scope columns are missing on server
        try {
            $departmentIds = \DB::table('user_roles')
                ->join('roles', 'roles.id', '=', 'user_roles.role_id')
                ->where('user_roles.user_id', $user->id)
                ->whereIn('roles.code', ['DEPARTMENT_HEAD', 'RTA'])
                ->where('user_roles.scope_type', 'department')
                ->whereNotNull('user_roles.scope_id')
                ->pluck('user_roles.scope_id')
                ->unique()
                ->values()
                ->all();
        } catch (\Throwable $e) {
            $departmentIds = [];
        }

        return [
            'id'              => $user->id,
            'name'            => $user->name,
            'email'           => $user->email,
            'roles'           => $user->roles->pluck('code')->values()->all(),
            'permissions'     => $permissions,
            'assigned_levels' => $user->assigned_levels ?? null,
            'department_ids'  => $departmentIds,
        ];
    }
}
