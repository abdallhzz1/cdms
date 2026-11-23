<?php

namespace App\Exports;

use Maatwebsite\Excel\Concerns\{WithMultipleSheets, FromArray, WithEvents, WithTitle, WithCustomValueBinder};
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\{DefaultValueBinder, Cell, DataType};
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;

class ClinicalDistributionMatrixExport implements \Maatwebsite\Excel\Concerns\Export, WithMultipleSheets
{
    public function __construct(private readonly array $matrices) {}
    public function sheets(): array
    {
        $matrices = $this->matrices ?: [['title' => __('distribution_report.empty'), 'status' => '', 'weeks' => array_map(fn ($number) => ['number' => $number, 'start' => null, 'end' => null, 'activity' => ''], range(1, 12)), 'rows' => []]];
        return array_map(fn ($matrix, $index) => new ClinicalDistributionMatrixSheet($matrix, $index + 1), $matrices, array_keys($matrices));
    }
}

class ClinicalDistributionMatrixSheet extends DefaultValueBinder implements FromArray, WithEvents, WithTitle, WithCustomValueBinder
{
    public function __construct(private readonly array $matrix, private readonly int $number) {}
    public function title(): string { return mb_substr($this->number.' '.str_replace(['\\', '/', '?', '*', ':', '[', ']', "'"], '-', $this->matrix['title']), 0, 31); }
    public function bindValue(Cell $cell, mixed $value): bool { $cell->setValueExplicit((string) ($value ?? ''), DataType::TYPE_STRING); return true; }
    public function array(): array
    {
        return [[$this->matrix['title']], [__('distribution_report.title').($this->matrix['status'] ? ' · '.__('distribution_report.'.$this->matrix['status']) : '')],
            [__('distribution_report.generated').': '.now()->format('Y-m-d H:i')], [implode(' | ', $this->matrix['breaks'] ?? [])],
            [__('distribution_report.site'), __('distribution_report.supervisor'), __('distribution_report.days'), ...array_map(fn ($week) => __('distribution_report.week').' '.$week['number']."\n".($week['start'] ?? '')."\n".($week['end'] ?? '').($week['activity'] ? "\n".$week['activity'] : ''), $this->matrix['weeks'])],
            ...$this->matrix['rows']];
    }
    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event) {
            $sheet = $event->sheet->getDelegate();
            $last = max(5, $sheet->getHighestRow());
            $sheet->setRightToLeft(app()->getLocale() !== 'en');
            foreach (range(1, 4) as $row) $sheet->mergeCells('A'.$row.':O'.$row);
            $sheet->getStyle('A1:O'.$last)->getFont()->setName('Arial')->setSize(10);
            $sheet->getStyle('A1:O'.$last)->getAlignment()->setWrapText(true)->setVertical('center')->setHorizontal('center');
            $sheet->getStyle('A1:O2')->getFont()->setBold(true)->setSize(13);
            $sheet->getStyle('A5:O5')->getFont()->setBold(true);
            $sheet->getStyle('A5:O5')->getFill()->setFillType('solid')->getStartColor()->setRGB('EEEEEE');
            $sheet->getStyle('A5:O'.$last)->getBorders()->getAllBorders()->setBorderStyle('thin')->getColor()->setRGB('AAAAAA');
            $sheet->getColumnDimension('A')->setWidth(23);
            $sheet->getColumnDimension('B')->setWidth(34);
            $sheet->getColumnDimension('C')->setWidth(18);
            foreach (range('D', 'O') as $column) $sheet->getColumnDimension($column)->setWidth(14);
            $sheet->getRowDimension(1)->setRowHeight(36);
            $sheet->getRowDimension(2)->setRowHeight(25);
            $sheet->getRowDimension(4)->setRowHeight(30);
            $sheet->getRowDimension(5)->setRowHeight(76);
            foreach ($this->matrix['rows'] as $index => $row) $sheet->getRowDimension($index + 6)->setRowHeight(max(36, 16 * (int) ceil(max(array_map('mb_strlen', $row)) / 16)));
            $sheet->freezePane('D6');
            $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)->setPaperSize(PageSetup::PAPERSIZE_A4)->setFitToWidth(1)->setFitToHeight(0)->setRowsToRepeatAtTopByStartAndEnd(1, 5)->setPrintArea('A1:O'.$last);
            $sheet->setShowGridlines(false);
        }];
    }
}
