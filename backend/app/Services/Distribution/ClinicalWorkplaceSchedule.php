<?php

namespace App\Services\Distribution;

use App\Models\{CourseScheduleRow, DistributionVersion, Person, RotationBlock, StudentClinicalAssignment, TrainingSite};
use App\Services\SupervisorWorkScheduleService;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;
use Illuminate\Validation\ValidationException;

/** Site/day placements are separate from the single student/week assessment identity. */
class ClinicalWorkplaceSchedule
{
    public function __construct(private readonly ClinicalScheduleDateCalculator $dates, private readonly SupervisorWorkScheduleService $schedules) {}

    public function snapshot(Person $person, DistributionVersion $version): array
    {
        $version->loadMissing('rotation', 'breaks');
        $start = $version->rotation->start_date->toDateString();
        $end = $this->dates->calculateBlockEndDate($start, max(1, (int) $version->rotation->duration_weeks), $version->breaks);
        $activeSites = TrainingSite::active()->get()->keyBy('id');
        $locations = collect($this->schedules->schedules($person))->filter(fn ($item) => $activeSites->has($item['training_site_id'])
            && (! $item['valid_from'] || $item['valid_from'] <= $end) && (! $item['valid_until'] || $item['valid_until'] >= $start))
            ->map(fn ($item) => [
                'training_site_id' => (int) $item['training_site_id'],
                'training_site' => $activeSites[$item['training_site_id']]->only('id', 'name_ar', 'name_en'),
                'valid_from' => $item['valid_from'] ?: $start, 'valid_until' => $item['valid_until'] ?: $end,
                'days' => collect($item['days'])->where('status', 'work')->pluck('day')->unique()->values()->all(),
            ])->filter(fn ($item) => $item['days'] && $this->datesForLocations([$item],$start,$end,$version->breaks))->values();
        $occupied = [];
        foreach ($locations as $location) {
            foreach ($this->datesForLocations([$location], $start, $end, $version->breaks) as $date) {
                if (isset($occupied[$date]) && $occupied[$date] !== $location['training_site_id']) {
                    throw ValidationException::withMessages(['follow_supervisor_workplaces' => ['يوجد تداخل بين مستشفيات المشرف في اليوم نفسه. صحّح أماكن وأيام الدوام أولاً.']]);
                }
                $occupied[$date] = $location['training_site_id'];
            }
        }
        if (! $occupied) throw ValidationException::withMessages(['follow_supervisor_workplaces' => ['لا يوجد جدول أماكن وأيام عمل صالح خلال فترة التوزيع لهذا المشرف.']]);
        return ['site_ids' => $locations->pluck('training_site_id')->unique()->values()->all(), 'locations' => $locations->all()];
    }

    public function locations(CourseScheduleRow $row, RotationBlock $block, DistributionVersion $version): array
    {
        if (! $row->workplace_schedule) return [];
        $version->loadMissing('rotation', 'breaks');
        $start = $this->dates->calculateBlockStartDate($version->rotation->start_date, (int) $block->from_week, $version->breaks);
        $end = $this->dates->calculateBlockEndDate($version->rotation->start_date, (int) $block->to_week, $version->breaks);
        return collect($row->workplace_schedule['locations'])->map(function ($location) use ($start, $end, $version) {
            $dates = $this->datesForLocations([$location], $start, $end, $version->breaks);
            $actualDays = array_unique(array_map(fn ($date)=>strtolower(Carbon::parse($date)->format('l')),$dates));
            $location['days'] = array_values(array_intersect($location['days'],$actualDays));
            return $location + ['scheduled_dates' => $dates];
        })->filter(fn ($location) => count($location['scheduled_dates']) > 0)->values()->all();
    }

    public function follows(StudentClinicalAssignment $assignment): bool
    {
        if (! $assignment->course_schedule_row_id) return false;
        $assignment->loadMissing('courseScheduleRow');
        return (bool) $assignment->courseScheduleRow?->workplace_schedule;
    }

    public function assignmentLocations(StudentClinicalAssignment $assignment): array
    {
        if (! $this->follows($assignment)) return [];
        $assignment->loadMissing('rotationBlock', 'distributionVersion');
        return $this->locations($assignment->courseScheduleRow, $assignment->rotationBlock, $assignment->distributionVersion);
    }

    public function signature(StudentClinicalAssignment $assignment): ?array
    {
        if (! $this->follows($assignment)) return null;
        return collect($this->assignmentLocations($assignment))->groupBy('training_site_id')->sortKeys()->map(fn ($locations,$id)=>[
            (int)$id,$locations->flatMap(fn ($location)=>$location['scheduled_dates'])->unique()->sort()->values()->all(),
        ])->values()->all();
    }

