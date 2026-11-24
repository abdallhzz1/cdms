<?php

namespace App\Services\ClinicalAttendance;

use App\Models\ClinicalUniversityLecture;
use App\Models\Person;
use App\Models\User;

class UniversityLectureAccess
{
    public const INSTRUCTOR_ROLES = ['CLINICAL_SUPERVISOR', 'RTA'];

    private array $people = [];

    public function canViewAny(User $actor): bool
    {
        return $actor->can('permission', ['university_lectures.manage']) || $actor->can('permission', ['university_lectures.attendance.view']) || $this->canOperateAny($actor) || $this->canCorrectApproved($actor);
    }

    public function canOperateAny(User $actor): bool
    {
        return $actor->can('permission', ['university_lectures.attendance.manage']);
    }

    public function canCorrectApproved(User $actor): bool
    {
        return $actor->hasRole('ADMIN_ASSISTANT') && $actor->can('permission', ['university_lectures.attendance.correct_approved']);
    }

    public function person(User $actor): ?Person
    {
        if (! array_key_exists($actor->id, $this->people)) {
            $this->people[$actor->id] = Person::where('user_id', $actor->id)->first()
                ?? Person::whereNull('user_id')->whereRaw('LOWER(email) = ?', [strtolower($actor->email)])->first();
        }

        return $this->people[$actor->id];
    }

    public function eligible(User $actor): bool
    {
        $actor->loadMissing('roles');

        return $actor->is_active && $actor->roles->pluck('code')->intersect(self::INSTRUCTOR_ROLES)->isNotEmpty();
    }

    public function canOperate(User $actor, ClinicalUniversityLecture $lecture): bool
    {
        return $this->canOperateAny($actor) || ($this->eligible($actor) && $actor->can('permission', ['attendance.record']) && (int) $this->person($actor)?->id === (int) $lecture->supervisor_person_id);
    }

    public function authorizeOperate(User $actor, ClinicalUniversityLecture $lecture): void
    {
        abort_unless($this->canOperate($actor, $lecture), 403);
    }

    public function authorizeView(User $actor, ClinicalUniversityLecture $lecture): void
    {
        abort_unless($this->canViewAny($actor) || $this->canOperate($actor, $lecture), 403);
    }
}
