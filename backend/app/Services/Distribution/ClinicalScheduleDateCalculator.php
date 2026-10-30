<?php

namespace App\Services\Distribution;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use InvalidArgumentException;

class ClinicalScheduleDateCalculator
{
    /**
     * Calculates the start date of a block based on rotation start date and from_week.
     * Break-aware week start. Existing schedules without breaks retain the
     * original rotation.start_date + (week - 1) * 7 days behaviour.
     * 
     * @param CarbonInterface|string $rotationStartDate
     * @param int $fromWeek
     * @return string ISO 8601 date string (YYYY-MM-DD)
     */
    public function calculateBlockStartDate(CarbonInterface|string $rotationStartDate, int $fromWeek, iterable $breaks = []): string
    {
        if ($fromWeek < 1) {
            throw new InvalidArgumentException('from_week must be greater than or equal to 1.');
        }

        $baseDate = $rotationStartDate instanceof CarbonInterface 
            ? $rotationStartDate->copy() 
            : Carbon::parse($rotationStartDate);

        return $this->weekStart($baseDate, $fromWeek, $breaks)->toDateString();
    }

    /**
     * Calculates the end date of a block based on rotation start date and to_week.
     * Break-aware week end (six days after the calculated week start).
     * 
     * @param CarbonInterface|string $rotationStartDate
     * @param int $toWeek
     * @return string ISO 8601 date string (YYYY-MM-DD)
     */
    public function calculateBlockEndDate(CarbonInterface|string $rotationStartDate, int $toWeek, iterable $breaks = []): string
    {
        if ($toWeek < 1) {
            throw new InvalidArgumentException('to_week must be greater than or equal to 1.');
        }

        $baseDate = $rotationStartDate instanceof CarbonInterface 
            ? $rotationStartDate->copy() 
            : Carbon::parse($rotationStartDate);

        return $this->weekStart($baseDate, $toWeek, $breaks)->addDays(6)->toDateString();
    }

    public function isBreakDate(CarbonInterface|string $date, iterable $breaks): bool
    {
        $candidate = $date instanceof CarbonInterface ? $date->copy()->startOfDay() : Carbon::parse($date)->startOfDay();

        foreach ($breaks as $break) {
            $start = Carbon::parse(is_array($break) ? $break['start_date'] : $break->start_date)->startOfDay();
            $end = Carbon::parse(is_array($break) ? $break['end_date'] : $break->end_date)->endOfDay();
            if ($candidate->betweenIncluded($start, $end)) {
                return true;
            }
        }

        return false;
    }

    private function weekStart(CarbonInterface $baseDate, int $week, iterable $breaks): Carbon
    {
        $breaks = collect($breaks)->sortBy(fn ($break) => is_array($break) ? $break['start_date'] : $break->start_date)->values();
        $date = Carbon::instance($baseDate->copy())->startOfDay();

        for ($number = 2; $number <= $week; $number++) {
            $date->addWeek();
            while ($this->isBreakDate($date, $breaks)) {
                $date->addWeek();
            }
        }

        return $date;
    }
}
