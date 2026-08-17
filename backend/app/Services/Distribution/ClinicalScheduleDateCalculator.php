<?php

namespace App\Services\Distribution;

use Carbon\Carbon;
use Carbon\CarbonInterface;
use InvalidArgumentException;

class ClinicalScheduleDateCalculator
{
    /**
     * Calculates the start date of a block based on rotation start date and from_week.
     * Formula: rotation.start_date + (from_week - 1) * 7 days
     * 
     * @param CarbonInterface|string $rotationStartDate
     * @param int $fromWeek
     * @return string ISO 8601 date string (YYYY-MM-DD)
     */
    public function calculateBlockStartDate(CarbonInterface|string $rotationStartDate, int $fromWeek): string
    {
        if ($fromWeek < 1) {
            throw new InvalidArgumentException('from_week must be greater than or equal to 1.');
        }

        $baseDate = $rotationStartDate instanceof CarbonInterface 
            ? $rotationStartDate->copy() 
            : Carbon::parse($rotationStartDate);

        return $baseDate->addDays(($fromWeek - 1) * 7)->toDateString();
    }

    /**
     * Calculates the end date of a block based on rotation start date and to_week.
     * Formula: rotation.start_date + (to_week * 7 - 1) days
     * 
     * @param CarbonInterface|string $rotationStartDate
     * @param int $toWeek
     * @return string ISO 8601 date string (YYYY-MM-DD)
     */
    public function calculateBlockEndDate(CarbonInterface|string $rotationStartDate, int $toWeek): string
    {
        if ($toWeek < 1) {
            throw new InvalidArgumentException('to_week must be greater than or equal to 1.');
        }

        $baseDate = $rotationStartDate instanceof CarbonInterface 
            ? $rotationStartDate->copy() 
            : Carbon::parse($rotationStartDate);

        return $baseDate->addDays(($toWeek * 7) - 1)->toDateString();
    }
}
