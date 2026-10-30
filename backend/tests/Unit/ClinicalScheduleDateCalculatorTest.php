<?php

namespace Tests\Unit;

use App\Services\Distribution\ClinicalScheduleDateCalculator;
use PHPUnit\Framework\TestCase;

class ClinicalScheduleDateCalculatorTest extends TestCase
{
    private ClinicalScheduleDateCalculator $calculator;

    protected function setUp(): void
    {
        parent::setUp();
        $this->calculator = new ClinicalScheduleDateCalculator();
    }

    public function test_case_1_week_1_to_1()
    {
        $rotationStart = '2026-09-01';

        $startDate = $this->calculator->calculateBlockStartDate($rotationStart, 1);
        $endDate = $this->calculator->calculateBlockEndDate($rotationStart, 1);

        $this->assertEquals('2026-09-01', $startDate);
        $this->assertEquals('2026-09-07', $endDate);
    }

    public function test_case_2_week_2_to_3()
    {
        $rotationStart = '2026-09-01';

        $startDate = $this->calculator->calculateBlockStartDate($rotationStart, 2);
        $endDate = $this->calculator->calculateBlockEndDate($rotationStart, 3);

        $this->assertEquals('2026-09-08', $startDate);
        $this->assertEquals('2026-09-21', $endDate);
    }

    public function test_month_boundary_transition()
    {
        $rotationStart = '2026-01-25';

        $startDate = $this->calculator->calculateBlockStartDate($rotationStart, 1);
        $endDate = $this->calculator->calculateBlockEndDate($rotationStart, 2);

        $this->assertEquals('2026-01-25', $startDate);
        $this->assertEquals('2026-02-07', $endDate);
    }

    public function test_year_boundary_transition()
    {
        $rotationStart = '2026-12-25';

        $startDate = $this->calculator->calculateBlockStartDate($rotationStart, 1);
        $endDate = $this->calculator->calculateBlockEndDate($rotationStart, 2);

        $this->assertEquals('2026-12-25', $startDate);
        $this->assertEquals('2027-01-07', $endDate);
    }

    public function test_leap_year_february()
    {
        $rotationStart = '2028-02-20'; // 2028 is a leap year

        $startDate = $this->calculator->calculateBlockStartDate($rotationStart, 1);
        $endDate = $this->calculator->calculateBlockEndDate($rotationStart, 2);

        $this->assertEquals('2028-02-20', $startDate);
        $this->assertEquals('2028-03-04', $endDate);
    }

    public function test_break_skips_week_markers_inside_the_break_without_changing_week_numbers(): void
    {
        $breaks = [['start_date' => '2027-01-01', 'end_date' => '2027-01-08']];

        $this->assertSame('2026-12-31', $this->calculator->calculateBlockStartDate('2026-10-29', 10, $breaks));
        $this->assertSame('2027-01-14', $this->calculator->calculateBlockStartDate('2026-10-29', 11, $breaks));
        $this->assertSame('2027-01-20', $this->calculator->calculateBlockEndDate('2026-10-29', 11, $breaks));
    }

    public function test_multiple_breaks_are_applied_in_sequence(): void
    {
        $breaks = [
            ['start_date' => '2026-09-08', 'end_date' => '2026-09-14'],
            ['start_date' => '2026-09-22', 'end_date' => '2026-09-28'],
        ];

        $this->assertSame('2026-09-15', $this->calculator->calculateBlockStartDate('2026-09-01', 2, $breaks));
        $this->assertSame('2026-09-29', $this->calculator->calculateBlockStartDate('2026-09-01', 3, $breaks));
    }
}
