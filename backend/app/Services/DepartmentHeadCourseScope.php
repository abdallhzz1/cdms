<?php

namespace App\Services;

use App\Models\Course;
use App\Models\DepartmentHeadAssignment;
use App\Models\Person;
use App\Models\Rotation;
use App\Models\Student;
use App\Models\StudentClinicalAssignment;
use App\Models\User;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\Relation;
use Illuminate\Support\Facades\DB;

/** Request-time boundaries; never cached across users or requests. */
class DepartmentHeadCourseScope
{
    /** null = unrestricted by this policy; [] = department head with no assignment. */
    public function departmentIds(?User $user = null): ?array
    {
        $user ??= auth()->user();
        if (! $user) return [];
        // Eager-load once on the request's user model, not in a cross-request
        // cache. Reusing that snapshot avoids extra role queries per relation.
        $user->loadMissing('roles');
        $roles = $user->roles->pluck('code');
        if ($roles->intersect(['SYS_ADMIN', 'DEAN', 'VICE_DEAN', 'CLINICAL_DIRECTOR'])->isNotEmpty()
            || ! $roles->contains('DEPARTMENT_HEAD')) return null;

        $ids = DB::table('user_roles')->join('roles', 'roles.id', '=', 'user_roles.role_id')
            ->where('user_roles.user_id', $user->id)->where('roles.code', 'DEPARTMENT_HEAD')
            ->where('user_roles.scope_type', 'department')->whereNotNull('user_roles.scope_id')
            ->pluck('user_roles.scope_id')->map(fn ($id) => (int) $id)->filter()->unique()->values()->all();
        if ($ids) return $ids;

        $people = Person::query()->where(function ($query) use ($user) {
            $query->where('user_id', $user->id);
            if ($user->person_id) $query->orWhereKey($user->person_id);
        })->get(['id', 'department_id']);
        $ids = DepartmentHeadAssignment::query()->whereIn('person_id', $people->pluck('id'))
            ->where('role_type', 'head')->where('is_current', true)
            ->pluck('department_id')->map(fn ($id) => (int) $id)->unique()->values()->all();
        return $ids ?: $people->pluck('department_id')->filter()->map(fn ($id) => (int) $id)->unique()->values()->all();
    }

    public function courseIds(?User $user = null): ?array
    {
        $departments = $this->departmentIds($user);
        return $departments === null ? null : DB::table('course_department')
            ->whereIn('department_id', $departments)->distinct()->pluck('course_id')
            ->map(fn ($id) => (int) $id)->all();
    }

    public function courses(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->courseIds();
        return $ids === null ? $query : $query->whereIn($query->getModel()->qualifyColumn('id'), $ids);
    }

    public function rotations(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->courseIds();
        return $ids === null ? $query : $query->whereIn($query->getModel()->qualifyColumn('course_id'), $ids);
    }

    public function throughRotation(Builder|Relation $query, string $relation): Builder|Relation
    {
        $ids = $this->courseIds();
        return $ids === null ? $query : $query->whereHas($relation, fn ($rotation) => $rotation->whereIn('rotations.course_id', $ids));
    }

    public function assignments(Builder|Relation $query): Builder|Relation
    {
        return $this->throughRotation($query, 'rotationBlock.rotation');
    }

