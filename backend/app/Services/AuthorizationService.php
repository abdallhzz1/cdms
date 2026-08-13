<?php

namespace App\Services;

use App\Models\Permission;
use App\Models\User;

/**
 * Single, reusable "does this user have this permission (within this
 * scope)?" check — Prompt 02 §8: "a reusable can(user, permission,
 * resource) pattern," used by the `permission` Gate (AppServiceProvider),
 * the `permission:<code>` route middleware (EnsurePermission), and
 * anywhere else authorization needs to be checked. Controllers and
 * middleware call this service (or the Gate that wraps it) — they never
 * inline `$user->roles->contains(...)` or similar ad hoc checks
 * (PROJECT_RULES.md: authorization is never scattered `if` statements).
 */
class AuthorizationService
{
    /**
     * @param  mixed  $scopeContext  Opaque, module-defined context (e.g. a
     *                                student ID) that a future business
     *                                module's scope resolver will use.
     *                                Unused by any scope_type recognized in
     *                                this phase — see resolveScope().
     */
    public function can(User $user, string $permissionCode, mixed $scopeContext = null): bool
    {
        if (! $user->is_active) {
            return false;
        }

        /** @var Permission|null $grant */
        $grant = $user->roles()
            ->whereHas('permissions', fn ($query) => $query->where('code', $permissionCode))
            ->with(['permissions' => fn ($query) => $query->where('code', $permissionCode)])
            ->get()
            ->flatMap(fn ($role) => $role->permissions)
            ->first();

        if (! $grant) {
            return false;
        }

        return match ($grant->pivot->scope_type) {
            'global' => true,
            default => $this->resolveScope($user, $grant, $scopeContext),
        };
    }

    /**
     * Phase 2 is the auth/authz *foundation* only — no business module
     * (Students, Distribution, ...) exists yet to define what "own
     * department" or "assigned students" actually means in a database
     * query. Until a module registers a real resolver for its scope
     * type(s), any non-'global' grant is conservatively DENIED rather than
     * guessed at. This still proves the end-to-end mechanism: a role
     * granted a permission with a non-global scope_type is correctly
     * refused here, exercised by
     * tests/Feature/AuthorizationMiddlewareTest.php's synthetic
     * "scope enforced" case (Prompt 02 §30, backend case #9). Each future
     * business-module phase adds its own case to this match arm — it does
     * not change the method's contract.
     */
    protected function resolveScope(User $user, Permission $permission, mixed $scopeContext): bool
    {
        return false;
    }
}
