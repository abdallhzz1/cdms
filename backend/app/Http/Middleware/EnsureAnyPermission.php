<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Symfony\Component\HttpFoundation\Response;

/**
 * Allows a route when the authenticated user has at least one listed
 * permission: `permission.any:people.view,students.view`.
 */
class EnsureAnyPermission
{
    public function handle(Request $request, Closure $next, string ...$permissionCodes): Response
    {
        $user = $request->user();

        foreach ($permissionCodes as $permissionCode) {
            if (Gate::forUser($user)->allows('permission', [$permissionCode])) {
                return $next($request);
            }
        }

        throw new AuthorizationException('This action is unauthorized.');
    }
}
