<?php

namespace App\Traits;

use App\Models\Department;
use App\Models\DepartmentHeadAssignment;
use App\Models\Person;
use App\Models\Student;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;

trait ScopesByDepartmentAndLevel
{
    /**
     * Apply record-level student visibility for constrained roles.
     * Global/administrative roles keep their permission-level access.
     *
     * @param Builder<Student> $query
     */
    protected function applyStudentAccessScope(Builder $query): Builder
    {
        /** @var User|null $user */
        $user = auth()->user();
        if (!$user) {
            return $query->whereRaw('1 = 0');
        }

        if ($user->hasRole('ACADEMIC_ADVISOR')) {
            $advisorIds = $this->userPersonIds($user);
            return empty($advisorIds)
                ? $query->whereRaw('1 = 0')
                : $query->whereIn('academic_advisor_id', $advisorIds);
        }

        if ($user->hasRole('CLINICAL_SUPERVISOR')) {
            $supervisorIds = $this->userPersonIds($user);
            if (empty($supervisorIds)) {
                return $query->whereRaw('1 = 0');
            }

            return $query->whereIn('students.id', function ($subquery) use ($supervisorIds) {
                $subquery->select('student_clinical_assignments.student_id')
                    ->from('student_clinical_assignments')
                    ->join('distribution_versions', 'distribution_versions.id', '=', 'student_clinical_assignments.distribution_version_id')
                    ->whereIn('student_clinical_assignments.supervisor_id', $supervisorIds)
                    ->where('distribution_versions.status', 'published')
                    ->where('distribution_versions.is_current', true);
            });
        }

        if ($user->hasRole('DEPARTMENT_HEAD') || $user->hasRole('RTA')) {
            $levels = $this->getUserScopedLevels();
            return empty($levels)
                ? $query->whereRaw('1 = 0')
                : $query->whereIn('academic_level', $levels);
        }

        return $query;
    }

    protected function authorizeStudentAccess(Student $student): void
    {
        $allowed = $this->applyStudentAccessScope(Student::query())
            ->whereKey($student->getKey())
            ->exists();

        if (!$allowed) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }

    protected function applyDepartmentAccessScope(Builder $query, string $column = 'department_id'): Builder
    {
        $departmentId = $this->getUserDepartmentId();

        return $departmentId ? $query->where($column, $departmentId) : $query;
    }

    protected function authorizeDepartmentAccess(?int $departmentId): void
    {
        $scopedDepartmentId = $this->getUserDepartmentId();
        if ($scopedDepartmentId && $departmentId !== $scopedDepartmentId) {
            throw new AuthorizationException('This action is unauthorized.');
        }
    }

    /** @return array<int> */
    private function userPersonIds(User $user): array
    {
        $ids = [];
        if ($user->person_id) {
            $ids[] = (int) $user->person_id;
        }

        $personId = Person::where('user_id', $user->id)->value('id');
        if ($personId) {
            $ids[] = (int) $personId;
        }

        return array_values(array_unique($ids));
    }

    /**
     * Get user's scoped department ID (if user is DEPARTMENT_HEAD or RTA).
     * Returns null for global roles (SYS_ADMIN, DEAN, VICE_DEAN, CLINICAL_DIRECTOR).
     */
    protected function getUserDepartmentId(): ?int
    {
        /** @var User|null $user */
        $user = auth()->user();
        if (!$user) return null;

        // Global roles have unscoped access across all departments
        if (
            $user->hasRole('SYS_ADMIN') || 
            $user->hasRole('DEAN') || 
            $user->hasRole('VICE_DEAN') || 
            $user->hasRole('CLINICAL_DIRECTOR')
        ) {
            return null;
        }

        // 1. Check user_roles scope_id
        $scopedRoleId = DB::table('user_roles')
            ->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('user_roles.user_id', $user->id)
            ->whereIn('roles.code', ['DEPARTMENT_HEAD', 'RTA'])
            ->where('user_roles.scope_type', 'department')
            ->whereNotNull('user_roles.scope_id')
            ->value('user_roles.scope_id');

        if ($scopedRoleId) {
            return (int) $scopedRoleId;
        }

        // 2. Check DepartmentHeadAssignment via linked Person
        $person = Person::where('user_id', $user->id)->first();
        if ($person) {
            $assignmentDeptId = DepartmentHeadAssignment::where('person_id', $person->id)
                ->where('is_current', true)
                ->value('department_id');
            if ($assignmentDeptId) {
                return (int) $assignmentDeptId;
            }
            if ($person->department_id) {
                return (int) $person->department_id;
            }
        }

        return null;
    }

    /**
     * Get academic levels served by user's department or assigned directly to RTA
     * Returns array of both English and Arabic level keys for exact querying.
     */
    protected function getUserScopedLevels(): array
    {
        /** @var User|null $user */
        $user = auth()->user();
        if (!$user) return [];

        // Global roles have unscoped access
        if (
            $user->hasRole('SYS_ADMIN') || 
            $user->hasRole('DEAN') || 
            $user->hasRole('VICE_DEAN') || 
            $user->hasRole('CLINICAL_DIRECTOR')
        ) {
            return [];
        }

        // If RTA has specific assigned_levels (e.g. ['fourth', 'sixth'])
        if (!empty($user->assigned_levels) && is_array($user->assigned_levels)) {
            return $this->normalizeLevels($user->assigned_levels);
        }

        // Otherwise get from department serves_academic_levels
        $deptId = $this->getUserDepartmentId();
        if ($deptId) {
            $dept = Department::find($deptId);
            if ($dept && !empty($dept->serves_academic_levels) && is_array($dept->serves_academic_levels)) {
                return $this->normalizeLevels($dept->serves_academic_levels);
            }
        }

        return [];
    }

    /**
     * Helper to normalize level strings between Arabic and English
     */
    protected function normalizeLevels(array $levels): array
    {
        $map = [
            'الرابعة' => ['fourth', 'الرابعة', '4', 'year4'],
            'الخامسة' => ['fifth', 'الخامسة', '5', 'year5'],
            'السادسة' => ['sixth', 'السادسة', '6', 'year6'],
            'fourth'  => ['fourth', 'الرابعة', '4', 'year4'],
            'fifth'   => ['fifth', 'الخامسة', '5', 'year5'],
            'sixth'   => ['sixth', 'السادسة', '6', 'year6'],
        ];

        $expanded = [];
        foreach ($levels as $lvl) {
            $val = trim((string)$lvl);
            if (isset($map[$val])) {
                foreach ($map[$val] as $alias) {
                    $expanded[] = $alias;
                }
            } else {
                $expanded[] = $val;
            }
        }

        return array_values(array_unique($expanded));
    }
}
