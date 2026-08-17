<?php

namespace App\Observers;

use App\Models\AuditLog;
use Illuminate\Database\Eloquent\Model;

class BusinessRecordAuditObserver
{
    private const EXCLUDED = ['created_at', 'updated_at', 'password', 'remember_token'];

    public function created(Model $model): void { $this->write($model, 'created', $model->getAttributes()); }
    public function updated(Model $model): void { $this->write($model, 'updated', ['before' => $model->getOriginal(), 'after' => $model->getChanges()]); }

    private function write(Model $model, string $event, array $changes): void
    {
        $filtered = collect($changes)->except(self::EXCLUDED)->all();
        if ($filtered === []) return;
        AuditLog::create(['user_id' => auth()->id(), 'action' => class_basename($model).'.'.$event, 'entity_type' => $model::class, 'entity_id' => $model->getKey(), 'changes' => $filtered]);
    }
}
