<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Validation\ValidationException;

class CorrespondenceRecipientService
{
    public function canSend(User $sender, User $recipient): bool
    {
        return $recipient->is_active && $sender->id !== $recipient->id;
    }

    public function validate(User $sender, int $recipientId): User
    {
        $recipient = User::with('roles')->findOrFail($recipientId);
        if (! $this->canSend($sender->loadMissing('roles'), $recipient)) {
            throw ValidationException::withMessages([
                'to' => [app()->getLocale() === 'ar' ? 'المستلم المحدد غير متاح للمراسلات.' : 'The selected recipient is not available for correspondence.'],
            ]);
        }

        return $recipient;
    }
}
