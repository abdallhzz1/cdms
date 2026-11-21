<?php

namespace App\Services\Distribution;

use App\Models\Rotation;
use App\Models\StudentGroupAssignment;
use Illuminate\Support\Collection;

class ClinicalPeriodGroupMembershipService
{
    /**
     * Return one authoritative membership per student for the rotation's
     * clinical period. Period bounds are half-open: from is inclusive and
     * until is exclusive. Legacy rows without bounds remain valid fallbacks.
     *
     * @param  array<int, int>|null  $subgroupIds
     * @return Collection<int, StudentGroupAssignment>
     */
    public function membershipsForRotation(Rotation $rotation, ?array $subgroupIds = null): Collection
    {
        $query = StudentGroupAssignment::query()
            ->where('academic_year_id', $rotation->academic_year_id)
            ->whereNotNull('student_subgroup_id')
            ->with(['effectiveFromPeriod:id,sequence', 'effectiveUntilPeriod:id,sequence'])
            ->whereHas('student', fn ($student) => $student->where('registration_status', 'active'));

        if ($subgroupIds !== null) {
            $query->whereIn('student_subgroup_id', $subgroupIds ?: [-1]);
        }

        if (! $rotation->clinical_period_id) {
            return $query->current()->get()->unique('student_id')->values();
        }

        $rotation->loadMissing('clinicalPeriod:id,sequence');
        $sequence = (int) $rotation->clinicalPeriod?->sequence;

        return $query->get()
            ->groupBy('student_id')
            ->map(fn (Collection $memberships) => $memberships
                ->filter(fn (StudentGroupAssignment $membership) => $this->appliesToSequence($membership, $sequence))
                ->sortByDesc(fn (StudentGroupAssignment $membership) => sprintf(
                    '%010d:%020d',
                    (int) ($membership->effectiveFromPeriod?->sequence ?? 0),
                    $membership->id,
                ))
                ->first())
            ->filter()
            ->values();
    }

    public function membershipForRotation(Collection $memberships, Rotation $rotation): ?StudentGroupAssignment
    {
        if (! $rotation->clinical_period_id) {
            return $memberships->first(fn (StudentGroupAssignment $membership) => $membership->valid_until === null);
        }

        $rotation->loadMissing('clinicalPeriod:id,sequence');
        $sequence = (int) $rotation->clinicalPeriod?->sequence;

        return $memberships
            ->filter(fn (StudentGroupAssignment $membership) => $this->appliesToSequence($membership, $sequence))
            ->sortByDesc(fn (StudentGroupAssignment $membership) => sprintf(
                '%010d:%020d',
                (int) ($membership->effectiveFromPeriod?->sequence ?? 0),
                $membership->id,
            ))
            ->first();
    }

    private function appliesToSequence(StudentGroupAssignment $membership, int $sequence): bool
    {
        $from = $membership->effectiveFromPeriod?->sequence;
        $until = $membership->effectiveUntilPeriod?->sequence;

        return ($from === null || (int) $from <= $sequence)
            && ($until === null || (int) $until > $sequence);
    }
}
