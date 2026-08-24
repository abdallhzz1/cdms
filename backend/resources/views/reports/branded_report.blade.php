<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>{{ $title }}</title>
    <style>
        @page { margin: 92px 26px 48px; }
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', sans-serif; direction: ltr; color: #1e293b; font-size: 9px; }
        .report-header { position: fixed; top: -76px; left: 0; right: 0; height: 68px; border-bottom: 2px solid #0f766e; }
        .logo { position: absolute; right: 0; top: 0; width: 58px; height: 58px; }
        .identity { text-align: center; padding: 1px 72px; }
        .identity h1 { margin: 0; color: #134e4a; font-size: 16px; }
        .identity h2 { margin: 3px 0 0; color: #0f766e; font-size: 10px; }
        .identity p { margin: 3px 0 0; color: #64748b; font-size: 8px; }
        .meta { margin: 0 0 10px; padding: 7px 10px; background: #f0fdfa; border: 1px solid #ccfbf1; color: #475569; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { background: #0f766e; color: white; font-weight: bold; padding: 6px 4px; border: 1px solid #0d9488; text-align: center; }
        td { padding: 5px 4px; border-bottom: 1px solid #cbd5e1; vertical-align: top; text-align: right; overflow-wrap: break-word; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        .empty { padding: 28px; text-align: center; color: #64748b; border: 1px solid #cbd5e1; }
        .footer { position: fixed; bottom: -34px; left: 0; right: 0; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #64748b; font-size: 8px; }
        .footer .page:after { content: counter(page); }
        .footer .left { float: left; direction: ltr; }
        .footer .right { float: right; }
    </style>
</head>
<body>
    <div class="report-header">
        @if($logoData)
            <img class="logo" src="data:image/png;base64,{{ $logoData }}" alt="شعار جامعة الخليل">
        @endif
        <div class="identity">
            <h1>{{ \App\Support\ArabicPdfText::visual($title) }}</h1>
            <h2>{{ \App\Support\ArabicPdfText::visual('جامعة الخليل - كلية الطب - الدائرة السريرية') }}</h2>
            <p>{{ \App\Support\ArabicPdfText::visual('نظام إدارة الدائرة السريرية') }}</p>
        </div>
    </div>

    <div class="footer">
        <span class="right">{{ \App\Support\ArabicPdfText::visual('صفحة') }} <span class="page"></span></span>
        <span class="left">Generated: {{ now()->format('Y-m-d H:i') }}</span>
    </div>

    <div class="meta">
        <strong>{{ \App\Support\ArabicPdfText::visual('نطاق التقرير:') }}</strong> {{ \App\Support\ArabicPdfText::visual($filterLabel) }}
        &nbsp;&nbsp; | &nbsp;&nbsp;
        <strong>{{ \App\Support\ArabicPdfText::visual('عدد السجلات:') }}</strong> {{ count($rows) }}
    </div>

    @if(count($rows))
        <table>
            <thead>
                <tr>
                    @foreach($columns as $column)
                        <th>{{ \App\Support\ArabicPdfText::visual($column) }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @foreach($rows as $row)
                    <tr>
                        @foreach($row as $value)
                            <td>{{ $value === null || $value === '' ? '—' : \App\Support\ArabicPdfText::visual($value) }}</td>
                        @endforeach
                    </tr>
                @endforeach
            </tbody>
        </table>
    @else
        <div class="empty">{{ \App\Support\ArabicPdfText::visual('لا توجد بيانات مطابقة للفلاتر المحددة.') }}</div>
    @endif
</body>
</html>
