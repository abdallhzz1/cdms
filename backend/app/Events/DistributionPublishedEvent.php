<?php

namespace App\Events;

use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class DistributionPublishedEvent implements ShouldDispatchAfterCommit
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public readonly string $eventId,
        public readonly int $distributionVersionId,
        public readonly int $rotationId,
        public readonly int $publishedByUserId,
        public readonly array $supersededVersionIds,
        public readonly int $approvalAuditId,
        public readonly bool $isOverride,
        public readonly ?string $overrideReason,
        public readonly string $timestamp
    ) {}
}
