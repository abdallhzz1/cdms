<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Deliberately minimal — Prompt 02 §6: id, name, email, password,
 * active-status, timestamps only. No job title, department, phone, or any
 * other business/profile field lives here; that belongs to a future
 * Staff/Profile table keyed by user_id (PROJECT_RULES.md: enter once,
 * reuse everywhere — this table's only job is "who can log in").
 *
 * No `HasApiTokens` trait: this application authenticates the SPA via
 * Sanctum's cookie/session mode only (config/sanctum.php,
 * bootstrap/app.php's statefulApi()). There is no endpoint that issues
 * personal access tokens, so the trait and its backing table are left out
 * rather than added unused — see docs/DECISIONS.md ADR-019. Add both back
 * without breaking anything if a future phase needs a token-based API
 * client (e.g. a mobile app).
 */
class User extends Authenticatable
{
    /** @use HasFactory<\Database\Factories\UserFactory> */
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'is_active',
        'assigned_levels',
    ];

    protected $hidden = [
        'password',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'password' => 'hashed',
            'assigned_levels' => 'array',
        ];
    }

    /**
     * @return BelongsToMany<Role, $this>
     */
    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')->withTimestamps();
    }

    public function hasRole(string $code): bool
    {
        return $this->roles()->where('code', $code)->exists();
    }

    public function person()
    {
        return $this->hasOne(Person::class);
    }

    public function departmentHeadProfile()
    {
        return $this->hasOne(DepartmentHeadProfile::class);
    }

    public function clinicalSupervisorProfile()
    {
        return $this->hasOne(ClinicalSupervisorProfile::class);
    }

    public function userProfile()
    {
        return $this->hasOne(UserProfile::class);
    }
}
