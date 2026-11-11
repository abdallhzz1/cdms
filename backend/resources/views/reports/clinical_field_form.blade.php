@php
    $ar = $locale === 'ar';
    $tr = fn ($a, $e) => $ar ? $a : $e;
    $payload = $form->payload ?? [];
    $context = $payload['context'] ?? [];
    $titles = [
        'assistant_follow_up' => $tr('نموذج المتابعة الميدانية للتدريب السريري', 'Clinical Training Field Follow-up Form'),
        'department_periodic_report' => $tr('التقرير الدوري لرئيس القسم السريري', 'Clinical Department Head Periodic Report'),
        'director_supervisory_visit' => $tr('نموذج الزيارة الإشرافية للتدريب السريري', 'Clinical Training Supervisory Visit Form'),
    ];
    $assistantItems = [
        'student_attendance' => $tr('حضور الطلبة والتزامهم بالمواعيد', 'Student attendance and punctuality'),
        'supervisor_attendance' => $tr('حضور المشرف وكفاية الإشراف', 'Supervisor attendance and adequacy'),
        'active_participation' => $tr('المشاركة الفاعلة للطلبة', 'Active student participation'),
        'case_availability' => $tr('توفر الحالات وتنوعها', 'Availability and diversity of cases'),
        'schedule_adherence' => $tr('الالتزام بالخطة والجدول', 'Adherence to plan and schedule'),
        'course_alignment' => $tr('التوافق مع أهداف المساق', 'Alignment with course objectives'),
        'guidance_feedback' => $tr('التوجيه والتغذية الراجعة', 'Guidance and feedback'),
        'professional_conduct' => $tr('السلوك المهني وحقوق الطلبة', 'Professional conduct and student rights'),
        'patient_safety' => $tr('سلامة المرضى والسرية ومكافحة العدوى والموافقة', 'Patient safety, confidentiality, infection control and consent'),
        'training_environment' => $tr('بيئة التدريب والتجهيزات', 'Training environment and facilities'),
    ];
    $departmentItems = [
        'supervisor_adequacy' => $tr('كفاية عدد المشرفين', 'Adequacy of supervisors'),
        'attendance_coverage' => $tr('الحضور وتغطية جدول الإشراف', 'Attendance and supervision coverage'),
        'plan_alignment' => $tr('تطبيق خطة المساق وأهدافه', 'Course plan and objectives across sites'),
        'case_adequacy' => $tr('كفاية الحالات وتنوعها لكل طالب', 'Case adequacy and diversity per student'),
        'assessment_feedback' => $tr('التقييم والتغذية الراجعة في الوقت المناسب', 'Timely assessment and feedback'),
        'patient_safety' => $tr('سلامة المرضى والسرية ومكافحة العدوى والموافقة', 'Patient safety, confidentiality, infection control and consent'),
        'respectful_environment' => $tr('بيئة محترمة وحقوق الطلبة والشكاوى', 'Respectful environment, student rights and complaints'),
        'facilities_resources' => $tr('التجهيزات والموارد', 'Facilities and resources'),
        'hospital_coordination' => $tr('التنسيق مع المستشفى', 'Hospital coordination'),
    ];
    $overallItems = [
        'clinical_supervision' => $tr('جودة الإشراف السريري', 'Quality of clinical supervision'),
        'learning_opportunities' => $tr('الفرص السريرية والحالات', 'Learning opportunities and cases'),
        'hospital_cooperation' => $tr('تعاون المستشفى', 'Hospital cooperation'),
        'training_environment_safety' => $tr('بيئة التدريب وسلامة المرضى', 'Training environment and patient safety'),
    ];
    $ratingLabels = [
        'yes' => $tr('نعم', 'Yes'), 'partial' => $tr('جزئيًا', 'Partly'), 'no' => $tr('لا', 'No'),
        'not_verified' => $tr('لم يتم التحقق', 'Not verified'), 'not_applicable' => $tr('لا ينطبق', 'Not applicable'),
        'satisfactory' => $tr('مُرضٍ', 'Satisfactory'), 'needs_improvement' => $tr('بحاجة لتحسين', 'Needs improvement'),
        'unsatisfactory' => $tr('غير مُرضٍ', 'Unsatisfactory'), 'not_assessed' => $tr('لم يُقيّم', 'Not assessed'),
        'good' => $tr('جيد', 'Good'), 'acceptable' => $tr('مقبول', 'Acceptable'), 'poor' => $tr('ضعيف', 'Poor'),
        'direct' => $tr('زيارة مباشرة', 'Direct observation'), 'reports' => $tr('تقارير', 'Reports'),
    ];
    $value = fn ($v) => is_bool($v) ? ($v ? $tr('نعم', 'Yes') : $tr('لا', 'No')) : ($v ?: '—');
