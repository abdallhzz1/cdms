<?php

namespace App\Services;

use App\Models\WorkflowTransitionLog;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Validation\ValidationException;
use Illuminate\Support\Facades\DB;

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

        return DB::transaction(function () use ($record, $from, $to, $reason) {
            $locked = $record->newQuery()->lockForUpdate()->findOrFail($record->getKey());

            if ($locked->status !== $from) {
                throw ValidationException::withMessages([
                    'status' => ['The record changed while this request was being processed. Please reload and try again.'],
                ]);
            }

            $locked->update(['status' => $to]);

            WorkflowTransitionLog::create([
                'entity_type' => $locked::class,
                'entity_id' => $locked->getKey(),
                'from_state' => $from,
                'to_state' => $to,
                'user_id' => auth()->id(),
                'reason' => $reason,
            ]);

            return $locked->fresh();
        });
    }
}
