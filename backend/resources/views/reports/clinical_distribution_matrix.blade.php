<!doctype html>
<html><head><meta charset="utf-8"><title>{{ __('distribution_report.title') }}</title><style>
@page { margin: 24px 24px 32px; }
body { font-family: 'DejaVu Sans', sans-serif; direction:ltr; color:#222; font-size:9px; }
h1 { text-align:center; font-size:14px; margin:0 0 8px; }
h2 { text-align:center; font-size:11px; margin:0 0 7px; }
p { text-align:center; margin:4px 0 10px; font-size:8px; }
table { width:100%; border-collapse:collapse; table-layout:fixed; }
thead { display:table-header-group; } tr { page-break-inside:avoid; }
th,td { border:1px solid #999; padding:5px 2px; text-align:center; vertical-align:middle; overflow-wrap:break-word; }
th { background:#eee; font-size:8px; } td { height:25px; }
.dates { font-size:6.5px; font-weight:normal; } .activity { font-size:7px; font-weight:normal; }
.section { page-break-before:always; } .section:first-child { page-break-before:auto; }
</style></head><body>
@php
 $ar = app()->getLocale() !== 'en';
 $text = fn($value) => \App\Support\ArabicPdfText::visual((string)$value);
 $widths = [14,20,6,...array_fill(0,12,5)];
 $headers = [__('distribution_report.site'),__('distribution_report.supervisor'),__('distribution_report.days')];
@endphp
@forelse($matrices as $matrix)
<div class="section">
<h1>{{ $text(__('distribution_report.title')) }}</h1><h2>{{ $text($matrix['title']) }}</h2>
<p>{{ $text(__('distribution_report.'.$matrix['status'])) }} · {{ $text(__('distribution_report.generated')) }}: {{ now()->format('Y-m-d H:i') }}</p>
@if($matrix['breaks'])<p>{{ $text(implode(' | ', $matrix['breaks'])) }}</p>@endif
<table><colgroup>@foreach($ar ? array_reverse($widths) : $widths as $width)<col style="width:{{$width}}%">@endforeach</colgroup><thead><tr>
@php $head = [...$headers, ...$matrix['weeks']]; if($ar) $head = array_reverse($head); @endphp
@foreach($head as $index => $column)<th style="width:{{($ar ? array_reverse($widths) : $widths)[$index]}}%">@if(is_array($column)){{ $text(__('distribution_report.week')) }} {{ $column['number'] }}<br><span class="dates">{{ $column['start'] ? date('d/m',strtotime($column['start'])) : '—' }}<br>{{ $column['end'] ? date('d/m',strtotime($column['end'])) : '—' }}</span>@if($column['activity'])<br><span class="activity">{{ $text($column['activity']) }}</span>@endif @else{{ $text($column) }}@endif</th>@endforeach
</tr></thead><tbody>@forelse($matrix['rows'] as $row)<tr>@foreach($ar ? array_reverse($row) : $row as $index => $cell)<td style="width:{{($ar ? array_reverse($widths) : $widths)[$index]}}%">{{ $text($cell ?: '—') }}</td>@endforeach</tr>@empty<tr><td colspan="15">{{ $text(__('distribution_report.empty')) }}</td></tr>@endforelse</tbody></table>
</div>
@empty<p>{{ $text(__('distribution_report.empty')) }}</p>@endforelse
</body></html>
