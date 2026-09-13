<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>تقرير المساق {{ $course->code }}</title>
    <style>
        @page { margin: 105px 34px 55px; }
        * { box-sizing: border-box; }
        body { font-family: 'DejaVu Sans', sans-serif; direction: rtl; color: #1e293b; font-size: 10px; line-height: 1.65; }
        .header { position: fixed; top: -88px; left: 0; right: 0; height: 78px; border-bottom: 2px solid #0f766e; }
        .logo { position: absolute; right: 0; top: 3px; width: 62px; height: 62px; object-fit: contain; }
        .identity { text-align: center; padding: 0 75px; }
        .identity h1 { margin: 0; color: #134e4a; font-size: 17px; }
        .identity h2 { margin: 3px 0 0; color: #0f766e; font-size: 11px; }
        .identity p { margin: 2px 0 0; color: #64748b; font-size: 8px; }
        .footer { position: fixed; bottom: -38px; left: 0; right: 0; border-top: 1px solid #cbd5e1; padding-top: 6px; color: #64748b; font-size: 8px; }
        .page:after { content: counter(page); }
        .footer-right { float: right; }
        .footer-left { float: left; direction: ltr; }
        .title { text-align: center; margin-bottom: 12px; }
        .title h2 { margin: 0; color: #0f172a; font-size: 18px; }
        .title p { margin: 2px 0 0; color: #64748b; }
        .meta { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
        .meta td { width: 25%; border: 1px solid #cbd5e1; padding: 7px; }
        .meta .label { color: #64748b; font-size: 8px; display: block; }
        .meta .value { color: #0f172a; font-weight: bold; }
        .section { margin-top: 14px; page-break-inside: avoid; }
        .section-title { margin: 0 0 6px; padding: 6px 9px; color: #fff; background: #0f766e; font-size: 11px; }
        .description { border: 1px solid #cbd5e1; background: #f8fafc; padding: 9px; min-height: 38px; }
        table.data { width: 100%; border-collapse: collapse; table-layout: fixed; }
        table.data thead { display: table-header-group; }
        table.data tr { page-break-inside: avoid; }
        table.data th { background: #e6fffb; color: #134e4a; border: 1px solid #99f6e4; padding: 6px; font-weight: bold; }
        table.data td { border: 1px solid #cbd5e1; padding: 6px; vertical-align: top; overflow-wrap: break-word; }
        table.data tbody tr:nth-child(even) { background: #f8fafc; }
        .center { text-align: center; }
        .empty { text-align: center; color: #64748b; padding: 12px; border: 1px solid #cbd5e1; }
        .summary { margin-top: 14px; background: #f0fdfa; border: 1px solid #99f6e4; padding: 8px 10px; color: #134e4a; }
    </style>
</head>
<body>
    <div class="header">
        @if($logoData)<img class="logo" src="data:image/png;base64,{{ $logoData }}" alt="شعار جامعة الخليل">@endif
        <div class="identity">
            <h1>{{ \App\Support\ArabicPdfText::visual('جامعة الخليل') }}</h1>
            <h2>{{ \App\Support\ArabicPdfText::visual('كلية الطب والعلوم الصحية - الدائرة السريرية') }}</h2>
            <p>{{ \App\Support\ArabicPdfText::visual('نظام إدارة الدائرة السريرية') }}</p>
        </div>
    </div>

    <div class="footer">
        <span class="footer-right">{{ \App\Support\ArabicPdfText::visual('صفحة') }} <span class="page"></span></span>
        <span class="footer-left">{{ now()->format('Y-m-d H:i') }}</span>
    </div>

    <div class="title">
        <h2>{{ \App\Support\ArabicPdfText::visual('تقرير بيانات المساق') }}</h2>
        <p>{{ $course->code }} — {{ \App\Support\ArabicPdfText::visual($course->name_ar) }}</p>
    </div>

    <table class="meta">
        <tr>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('رمز المساق') }}</span><span class="value">{{ $course->code }}</span></td>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('اسم المساق') }}</span><span class="value">{{ \App\Support\ArabicPdfText::visual($course->name_ar) }}</span></td>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('الساعات المعتمدة') }}</span><span class="value">{{ $course->credit_hours }}</span></td>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('العام الأكاديمي') }}</span><span class="value">{{ $academicYear?->code ?? '—' }}</span></td>
        </tr>
        <tr>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('المستوى الأكاديمي') }}</span><span class="value">{{ \App\Support\ArabicPdfText::visual(['fourth'=>'السنة الرابعة','fifth'=>'السنة الخامسة','sixth'=>'السنة السادسة'][$course->academic_level] ?? $course->academic_level ?? '—') }}</span></td>
            <td colspan="2"><span class="label">{{ \App\Support\ArabicPdfText::visual('الاسم بالإنجليزية') }}</span><span class="value">{{ $course->name_en ?: '—' }}</span></td>
            <td><span class="label">{{ \App\Support\ArabicPdfText::visual('حالة المساق') }}</span><span class="value">{{ \App\Support\ArabicPdfText::visual($course->is_active ? 'فعال' : 'غير فعال') }}</span></td>
        </tr>
    </table>

    <div class="section">
        <h3 class="section-title">{{ \App\Support\ArabicPdfText::visual('وصف المساق') }}</h3>
        <div class="description">{{ $course->description ? \App\Support\ArabicPdfText::visual($course->description) : \App\Support\ArabicPdfText::visual('لا يوجد وصف مسجل للمساق.') }}</div>
    </div>

    <div class="section">
        <h3 class="section-title">{{ \App\Support\ArabicPdfText::visual('مخرجات التعلم المستهدفة (ILOs)') }}</h3>
        @if($course->learningOutcomes->isNotEmpty())
            <table class="data"><thead><tr><th style="width:13%">{{ \App\Support\ArabicPdfText::visual('الرمز') }}</th><th>{{ \App\Support\ArabicPdfText::visual('مخرج التعلم') }}</th><th style="width:20%">{{ \App\Support\ArabicPdfText::visual('المجال') }}</th></tr></thead><tbody>
            @foreach($course->learningOutcomes as $outcome)<tr><td class="center">{{ $outcome->outcome_code }}</td><td>{{ \App\Support\ArabicPdfText::visual($outcome->text_ar ?: $outcome->text_en ?: '—') }}</td><td class="center">{{ \App\Support\ArabicPdfText::visual($outcome->domain ?: '—') }}</td></tr>@endforeach
            </tbody></table>
        @else<div class="empty">{{ \App\Support\ArabicPdfText::visual('لا توجد مخرجات تعلم مسجلة.') }}</div>@endif
    </div>

    <div class="section">
        <h3 class="section-title">{{ \App\Support\ArabicPdfText::visual('ارتباط مخرجات المساق بمخرجات البرنامج (PLOs)') }}</h3>
        @if($course->programOutcomeMappings->isNotEmpty())
            <table class="data"><thead><tr><th style="width:15%">{{ \App\Support\ArabicPdfText::visual('الرمز') }}</th><th>{{ \App\Support\ArabicPdfText::visual('مخرج البرنامج') }}</th><th style="width:18%">{{ \App\Support\ArabicPdfText::visual('مستوى الارتباط') }}</th></tr></thead><tbody>
            @foreach($course->programOutcomeMappings as $mapping)
                @php($programOutcome = $programOutcomes->get($mapping->program_outcome_code))
                <tr><td class="center">{{ $mapping->program_outcome_code }}</td><td>{{ \App\Support\ArabicPdfText::visual($programOutcome?->description_ar ?: $programOutcome?->name_ar ?: $programOutcome?->description_en ?: $programOutcome?->name_en ?: '—') }}</td><td class="center">{{ \App\Support\ArabicPdfText::visual(['High'=>'مرتفع','Medium'=>'متوسط','Low'=>'منخفض'][$mapping->mapping_level] ?? $mapping->mapping_level ?? '—') }}</td></tr>
            @endforeach
            </tbody></table>
        @else<div class="empty">{{ \App\Support\ArabicPdfText::visual('لا توجد ارتباطات بمخرجات البرنامج.') }}</div>@endif
    </div>

    <div class="section">
        <h3 class="section-title">{{ \App\Support\ArabicPdfText::visual('مكونات التقييم') }}</h3>
        @if($course->assessmentComponents->isNotEmpty())
            <table class="data"><thead><tr><th>{{ \App\Support\ArabicPdfText::visual('المكوّن') }}</th><th style="width:18%">{{ \App\Support\ArabicPdfText::visual('العلامة') }}</th><th style="width:18%">{{ \App\Support\ArabicPdfText::visual('الوزن') }}</th><th>{{ \App\Support\ArabicPdfText::visual('ملاحظات') }}</th></tr></thead><tbody>
            @foreach($course->assessmentComponents as $component)<tr><td>{{ \App\Support\ArabicPdfText::visual($component->name) }}</td><td class="center">{{ number_format((float)$component->max_score, 0) }}</td><td class="center">{{ number_format((float)$component->weight, 0) }}%</td><td>{{ $component->notes ? \App\Support\ArabicPdfText::visual($component->notes) : '—' }}</td></tr>@endforeach
            </tbody></table>
            <div class="summary"><strong>{{ \App\Support\ArabicPdfText::visual('إجمالي مكونات التقييم:') }}</strong> {{ number_format((float)$course->assessmentComponents->sum('weight'), 0) }}%</div>
        @else<div class="empty">{{ \App\Support\ArabicPdfText::visual('لا توجد مكونات تقييم مسجلة.') }}</div>@endif
    </div>
</body>
</html>
