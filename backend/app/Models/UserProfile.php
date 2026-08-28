<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Shared, user-owned profile data.
 *
 * This intentionally sits apart from the login record and from role-specific
 * profiles. It gives every account one canonical photo and contact summary,
 * while DepartmentHeadProfile and ClinicalSupervisorProfile retain only their
 * role-specific CV and performance data.
 */
class UserProfile extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'full_name_en',
        'phone',
        'specialty',
        'academic_degree',
        'bio',
        'avatar_url',
        'avatar_storage_path',
    ];

    /** @return BelongsTo<User, $this> */
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
