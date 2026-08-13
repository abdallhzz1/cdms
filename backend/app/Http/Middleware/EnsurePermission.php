<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Route-level permission enforcement: `->middleware('permission:users.manage')`.
 * Delegates to the `permission` Gate (AppServiceProvider::boot(), backed by
 * App\Services\AuthorizationService) so there is exactly one place the
 * actual grant logic lives. Throwing AuthorizationException (rather than
 * returning a response directly) lets it flow through the same centralized
 * exception handler as everything else (bootstrap/app.php), which maps it
 * to a 403 in the standard envelope — no bespoke error shape here.
 *
 * Requires `auth:sanctum` earlier in the same middleware chain: an
 * unauthenticated request should fail with 401 (AuthenticationException)
 * before authorization is even evaluated, never a 403 that could leak
 * "this exists but you're not allowed" to an anonymous caller.
 */
class EnsurePermission
{
    public function handle(Request $request, Closure $next, string $permissionCode): Response
    {
        if (! Gate::forUser($request->user())->allows('permission', [$permissionCode])) {
            throw new AuthorizationException('This action is unauthorized.');
        }

        return $next($request);
    }
}
