<?php

namespace App\Exports;

use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Maatwebsite\Excel\Concerns\FromQuery;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;

class BasicAttendanceReportExport extends DefaultValueBinder implements FromQuery, WithMapping, WithHeadings, WithEvents, WithCustomValueBinder
{
    public function __construct(
        private readonly object $section,
        private readonly Builder $records,
        private readonly int $rowCount,
    ) {}

    public function query(): Builder
    {
        return $this->records;
    }

    public function headings(): array
    {
        return [
            [__('basic_attendance.report_title')],
            [__('basic_attendance.report_college')],
            [__('basic_attendance.report_course').': '.$this->section->course_name.' ('.$this->section->course_code.')'],
            [__('basic_attendance.report_section').': '.$this->section->number.'  ·  '.$this->section->academic_year.'  ·  '.__('basic_attendance.semester_'.$this->section->semester)],
            [__('basic_attendance.report_exported_at').': '.now()->format('Y-m-d H:i')],
            [''],
            array_map(fn (int $key) => __('basic_attendance.message'.$key), range(15, 25)),
        ];
    }

    public function map($row): array
    {
        $labels = fn (string $prefix, string $value) => __('basic_attendance.'.$prefix.'_'.$value);
        $date = fn (?string $value) => $value ? ExcelDate::dateTimeToExcel(Carbon::parse($value)) : null;

        return [
            (string) $row->university_number,
            (string) $row->name,
            (string) $row->title,
            $date($row->opened_at),
            $labels('state', $row->session_state),
            $labels('status', $row->status),
            $date($row->check_in_at),
            $date($row->check_out_at),
            $row->is_late ? __('basic_attendance.yes') : __('basic_attendance.no'),
            $labels('source', $row->source),
            (string) ($row->reason ?? ''),
        ];
    }

    public function bindValue(Cell $cell, mixed $value): bool
    {
        if (is_string($value)) {
            // Identifiers and user-supplied names must never be coerced to numbers or formulas.
            $cell->setValueExplicit($value, DataType::TYPE_STRING);
            return true;
        }

        return parent::bindValue($cell, $value);
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => function (AfterSheet $event): void {
                $sheet = $event->sheet->getDelegate();
                $lastRow = 7 + $this->rowCount;
                $rtl = app()->getLocale() === 'ar';
                $sheet->setRightToLeft($rtl);
                $sheet->setShowGridlines(false);
                $sheet->setTitle($rtl ? 'الحضور' : 'Attendance');

                foreach (range(1, 5) as $row) $sheet->mergeCells("A{$row}:K{$row}");

                $sheet->getStyle('A1:K'.$lastRow)->getFont()->setName('Arial')->setSize(10)->getColor()->setRGB('1E293B');
                $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(15)->getColor()->setRGB('134E4A');
                $sheet->getStyle('A2')->getFont()->setBold(true)->setSize(11)->getColor()->setRGB('0F766E');
                $sheet->getStyle('A3:A5')->getFont()->setSize(10)->getColor()->setRGB('475569');
                $sheet->getRowDimension(1)->setRowHeight(27);
                $sheet->getRowDimension(2)->setRowHeight(21);
                $sheet->getRowDimension(3)->setRowHeight(21);
                $sheet->getRowDimension(4)->setRowHeight(21);
                $sheet->getRowDimension(5)->setRowHeight(20);
                $sheet->getRowDimension(6)->setRowHeight(8);
                $sheet->getRowDimension(7)->setRowHeight(28);
                $sheet->getDefaultRowDimension()->setRowHeight(21);

                $sheet->getStyle('A7:K7')->getFill()->setFillType('solid')->getStartColor()->setRGB('0F766E');
                $sheet->getStyle('A7:K7')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
                $sheet->getStyle('A7:K7')->getAlignment()->setHorizontal('center')->setVertical('center')->setWrapText(true);
                if ($this->rowCount > 0) {
                    $sheet->getStyle("A8:K{$lastRow}")->getAlignment()->setVertical('center');
                    $sheet->getStyle("A8:K{$lastRow}")->getBorders()->getHorizontal()->setBorderStyle(Border::BORDER_HAIR)->getColor()->setRGB('E2E8F0');
                    $sheet->getStyle("D8:D{$lastRow}")->getNumberFormat()->setFormatCode('yyyy-mm-dd hh:mm');
                    $sheet->getStyle("G8:H{$lastRow}")->getNumberFormat()->setFormatCode('yyyy-mm-dd hh:mm');
                    $sheet->getStyle("A8:A{$lastRow}")->getNumberFormat()->setFormatCode('@');
                    $sheet->setAutoFilter("A7:K{$lastRow}");
                }

                foreach (['A' => 19, 'B' => 29, 'C' => 32, 'D' => 21, 'E' => 18, 'F' => 19, 'G' => 21, 'H' => 21, 'I' => 14, 'J' => 19, 'K' => 42] as $column => $width) {
                    $sheet->getColumnDimension($column)->setWidth($width);
                }

                $sheet->freezePane('C8');
                $sheet->getSheetView()->setZoomScale(85);
                $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)->setPaperSize(PageSetup::PAPERSIZE_A3)->setFitToWidth(1)->setFitToHeight(0);
                $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1, 7);
                $sheet->getPageMargins()->setTop(0.4)->setBottom(0.4)->setLeft(0.3)->setRight(0.3);
                $sheet->getHeaderFooter()->setOddFooter($rtl ? '&R صفحة &P من &N' : '&R Page &P of &N');
            },
        ];
    }
}
