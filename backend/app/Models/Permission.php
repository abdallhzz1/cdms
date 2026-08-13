<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * `code` follows "module.action" (e.g. "students.view") and is what the
 * rest of the codebase checks against — App\Services\AuthorizationService,
 * the `permission:<code>` route middleware, and the frontend's `can()`
 * helper (fed by the code list the API returns, never re-derived on the
 * client). `module`/`action` are plain descriptive columns for a future
 * admin UI; `description_key` is a translation key, not literal text.
 */
class Permission extends Model
{
    /** @use HasFactory<\Database\Factories\PermissionFactory> */
    use HasFactory;

    protected $fillable = [
        'code',
        'module',
        'action',
        'description_key',
    ];

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'role_permissions')
            ->withPivot('scope_type')
            ->withTimestamps();
    }
}
