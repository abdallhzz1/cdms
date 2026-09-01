<?php

namespace App\Services;

use App\Models\Person;
use App\Models\SupervisorAvailability;
use Carbon\Carbon;
use Illuminate\Support\Collection;

class SupervisorWorkScheduleService
{
    public const DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];

    public function workingDays(Person $person, int $siteId, Carbon|string|null $from = null, Carbon|string|null $until = null): array
    {
        $records = $this->overlappingRecords($person, $from, $until);
        if ($records->isEmpty()) {
            // Existing installations have linked supervisors without detailed
            // schedules. Keep them usable until their first schedule is saved;
            // once configured, dates outside all ranges are unavailable.
            return $person->availabilities()->exists() ? [] : self::DAYS;
        }

        return $records->where('training_site_id', $siteId)->where('status', 'work')
            ->pluck('day')->filter()->unique()->values()->all();
    }

    public function isAvailable(Person $person, int $siteId, Carbon|string|null $from = null, Carbon|string|null $until = null): bool
    {
        return count($this->workingDays($person, $siteId, $from, $until)) > 0;
    }

    public function schedules(Person $person): array
    {
        $primaryMarked = false;
        return $person->availabilities()->with('trainingSite:id,name_ar,name_en')->orderBy('available_from')->orderBy('training_site_id')->get()
            ->groupBy(fn ($row) => implode('|', [$row->training_site_id, $row->available_from?->format('Y-m-d'), $row->available_until?->format('Y-m-d')]))
            ->map(function (Collection $rows) use ($person, &$primaryMarked) {
                $first = $rows->first();
                $isPrimary = ! $primaryMarked && (int) $person->primary_site_id === (int) $first->training_site_id;
                if ($isPrimary) $primaryMarked = true;
                return [
                    'training_site_id' => $first->training_site_id,
                    'training_site' => $first->trainingSite,
                    'is_primary' => $isPrimary,
                    'valid_from' => $first->available_from?->format('Y-m-d'),
                    'valid_until' => $first->available_until?->format('Y-m-d'),
                    'days' => $rows->map(fn ($row) => ['day' => $row->day, 'status' => $row->status ?: 'work', 'note' => $row->notes ?: $row->reason])->values(),
                ];
            })->values()->all();
    }

    private function overlappingRecords(Person $person, Carbon|string|null $from, Carbon|string|null $until): Collection
    {
        $start = $from ? Carbon::parse($from)->toDateString() : null;
        $end = $until ? Carbon::parse($until)->toDateString() : null;

        return $person->availabilities()->when($start, fn ($query) => $query->where(fn ($q) => $q->whereNull('available_until')->orWhereDate('available_until', '>=', $start)))
            ->when($end, fn ($query) => $query->where(fn ($q) => $q->whereNull('available_from')->orWhereDate('available_from', '<=', $end)))
            ->get();
    }
}