    public function publishedAssignments(?int $courseId = null, ?int $academicYearId = null): Builder|Relation
    {
        return $this->assignments(StudentClinicalAssignment::query())
            ->whereHas('distributionVersion', fn ($version) => $version->where('status', 'published')->where('is_current', true))
            ->when($courseId !== null, fn ($query) => $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->where('course_id', $courseId)))
            ->when($academicYearId !== null, fn ($query) => $query->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->where('academic_year_id', $academicYearId)));
    }

    public function students(Builder|Relation $query, ?int $courseId = null, ?int $academicYearId = null): Builder|Relation
    {
        if ($this->departmentIds() === null) return $query;
        // Cohort letters are not permissions. Membership comes from current
        // published assignments for owned courses, not every enrollee in a year.
        return $query->whereIn('students.id', $this->publishedAssignments($courseId, $academicYearId)
            ->whereHas('rotationBlock.rotation', fn ($rotation) => $rotation->whereColumn('rotations.academic_level', 'students.academic_level'))
            ->select('student_clinical_assignments.student_id'));
    }

    public function enrollments(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->courseIds();
        return $ids === null ? $query : $query->whereIn('student_course_enrollments.course_id', $ids);
    }

    public function grades(Builder|Relation $query): Builder|Relation
    {
        return $this->departmentIds() === null ? $query
            : $query->whereHas('enrollment', fn ($enrollment) => $this->enrollments($enrollment));
    }

    public function rosters(Builder|Relation $query): Builder|Relation
    {
        return $this->departmentIds() === null ? $query
            : $query->whereIn($query->getModel()->qualifyColumn('student_id'), $this->students(Student::query())->select('students.id'));
    }

    public function visibleStudentIds(array $ids): array
    {
        if ($this->departmentIds() === null) return $ids;
        return $this->students(Student::query())->whereIn('students.id', $ids)->pluck('students.id')->all();
    }

    public function courseRecords(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->courseIds();
        return $ids === null ? $query : $query->whereIn($query->getModel()->qualifyColumn('course_id'), $ids);
    }

    public function departments(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->departmentIds();
        return $ids === null ? $query : $query->whereIn($query->getModel()->qualifyColumn('department_id'), $ids);
    }

    public function subgroups(Builder|Relation $query): Builder|Relation
    {
        if ($this->departmentIds() === null) return $query;
        return $query->whereIn('student_subgroups.id', $this->publishedAssignments()->select('student_subgroup_id'));
    }

    public function groups(Builder|Relation $query): Builder|Relation
    {
        if ($this->departmentIds() === null) return $query;
        return $query->whereHas('subgroups', fn ($subgroup) => $this->subgroups($subgroup));
    }

    public function assessments(Builder|Relation $query): Builder|Relation
    {
        $ids = $this->courseIds();
        if ($ids === null) return $query;
        return $query->where(function ($records) use ($ids) {
            $records->whereHas('clinicalAssignment.rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('course_id', $ids))
                ->orWhere(fn ($legacy) => $legacy->whereNull('student_clinical_assignment_id')
                    ->whereHas('session.rotationBlock.rotation', fn ($rotation) => $rotation->whereIn('course_id', $ids)));
        });
    }

    public function approvals(Builder|Relation $query, ?User $user = null): Builder|Relation
    {
        $ids = $this->courseIds($user);
        if ($ids === null) return $query;
        return $query->where(function ($requests) use ($ids) {
            $requests->where(fn ($sheets) => $sheets->where('subject_type', 'grade_sheet')->whereIn('context->course_id', $ids))
                ->orWhere(fn ($reports) => $reports->where('subject_type', 'course_report')->whereIn('subject_id', DB::table('course_reports')->whereIn('course_id', $ids)->select('id')))
                ->orWhere(fn ($grades) => $grades->where('subject_type', 'grade_entry')->whereIn('subject_id', DB::table('grade_entries')->join('student_course_enrollments', 'student_course_enrollments.id', '=', 'grade_entries.student_course_enrollment_id')->whereIn('student_course_enrollments.course_id', $ids)->select('grade_entries.id')));
        });
    }

    public function authorizeCourse(Course $course): void
    {
        $ids = $this->courseIds();
        if ($ids !== null && ! in_array((int) $course->id, $ids, true)) throw new AuthorizationException();
    }

    public function authorizeStudentForCourse(int $studentId, int $courseId, int $academicYearId): void
    {
        if ($this->departmentIds() !== null && ! $this->students(Student::query(), $courseId, $academicYearId)->whereKey($studentId)->exists()) {
            throw new AuthorizationException();
        }
    }

    public function authorizeRotation(Rotation $rotation): void
    {
        $ids = $this->courseIds();
        if ($ids !== null && ! in_array((int) $rotation->course_id, $ids, true)) throw new AuthorizationException();
    }

    public function authorizeRecord(Builder|Relation $query, int $id): void
    {
        if ($this->departmentIds() !== null && ! $query->whereKey($id)->exists()) throw new AuthorizationException();
    }
}
