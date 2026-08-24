<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Support\Facades\Gate;

class ProfileAuthorizationService
{
    public function authorizeView(?User $user, int $targetUserId): void
    {
        if ($user && ($user->id === $targetUserId
            || Gate::forUser($user)->allows('permission', ['people.view'])
            || Gate::forUser($user)->allows('permission', ['performance.view']))) {
            return;
        }

        throw new AuthorizationException('This action is unauthorized.');
    }

    public function authorizeEdit(?User $user, int $targetUserId): void
    {
        if ($user && ($user->id === $targetUserId
            || Gate::forUser($user)->allows('permission', ['people.manage']))) {
            return;
        }

        throw new AuthorizationException('This action is unauthorized.');
    }

    public function authorizeEvaluation(?User $user): void
    {
        if ($user && Gate::forUser($user)->allows('permission', ['performance.view'])) {
            return;
        }

        throw new AuthorizationException('This action is unauthorized.');
    }
}
