<?php

namespace App\Exports;

use Illuminate\Support\Collection;
use Maatwebsite\Excel\Concerns\FromCollection;
use Maatwebsite\Excel\Concerns\WithCustomValueBinder;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Concerns\WithMapping;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Cell\Cell;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Cell\DefaultValueBinder;
use PhpOffice\PhpSpreadsheet\Style\Border;
use PhpOffice\PhpSpreadsheet\Worksheet\PageSetup;

class BasicAttendanceMonthlyExport extends DefaultValueBinder implements FromCollection, WithMapping, WithHeadings, WithEvents, WithCustomValueBinder
{
    public function __construct(private readonly object $section, private readonly array $summary) {}

    public function collection(): Collection
    {
        return $this->summary['students'];
    }

    public function headings(): array
    {
        return [
            [__('basic_attendance.report_monthly_title')],
            [__('basic_attendance.report_college')],
            [__('basic_attendance.report_course').': '.$this->section->course_name.' ('.$this->section->course_code.')'],
            [__('basic_attendance.report_section').': '.$this->section->number.' · '.$this->section->academic_year.' · '.$this->summary['month']],
            [__('basic_attendance.report_finalized_sessions').': '.$this->summary['finalized_sessions']],
            [''],
            [__('basic_attendance.message15'), __('basic_attendance.message16'), __('basic_attendance.report_month_sessions'), __('basic_attendance.status_present'), __('basic_attendance.status_absent'), __('basic_attendance.status_excused'), __('basic_attendance.status_incomplete'), __('basic_attendance.report_late'), __('basic_attendance.report_total_absent')],
        ];
    }

    public function map($student): array
    {
        return [(string) $student->university_number, (string) $student->name, $student->sessions, $student->present, $student->absent, $student->excused, $student->incomplete, $student->late, $student->total_absent];
    }

    public function bindValue(Cell $cell, mixed $value): bool
    {
        if (is_string($value)) {
            $cell->setValueExplicit($value, DataType::TYPE_STRING);
            return true;
        }
        return parent::bindValue($cell, $value);
    }

    public function registerEvents(): array
    {
        return [AfterSheet::class => function (AfterSheet $event): void {
            $sheet = $event->sheet->getDelegate();
            $last = 7 + $this->summary['students']->count();
            $rtl = app()->getLocale() === 'ar';
            $sheet->setRightToLeft($rtl);
            $sheet->setShowGridlines(false);
            $sheet->setTitle($rtl ? 'الملخص الشهري' : 'Monthly Summary');
            foreach (range(1, 5) as $row) $sheet->mergeCells("A{$row}:I{$row}");
            $sheet->getStyle("A1:I{$last}")->getFont()->setName('Arial')->setSize(10)->getColor()->setRGB('1E293B');
            $sheet->getStyle('A1')->getFont()->setBold(true)->setSize(15)->getColor()->setRGB('134E4A');
            $sheet->getStyle('A2:A5')->getFont()->setSize(10)->getColor()->setRGB('475569');
            $sheet->getRowDimension(1)->setRowHeight(27);
            $sheet->getRowDimension(6)->setRowHeight(8);
            $sheet->getRowDimension(7)->setRowHeight(30);
            $sheet->getDefaultRowDimension()->setRowHeight(22);
            $sheet->getStyle('A7:I7')->getFill()->setFillType('solid')->getStartColor()->setRGB('0F766E');
            $sheet->getStyle('A7:I7')->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
            $sheet->getStyle('A7:I7')->getAlignment()->setHorizontal('center')->setVertical('center')->setWrapText(true);
            if ($last > 7) {
                $sheet->getStyle("A8:I{$last}")->getAlignment()->setVertical('center');
                $sheet->getStyle("A8:I{$last}")->getBorders()->getHorizontal()->setBorderStyle(Border::BORDER_HAIR)->getColor()->setRGB('E2E8F0');
                $sheet->getStyle("C8:I{$last}")->getAlignment()->setHorizontal('center');
                $sheet->getStyle("A8:A{$last}")->getNumberFormat()->setFormatCode('@');
                for ($row = 8; $row <= $last; $row++) {
                    $total = (int) $sheet->getCell("I{$row}")->getValue();
                    if ($total >= 4) {
                        $sheet->getStyle("I{$row}")->getFill()->setFillType('solid')->getStartColor()->setRGB($total >= 6 ? 'FEE2E2' : 'FEF3C7');
                        $sheet->getStyle("I{$row}")->getFont()->setBold(true)->getColor()->setRGB($total >= 6 ? '991B1B' : '92400E');
                    }
                }
                $sheet->setAutoFilter("A7:I{$last}");
            }
            foreach (['A' => 20, 'B' => 34, 'C' => 19, 'D' => 15, 'E' => 15, 'F' => 15, 'G' => 18, 'H' => 16, 'I' => 20] as $column => $width) $sheet->getColumnDimension($column)->setWidth($width);
            $sheet->freezePane('C8');
            $sheet->getSheetView()->setZoomScale(90);
            $sheet->getPageSetup()->setOrientation(PageSetup::ORIENTATION_LANDSCAPE)->setPaperSize(PageSetup::PAPERSIZE_A4)->setFitToWidth(1)->setFitToHeight(0);
            $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1, 7);
        }];
    }
}
