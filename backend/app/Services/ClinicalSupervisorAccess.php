<?php

namespace App\Services;

use App\Models\User;
use App\Traits\ScopesByDepartmentAndLevel;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\Gate;

class ClinicalSupervisorAccess
{
    use ScopesByDepartmentAndLevel;

    public function can(User $actor, string $permission): bool
    {
        return Gate::forUser($actor)->allows('permission', [$permission]);
    }

    public function users(?User $actor = null): Builder
    {
        $actor ??= auth()->user();
        $query = User::whereHas('roles', fn ($q) => $q->where('code', 'CLINICAL_SUPERVISOR'));
        if (!$actor) return $query->whereRaw('1 = 0');
        $actor->loadMissing('roles', 'person');
        $roles = $actor->roles->pluck('code');
        $global = $roles->intersect(['SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'CLINICAL_DIRECTOR'])->isNotEmpty();
        $departments = app(DepartmentHeadCourseScope::class)->departmentIds($actor);
        if ($departments !== null) {
            $query->whereHas('person', fn ($q) => $q->whereIn('department_id', $departments));
        } elseif (!$global && $roles->contains('RTA')) {
            $department = \Illuminate\Support\Facades\DB::table('user_roles')->join('roles', 'roles.id', '=', 'user_roles.role_id')
                ->where('user_roles.user_id', $actor->id)->where('roles.code', 'RTA')
                ->where('user_roles.scope_type', 'department')->whereNotNull('user_roles.scope_id')->value('user_roles.scope_id') ?: $actor->person?->department_id;
            if ($department) $query->whereHas('person', fn ($q) => $q->where('department_id', $department));
        }
        $levels = !$global && $roles->contains('DEPARTMENT_HEAD')
            ? \App\Models\Course::whereIn('id', app(DepartmentHeadCourseScope::class)->courseIds($actor) ?? [])->pluck('academic_level')->all()
            : (!$global && $roles->contains('RTA') ? $this->normalizeLevels($actor->assigned_levels ?: []) : null);
        if ($levels !== null) {
            $query->whereHas('person', fn ($q) => $q->whereIn('id', function ($assignments) use ($levels) {
                $assignments->select('supervisor_id')->from('student_clinical_assignments')
                    ->join('rotation_blocks', 'rotation_blocks.id', '=', 'student_clinical_assignments.rotation_block_id')
                    ->join('rotations', 'rotations.id', '=', 'rotation_blocks.rotation_id')->whereIn('rotations.academic_level', $levels);
            }));
        }
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
