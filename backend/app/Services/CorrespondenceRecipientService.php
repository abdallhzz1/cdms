<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Validation\ValidationException;

class CorrespondenceRecipientService
{
    private const LEADERSHIP_ROLES = ['SYS_ADMIN', 'CLINICAL_DIRECTOR', 'DEAN', 'VICE_DEAN', 'DEPARTMENT_HEAD', 'ADMIN_ASSISTANT'];

    public function canSend(User $sender, User $recipient): bool
    {
        if ($sender->id === $recipient->id || ! $recipient->is_active) return false;
        return ! ($this->isSupervisorOnly($sender) && $this->isSupervisorOnly($recipient));
    }

    public function validate(User $sender, int $recipientId): User
    {
        $recipient = User::with('roles')->findOrFail($recipientId);
        if (! $this->canSend($sender->loadMissing('roles'), $recipient)) {
            throw ValidationException::withMessages([
                'assigned_to' => ['The selected recipient is not available for correspondence. Clinical supervisors cannot correspond directly with each other.'],
            ]);
        }
        return $recipient;
    }

    private function isSupervisorOnly(User $user): bool
    {
        $codes = $user->roles->pluck('code');
        return $codes->contains('CLINICAL_SUPERVISOR') && ! $codes->intersect(self::LEADERSHIP_ROLES)->isNotEmpty();
    }
}