@endphp
<!doctype html>
<html lang="{{ $locale }}" dir="{{ $ar ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <style>
        @page { margin: 26px 30px; }
        body { font-family: DejaVu Sans, sans-serif; color:#172033; font-size:10px; line-height:1.55; direction:{{ $ar ? 'rtl' : 'ltr' }}; }
        h1 { text-align:center; font-size:16px; margin:0 0 4px; }
        h2 { font-size:12px; color:#0f766e; margin:17px 0 7px; }
        p { margin:3px 0; }
        .sub { text-align:center; color:#526176; margin-bottom:14px; }
        .urgent { color:#b91c1c; font-weight:bold; }
        table { width:100%; border-collapse:collapse; margin:7px 0 12px; }
        th, td { border:1px solid #d9d9d9; padding:6px; vertical-align:middle; text-align:{{ $ar ? 'right' : 'left' }}; }
        th { background:#dff5f2; color:#134e4a; font-weight:bold; }
        .short { width:18%; text-align:center; }
        .meta td:first-child, .meta td:nth-child(3) { font-weight:bold; background:#f5f7f9; width:18%; }
        .footer { margin-top:25px; border-top:1px solid #94a3b8; padding-top:6px; color:#64748b; font-size:8px; }
    </style>
</head>
<body>
<h1>{{ $tr('جامعة الخليل كلية الطب البشري', 'Hebron University Faculty of Medicine') }}</h1>
<h1>{{ $titles[$form->type] }}</h1>
<p class="sub">{{ $form->reference_number }} · {{ $tr('الإصدار', 'Revision') }} {{ $form->revision }}</p>

<table class="meta">
    <tr><td>{{ $tr('أعد بواسطة', 'Prepared by') }}</td><td>{{ $form->creator?->name }}</td><td>{{ $tr('مرفوع إلى', 'Submitted to') }}</td><td>{{ $form->recipient?->name }}</td></tr>
    <tr><td>{{ $tr('الحالة', 'Status') }}</td><td>{{ $form->status }}</td><td>{{ $tr('التاريخ', 'Date') }}</td><td>{{ optional($form->activity_date)->format('Y-m-d') ?: optional($form->created_at)->format('Y-m-d') }}</td></tr>
    <tr><td>{{ $tr('المستشفى', 'Hospital') }}</td><td>{{ $ar ? $form->trainingSite?->name_ar : ($form->trainingSite?->name_en ?: $form->trainingSite?->name_ar) }}</td><td>{{ $tr('القسم', 'Department') }}</td><td>{{ $ar ? $form->department?->name_ar : ($form->department?->name_en ?: $form->department?->name_ar) }}</td></tr>
</table>
@if($form->is_urgent)<p class="urgent">{{ $tr('هذا النموذج يتضمن حالة عاجلة تستلزم المتابعة.', 'This form contains an urgent matter requiring follow-up.') }}</p>@endif

@if($form->type === 'assistant_follow_up')
    <h2>{{ $tr('معلومات الزيارة', 'Visit information') }}</h2>
    <table class="meta">
        <tr><td>{{ $tr('التخصص', 'Specialty') }}</td><td>{{ $value($context['clinical_specialty'] ?? null) }}</td><td>{{ $tr('المساق أو الدورة', 'Course or rotation') }}</td><td>{{ $value($context['rotation_name'] ?? null) }}</td></tr>
        <tr><td>{{ $tr('المشرف السريري', 'Clinical supervisor') }}</td><td>{{ $value($context['clinical_supervisor'] ?? null) }}</td><td>{{ $tr('مجموعة الطلبة', 'Student group') }}</td><td>{{ $value($context['student_group'] ?? null) }}</td></tr>
        @if(($context['attendance_source'] ?? null) === 'schedule')
            <tr><td>{{ $tr('عدد الطلبة المجدولين', 'Scheduled students') }}</td><td>{{ $value($context['scheduled_students'] ?? null) }}</td><td>{{ $tr('مصدر البيانات', 'Data source') }}</td><td>{{ $tr('جدول التدريب السريري المنشور', 'Published clinical schedule') }}</td></tr>
        @else
            <tr><td>{{ $tr('الحاضرون', 'Present') }}</td><td>{{ $value($context['students_present'] ?? null) }}</td><td>{{ $tr('الغائبون', 'Absent') }}</td><td>{{ $value($context['students_absent'] ?? null) }}</td></tr>
        @endif
    </table>
    <h2>{{ $tr('قائمة التحقق', 'Monitoring checklist') }}</h2>
    <table><tr><th>{{ $tr('البند', 'Item') }}</th><th class="short">{{ $tr('التقييم', 'Assessment') }}</th><th>{{ $tr('الملاحظة', 'Comment') }}</th></tr>
    @foreach($assistantItems as $code => $label)<tr><td>{{ $label }}</td><td class="short">{{ $ratingLabels[data_get($payload, "responses.$code.rating")] ?? '—' }}</td><td>{{ $value(data_get($payload, "responses.$code.comment")) }}</td></tr>@endforeach
    </table>
@elseif($form->type === 'department_periodic_report')
    <h2>{{ $tr('بيانات الفترة', 'Reporting period') }}</h2>
    <table class="meta"><tr><td>{{ $tr('من', 'From') }}</td><td>{{ optional($form->period_from)->format('Y-m-d') }}</td><td>{{ $tr('إلى', 'To') }}</td><td>{{ optional($form->period_to)->format('Y-m-d') }}</td></tr>
        <tr><td>{{ $tr('رئيس القسم', 'Department head') }}</td><td>{{ $value($context['department_head'] ?? null) }}</td><td>{{ $tr('الطلبة والمشرفون', 'Students and supervisors') }}</td><td>{{ $value($context['student_count'] ?? null) }} / {{ $value($context['supervisor_count'] ?? null) }}</td></tr>
        <tr><td>{{ $tr('مواقع التدريب', 'Training sites') }}</td><td>{{ $value($context['training_sites'] ?? null) }}</td><td>{{ $tr('المساقات أو الدورات', 'Courses or rotations') }}</td><td>{{ $value($context['courses_rotations'] ?? null) }}</td></tr></table>
    <h2>{{ $tr('تقييم الفترة', 'Period assessment') }}</h2>
    <table><tr><th>{{ $tr('البند', 'Item') }}</th><th class="short">{{ $tr('التقييم', 'Assessment') }}</th><th>{{ $tr('الملاحظة', 'Comment') }}</th></tr>
    @foreach($departmentItems as $code => $label)<tr><td>{{ $label }}</td><td class="short">{{ $ratingLabels[data_get($payload, "responses.$code.rating")] ?? '—' }}</td><td>{{ $value(data_get($payload, "responses.$code.comment")) }}</td></tr>@endforeach
    </table>
@else
    <h2>{{ $tr('معلومات الزيارة', 'Visit information') }}</h2>
    <table class="meta"><tr><td>{{ $tr('نوع الزيارة', 'Visit type') }}</td><td>{{ $value($context['visit_type'] ?? null) }}</td><td>{{ $tr('ممثلو المستشفى', 'Hospital representatives') }}</td><td>{{ $value($context['representatives'] ?? null) }}</td></tr>
        @if(isset($context['scheduled_groups']))<tr><td>{{ $tr('المجموعات والطلبة', 'Groups and students') }}</td><td>{{ $value($context['scheduled_groups']) }} / {{ $value($context['scheduled_students'] ?? null) }}</td><td>{{ $tr('المشرفون', 'Supervisors') }}</td><td>{{ $value($context['scheduled_supervisors'] ?? null) }}</td></tr>@endif</table>
    <h2>{{ $tr('تقييم التخصصات', 'Clinical specialties') }}</h2>
    <table><tr><th>{{ $tr('التخصص', 'Specialty') }}</th><th>{{ $tr('التقييم', 'Assessment') }}</th><th>{{ $tr('أساس التقييم', 'Basis') }}</th><th>{{ $tr('ملاحظات', 'Notes') }}</th></tr>
    @foreach(($payload['specialties'] ?? []) as $item)<tr><td>{{ $ar ? ($item['name_ar'] ?? $item['name'] ?? '—') : ($item['name_en'] ?? $item['name'] ?? $item['name_ar'] ?? '—') }}</td><td>{{ $ratingLabels[$item['rating'] ?? ''] ?? '—' }}</td><td>{{ $ratingLabels[$item['basis'] ?? ''] ?? '—' }}</td><td>{{ $value($item['notes'] ?? null) }}</td></tr>@endforeach</table>
    <h2>{{ $tr('التقييم العام للمستشفى', 'Overall hospital assessment') }}</h2>
    <table><tr><th>{{ $tr('البند', 'Item') }}</th><th class="short">{{ $tr('التقييم', 'Assessment') }}</th><th>{{ $tr('الملاحظة', 'Comment') }}</th></tr>
    @foreach($overallItems as $code => $label)<tr><td>{{ $label }}</td><td class="short">{{ $ratingLabels[data_get($payload, "overall.$code.rating")] ?? '—' }}</td><td>{{ $value(data_get($payload, "overall.$code.comment")) }}</td></tr>@endforeach</table>
@endif

<h2>{{ $tr('الخلاصة والإجراءات', 'Summary and actions') }}</h2>
@foreach(['observations' => $tr('الملاحظات', 'Observations'), 'strengths' => $tr('نقاط القوة', 'Strengths'), 'challenges' => $tr('التحديات', 'Challenges'), 'summary' => $tr('الخلاصة', 'Summary'), 'proposed_action' => $tr('الإجراء المقترح', 'Proposed action'), 'support_requested' => $tr('الدعم أو القرار المطلوب', 'Support or decision requested'), 'required_actions' => $tr('الإجراءات المطلوبة', 'Required actions'), 'dean_intervention' => $tr('تدخل العميد المطلوب', 'Dean intervention required')] as $key => $label)
    @if(!empty($payload[$key]))<p><strong>{{ $label }}:</strong> {{ $payload[$key] }}</p>@endif
@endforeach

@php $actions = $payload['improvements'] ?? $payload['actions'] ?? []; @endphp
@if(count($actions))
<table><tr><th>{{ $tr('المجال', 'Area') }}</th><th>{{ $tr('التحسين', 'Improvement') }}</th><th>{{ $tr('الإجراء', 'Action') }}</th><th>{{ $tr('المسؤول والموعد', 'Responsible and deadline') }}</th><th>{{ $tr('الأولوية', 'Priority') }}</th></tr>
@foreach($actions as $action)<tr><td>{{ $action['area'] ?? '—' }}</td><td>{{ $action['improvement'] ?? '—' }}</td><td>{{ $action['action'] ?? '—' }}</td><td>{{ ($action['responsible'] ?? '—').' · '.($action['deadline'] ?? '—') }}</td><td>{{ $action['priority'] ?? '—' }}</td></tr>@endforeach</table>
@endif

@if($form->is_urgent)
<h2 class="urgent">{{ $tr('توثيق الحالة العاجلة', 'Urgent case record') }}</h2>
<p><strong>{{ $tr('التفاصيل', 'Details') }}:</strong> {{ data_get($payload, 'urgent.details', '—') }}</p>
<p><strong>{{ $tr('الإجراء الفوري', 'Immediate action') }}:</strong> {{ data_get($payload, 'urgent.action_taken', '—') }}</p>
<p><strong>{{ $tr('وقت التبليغ', 'Notification time') }}:</strong> {{ data_get($payload, 'urgent.notified_at', '—') }}</p>
@endif

<div class="footer">{{ $tr('سجل إلكتروني صادر عن نظام إدارة الدائرة السريرية', 'Electronic record generated by the Clinical Department Management System') }} · {{ now()->format('Y-m-d H:i') }}</div>
</body>
</html>
