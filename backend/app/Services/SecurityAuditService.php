<?php

namespace App\Services;

use App\Models\AuditLog;

class SecurityAuditService
{
    public function record(string $action, string $entityType, int $entityId, array $changes = []): AuditLog
    {
        return AuditLog::create([
            'user_id' => auth()->id(),
            'action' => $action,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'changes' => $changes,
        ]);
    }
}
