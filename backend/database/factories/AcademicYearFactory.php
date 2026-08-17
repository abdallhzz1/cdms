<?php

namespace Database\Factories;

use App\Models\AcademicYear;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends Factory<AcademicYear>
 */
class AcademicYearFactory extends Factory
{
    protected $model = AcademicYear::class;

    private static int $counter = 0;

    public function definition(): array
    {
        self::$counter++;
        $startYear = 2050 + self::$counter;
        $endYear   = $startYear + 1;

        return [
            'code'            => "{$startYear}/{$endYear}",
            'start_date'      => "{$startYear}-09-01",
            'end_date'        => "{$endYear}-08-31",
            'semester1_start' => "{$startYear}-09-01",
            'semester1_end'   => "{$endYear}-01-15",
            'semester2_start' => "{$endYear}-02-01",
            'semester2_end'   => "{$endYear}-06-15",
            'summer_start'    => null,
            'summer_end'      => null,
            'is_current'      => false,
            'status'          => 'active',
            'notes'           => null,
        ];
    }

    public function current(): static
    {
        return $this->state(['is_current' => true, 'status' => 'active']);
    }
}
