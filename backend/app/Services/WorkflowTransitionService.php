<?php

namespace App\Services;

use App\Models\WorkflowTransitionLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;

class WorkflowTransitionService
{
    public function transition(Model $record, string $to, ?string $reason = null): Model
    {
        $from = $record->status;
        
        $allowed = [
            'draft' => ['submitted'],
            'submitted' => ['under_review', 'returned', 'approved', 'rejected', 'closed'],
            'under_review' => ['returned', 'approved', 'rejected'],
            'returned' => ['submitted', 'draft'],
            'approved' => ['published'],
            'published' => ['locked'],
            'locked' => ['archived']
        ];

        if (!in_array($to, $allowed[$from] ?? [], true)) {
            throw ValidationException::withMessages([
                'status' => ['Invalid workflow transition.']
            ]);
        }

        $record->update(['status' => $to]);

        WorkflowTransitionLog::create([
            'entity_type' => $record::class,
            'entity_id' => $record->getKey(),
            'from_state' => $from,
            'to_state' => $to,
            'user_id' => auth()->id(),
            'reason' => $reason
        ]);

        return $record->fresh();
    }
}
