<!DOCTYPE html>
<html lang="ar">
<head>
    <meta charset="UTF-8">
    <title>{{ $title }}</title>
    <style>
        @page { margin: 92px 28px 48px; }
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', sans-serif; direction: ltr; color: #1e293b; font-size: 9px; }
        .report-header { position: fixed; top: -76px; left: 0; right: 0; height: 68px; border-bottom: 2px solid #0f766e; }
        .logo { position: absolute; right: 0; top: 0; width: 58px; height: 58px; }
        .identity { text-align: center; padding: 1px 72px; }
        .identity h1 { margin: 0; color: #134e4a; font-size: 15px; }
        .identity h2 { margin: 3px 0 0; color: #0f766e; font-size: 10px; }
        .identity p { margin: 3px 0 0; color: #64748b; font-size: 8px; }
        .meta { margin: 0 0 10px; padding: 7px 10px; background: #f0fdfa; border: 1px solid #ccfbf1; color: #475569; }
        .month-section + .month-section { page-break-before: always; }
        .month-title { margin: 0 0 8px; padding: 8px 10px; background: #0f766e; color: white; text-align: right; font-size: 13px; }
        .site-block { margin: 0 0 13px; page-break-inside: auto; }
        .site-title { margin: 0; padding: 6px 9px; background: #e6fffb; border: 1px solid #99f6e4; color: #115e59; text-align: right; font-size: 10px; }
        table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        thead { display: table-header-group; }
        tr { page-break-inside: avoid; }
        th { background: #f1f5f9; color: #475569; font-weight: bold; padding: 5px 4px; border: 1px solid #cbd5e1; text-align: center; }
        td { padding: 5px 4px; border: 1px solid #e2e8f0; vertical-align: top; text-align: right; overflow-wrap: break-word; }
        tbody tr:nth-child(even) { background: #f8fafc; }
        th:nth-child(1), td:nth-child(1) { width: 14%; direction: ltr; text-align: center; }
        th:nth-child(2), td:nth-child(2) { width: 24%; }
        th:nth-child(3), td:nth-child(3) { width: 13%; }
        th:nth-child(4), td:nth-child(4) { width: 20%; }
        th:nth-child(5), td:nth-child(5) { width: 13%; }
        th:nth-child(6), td:nth-child(6) { width: 16%; direction: ltr; text-align: center; }
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
        <strong>{{ \App\Support\ArabicPdfText::visual('عدد سجلات الطلبة:') }}</strong> {{ count($rows) }}
    </div>

    @forelse($groups as $month => $sites)
        <section class="month-section">
            <h2 class="month-title">{{ \App\Support\ArabicPdfText::visual($month) }}</h2>
            @foreach($sites as $site => $students)
                <div class="site-block">
                    <h3 class="site-title">{{ \App\Support\ArabicPdfText::visual($site) }} ({{ $students->count() }})</h3>
                    <table>
                        <thead><tr>
                            <th>{{ \App\Support\ArabicPdfText::visual('الرقم الجامعي') }}</th>
                            <th>{{ \App\Support\ArabicPdfText::visual('اسم الطالب') }}</th>
                            <th>{{ \App\Support\ArabicPdfText::visual('السنة') }}</th>
                            <th>{{ \App\Support\ArabicPdfText::visual('المساق') }}</th>
                            <th>{{ \App\Support\ArabicPdfText::visual('المجموعة') }}</th>
                            <th>{{ \App\Support\ArabicPdfText::visual('فترة التدريب') }}</th>
                        </tr></thead>
                        <tbody>
                            @foreach($students as $student)
                                <tr>
                                    <td>{{ $student[2] }}</td>
                                    <td>{{ \App\Support\ArabicPdfText::visual($student[3]) }}</td>
                                    <td>{{ \App\Support\ArabicPdfText::visual($student[4]) }}</td>
                                    <td>{{ $student[7] ? \App\Support\ArabicPdfText::visual($student[7]) : '—' }}</td>
                                    <td>{{ $student[8] ? \App\Support\ArabicPdfText::visual($student[8]) : '—' }}</td>
                                    <td>{{ $student[9] }} — {{ $student[10] }}</td>
                                </tr>
                            @endforeach
                        </tbody>
                    </table>
                </div>
            @endforeach
        </section>
    @empty
        <div class="empty">{{ \App\Support\ArabicPdfText::visual('لا توجد بيانات مطابقة للفلاتر المحددة.') }}</div>
    @endforelse
</body>
</html>