    /** Read-only projections; never persist these clones or create additional weekly assessments. */
    public function expand(Collection $assignments): Collection
    {
        if ($assignments instanceof \Illuminate\Database\Eloquent\Collection) $assignments->loadMissing(['courseScheduleRow','rotationBlock.rotation','distributionVersion.rotation','distributionVersion.breaks']);
        return $assignments->flatMap(function (StudentClinicalAssignment $assignment) {
            if ($assignment->getAttribute('placement_dates') !== null) return [$assignment];
            if (! $this->follows($assignment)) return [$assignment];
            return collect($this->assignmentLocations($assignment))->groupBy('training_site_id')->map(function ($locations, $siteId) use ($assignment) {
                $copy = clone $assignment;
                $copy->training_site_id = (int) $siteId;
                $copy->setRelation('trainingSite', (new TrainingSite())->forceFill($locations->first()['training_site']));
                $copy->setAttribute('placement_dates', $locations->flatMap(fn ($location) => $location['scheduled_dates'])->unique()->sort()->values()->all());
                return $copy;
            })->values()->all();
        })->values();
    }

    /** null means a legacy single-site assignment; [] means no duty in this range. */
    public function scheduledDates(StudentClinicalAssignment $assignment, string $start, string $end): ?array
    {
        if (! $this->follows($assignment)) return null;
        $dates = $assignment->getAttribute('placement_dates') ?? collect($this->assignmentLocations($assignment))->flatMap(fn ($location) => $location['scheduled_dates'])->unique()->all();
        return array_values(array_filter($dates, fn ($date) => $date >= $start && $date <= $end));
    }

    public function forDate(StudentClinicalAssignment $assignment, string $date): StudentClinicalAssignment
    {
        if (! $this->follows($assignment)) return $assignment;
        $match = $this->expand(collect([$assignment]))->first(fn ($item) => in_array($date, $item->placement_dates, true));
        if (! $match) throw ValidationException::withMessages(['session_date' => ['هذا التاريخ ليس يوم تدريب معتمدًا للمجموعة.']]);
        return $match;
    }

    public function rowSiteDates(CourseScheduleRow $row, Person $person, DistributionVersion $version, RotationBlock $block, int $siteId, ?array $weekdays = null): array
    {
        $version->loadMissing('rotation', 'breaks');
        if ($row->workplace_schedule) return collect($this->locations($row, $block, $version))->where('training_site_id', $siteId)
            ->flatMap(fn ($location) => $location['scheduled_dates'])->unique()->values()->all();
        $start = $this->dates->calculateBlockStartDate($version->rotation->start_date, (int) $block->from_week, $version->breaks);
        $end = $this->dates->calculateBlockEndDate($version->rotation->start_date, (int) $block->to_week, $version->breaks);
        $schedules = collect($this->schedules->schedules($person));
        if ($schedules->isEmpty()) return $this->datesForLocations([['valid_from'=>$start,'valid_until'=>$end,'days'=>$weekdays ?: SupervisorWorkScheduleService::DAYS]],$start,$end,$version->breaks);
        $locations = $schedules->where('training_site_id',$siteId)->map(fn ($item)=>[
            'valid_from'=>$item['valid_from'] ?: $start,'valid_until'=>$item['valid_until'] ?: $end,
            'days'=>collect($item['days'])->where('status','work')->pluck('day')->filter(fn ($day)=>!$weekdays||in_array($day,$weekdays,true))->all(),
        ])->all();
        return $this->datesForLocations($locations,$start,$end,$version->breaks);
    }

    public function atSite(Builder $query, int $siteId): Builder
    {
        return $query->where(fn ($q) => $q->where(fn ($single) => $single->where('training_site_id', $siteId)->whereDoesntHave('courseScheduleRow', fn ($row) => $row->whereNotNull('workplace_schedule')))
            ->orWhereHas('courseScheduleRow', fn ($row) => $row->whereJsonContains('workplace_schedule->site_ids', $siteId)));
    }

    private function datesForLocations(array $locations, string $start, string $end, iterable $breaks): array
    {
        $result = [];
        for ($date = Carbon::parse($start); $date->toDateString() <= $end; $date->addDay()) {
            if ($this->dates->isBreakDate($date, $breaks)) continue;
            foreach ($locations as $location) {
                if ($date->toDateString() >= $location['valid_from'] && $date->toDateString() <= $location['valid_until'] && in_array(strtolower($date->format('l')), $location['days'], true)) {
                    $result[] = $date->toDateString(); break;
                }
            }
        }
        return $result;
    }
}
