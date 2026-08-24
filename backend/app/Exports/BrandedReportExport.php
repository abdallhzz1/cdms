<?php

namespace App\Exports;

use Illuminate\Support\Str;
use Maatwebsite\Excel\Concerns\FromArray;
use Maatwebsite\Excel\Concerns\ShouldAutoSize;
use Maatwebsite\Excel\Concerns\WithCustomStartCell;
use Maatwebsite\Excel\Concerns\WithDrawings;
use Maatwebsite\Excel\Concerns\WithEvents;
use Maatwebsite\Excel\Concerns\WithHeadings;
use Maatwebsite\Excel\Events\AfterSheet;
use PhpOffice\PhpSpreadsheet\Worksheet\Drawing;

class BrandedReportExport implements FromArray, WithHeadings, WithCustomStartCell, WithEvents, WithDrawings, ShouldAutoSize
{
    public function __construct(
        private readonly string $title,
        private readonly array $headings,
        private readonly array $rows,
        private readonly string $filterLabel,
    ) {}

    public function array(): array
    {
        return $this->rows;
    }

    public function headings(): array
    {
        return $this->headings;
    }

    public function startCell(): string
    {
        return 'A7';
    }

    public function drawings(): Drawing
    {
        $drawing = new Drawing();
        $drawing->setName('Hebron University Logo');
        $drawing->setDescription('Hebron University');
        $drawing->setPath(base_path('../frontend/src/assets/hebron.png'));
        $drawing->setHeight(72);
        $drawing->setCoordinates('A1');
        $drawing->setOffsetX(8);
        $drawing->setOffsetY(4);

        return $drawing;
    }

    public function registerEvents(): array
    {
        return [
            AfterSheet::class => function (AfterSheet $event): void {
                $sheet = $event->sheet->getDelegate();
                $lastColumn = $sheet->getHighestColumn();
                $lastRow = max(7, 7 + count($this->rows));
                $titleStart = count($this->headings) > 2 ? 'B' : 'A';

                $sheet->setRightToLeft(true);
                $sheet->mergeCells("{$titleStart}1:{$lastColumn}1");
                $sheet->mergeCells("{$titleStart}2:{$lastColumn}2");
                $sheet->mergeCells("{$titleStart}3:{$lastColumn}3");
                $sheet->mergeCells("{$titleStart}4:{$lastColumn}4");
                $sheet->setCellValue("{$titleStart}1", $this->title);
                $sheet->setCellValue("{$titleStart}2", 'جامعة الخليل - كلية الطب - الدائرة السريرية');
                $sheet->setCellValue("{$titleStart}3", 'تاريخ الإصدار: ' . now()->format('Y-m-d H:i'));
                $sheet->setCellValue("{$titleStart}4", $this->filterLabel);

                $sheet->getStyle("A1:{$lastColumn}5")->getFill()->setFillType('solid')->getStartColor()->setRGB('F0FDFA');
                $sheet->getStyle("{$titleStart}1:{$lastColumn}1")->getFont()->setBold(true)->setSize(16)->getColor()->setRGB('134E4A');
                $sheet->getStyle("{$titleStart}2:{$lastColumn}2")->getFont()->setBold(true)->setSize(11)->getColor()->setRGB('0F766E');
                $sheet->getStyle("{$titleStart}3:{$lastColumn}4")->getFont()->setSize(9)->getColor()->setRGB('475569');
                $sheet->getStyle("{$titleStart}1:{$lastColumn}4")->getAlignment()->setHorizontal('center')->setVertical('center');

                $sheet->getRowDimension(1)->setRowHeight(25);
                $sheet->getRowDimension(2)->setRowHeight(20);
                $sheet->getRowDimension(3)->setRowHeight(18);
                $sheet->getRowDimension(4)->setRowHeight(18);
                $sheet->getRowDimension(6)->setRowHeight(8);
                $sheet->getRowDimension(7)->setRowHeight(26);

                $sheet->getStyle("A7:{$lastColumn}7")->getFill()->setFillType('solid')->getStartColor()->setRGB('0F766E');
                $sheet->getStyle("A7:{$lastColumn}7")->getFont()->setBold(true)->getColor()->setRGB('FFFFFF');
                $sheet->getStyle("A7:{$lastColumn}7")->getAlignment()->setHorizontal('center')->setVertical('center')->setWrapText(true);
                $sheet->getStyle("A8:{$lastColumn}{$lastRow}")->getAlignment()->setVertical('top')->setWrapText(true);

                if ($lastRow >= 8) {
                    $sheet->getStyle("A8:{$lastColumn}{$lastRow}")->getBorders()->getBottom()->setBorderStyle('hair')->getColor()->setRGB('CBD5E1');
                    for ($row = 8; $row <= $lastRow; $row += 2) {
                        $sheet->getStyle("A{$row}:{$lastColumn}{$row}")->getFill()->setFillType('solid')->getStartColor()->setRGB('F8FAFC');
                    }
                    $sheet->setAutoFilter("A7:{$lastColumn}{$lastRow}");
                }

                foreach (range('A', $lastColumn) as $column) {
                    $current = $sheet->getColumnDimension($column)->getWidth();
                    $sheet->getColumnDimension($column)->setWidth(min(max($current, 14), 34));
                }
                $sheet->freezePane('A8');
                $sheet->getSheetView()->setZoomScale(90);
                $sheet->getPageSetup()->setOrientation('landscape')->setFitToWidth(1)->setFitToHeight(0);
                $sheet->getPageSetup()->setRowsToRepeatAtTopByStartAndEnd(1, 7);
                $sheet->getPageMargins()->setTop(0.35)->setBottom(0.45)->setLeft(0.3)->setRight(0.3);
                $sheet->getHeaderFooter()->setOddFooter('&R صفحة &P من &N &L نظام إدارة الدائرة السريرية');
                $sheet->setTitle(Str::limit(preg_replace('~[\\\\/\?\*\[\]:]~', '', $this->title), 28, ''));
            },
        ];
    }
}
