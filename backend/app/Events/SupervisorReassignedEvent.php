<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SupervisorReassignedEvent implements ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $eventId,
        public readonly int $assignmentId,
        public readonly int $distributionVersionId,
        public readonly int $rotationId,
        public readonly int $studentId,
        public readonly ?int $previousSupervisorId,
        public readonly ?int $newSupervisorId,
        public readonly int $performedByUserId,
        public readonly string $timestamp
    ) {}
}
