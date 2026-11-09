<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\Export;
use Maatwebsite\Excel\Concerns\WithMultipleSheets;

class ClinicalTrainingSitesExport implements Export, WithMultipleSheets
{
    public function __construct(
        private readonly array $rows,
        private readonly string $filterLabel,
    ) {}

    public function sheets(): array
    {
        $rows = collect($this->rows);
        $sheets = [new BrandedReportExport(
            'ملخص طلبة التدريب السريري',
            ['الشهر', 'المركز التدريبي', 'الإجمالي', 'السنة الرابعة', 'السنة الخامسة', 'السنة السادسة'],
            $this->summaryRows($rows),
            $this->filterLabel,
        )];

        foreach ($rows->groupBy(0) as $month => $monthRows) {
            $sheets[] = new BrandedReportExport(
                'التدريب السريري - '.$month,
                ['المركز التدريبي', 'الرقم الجامعي', 'اسم الطالب', 'السنة السريرية', 'المساق', 'المجموعة', 'فترة التدريب'],
                $monthRows->sortBy(fn (array $row) => $row[1].'|'.$row[3].'|'.$row[2])->map(fn (array $row) => [
                    $row[1],
                    $row[2],
                    $row[3],
                    $row[4],
                    $row[7],
                    $row[8],
                    $row[9].' — '.$row[10],
                ])->values()->all(),
                $this->filterLabel,
            );
        }

        return $sheets;
    }

    private function summaryRows(Collection $rows): array
    {
        return $rows
            ->groupBy(fn (array $row) => $row[0].'|'.$row[1])
            ->map(function (Collection $siteRows): array {
                $first = $siteRows->first();

                return [
                    $first[0],
                    $first[1],
                    $siteRows->count(),
                    $siteRows->where(4, 'السنة الرابعة')->count(),
                    $siteRows->where(4, 'السنة الخامسة')->count(),
                    $siteRows->where(4, 'السنة السادسة')->count(),
                ];
            })
            ->values()
            ->all();
    }
}
