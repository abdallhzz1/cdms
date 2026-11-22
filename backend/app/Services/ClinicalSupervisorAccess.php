<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

class ClinicalSupervisorAccess
{
    public function can(User $actor, string $permission): bool
    {
        return Gate::forUser($actor)->allows('permission', [$permission]);
    }

    public function users(?User $actor = null): Builder
    {
        $actor ??= auth()->user();
        $query = User::whereHas('roles', fn ($q) => $q->where('code', 'CLINICAL_SUPERVISOR'));
        if (!$actor) return $query->whereRaw('1 = 0');
        // The supervisor directory is shared across departments and cohorts.
        // Record and document actions remain guarded by their own permissions.
        return $query;
    }

    public function authorize(User $actor, int $target, string $action = 'view'): void
    {
        if ($actor->id === $target && $actor->hasRole('CLINICAL_SUPERVISOR')) return;
        $allowed = match ($action) {
            'edit' => $this->can($actor, 'people.manage') || $this->can($actor, 'clinical_supervisors.update'),
            'documents_view' => $this->can($actor, 'people.manage') || $this->can($actor, 'supervisor_documents.view') || $this->can($actor, 'supervisor_documents.upload') || $this->can($actor, 'supervisor_documents.delete'),
            'documents_upload' => $this->can($actor, 'people.manage') || $this->can($actor, 'supervisor_documents.upload'),
            'documents_delete' => $this->can($actor, 'people.manage') || $this->can($actor, 'supervisor_documents.delete'),
            default => collect(['people.view', 'people.manage', 'performance.view', 'clinical_supervisors.view', 'clinical_supervisors.update', 'supervisor_documents.view', 'supervisor_documents.upload', 'supervisor_documents.delete', 'supervisor_records.view', 'supervisor_records.create', 'supervisor_records.review', 'supervisor_records.delete'])
                ->contains(fn ($permission) => $this->can($actor, $permission)),
        };
        abort_unless($allowed && $this->users($actor)->whereKey($target)->exists(), 403);
    }

    public function capabilities(User $actor, int $target): array
    {
        $self = $actor->id === $target;
        $manage = $this->can($actor, 'people.manage');
        return [
            'edit' => $self || $manage || $this->can($actor, 'clinical_supervisors.update'),
            'edit_official' => $manage || $this->can($actor, 'clinical_supervisors.update'),
            'documents_view' => $self || $manage || $this->can($actor, 'supervisor_documents.view') || $this->can($actor, 'supervisor_documents.upload') || $this->can($actor, 'supervisor_documents.delete'),
            'documents_upload' => $self || $manage || $this->can($actor, 'supervisor_documents.upload'),
            'documents_delete' => $self || $manage || $this->can($actor, 'supervisor_documents.delete'),
        ];
    }
}
