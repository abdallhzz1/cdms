@php
    $ar = $locale === 'ar';
    $arabic = new \ArPHP\I18N\Arabic();
    $shape = function ($text) use ($arabic) {
        $text = (string) $text;

        return preg_match('/\p{Arabic}/u', $text)
            ? $arabic->utf8Glyphs($text, 10000, false, false)
            : $text;
    };
    $tr = fn ($a, $e) => $ar ? $shape($a) : $e;
    $ordered = fn (array $cells) => $ar ? array_reverse($cells) : $cells;
    $fontUrl = fn (string $path) => 'file:///'.ltrim(str_replace('\\', '/', $path), '/');
    $fontRegular = $fontUrl(resource_path('fonts/amiri/Amiri-Regular.ttf'));
    $fontBold = $fontUrl(resource_path('fonts/amiri/Amiri-Bold.ttf'));
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
    $value = function ($v) use ($tr, $shape) {
        if (is_bool($v)) {
            return $v ? $tr('نعم', 'Yes') : $tr('لا', 'No');
        }
        if (is_array($v)) {
            $v = collect($v)->flatten()->filter(fn ($item) => is_scalar($item) && trim((string) $item) !== '')->join('، ');
        }

        return $v === null || trim((string) $v) === '' ? '-' : $shape((string) $v);
    };
    $statusLabels = [
        'draft' => $tr('مسودة', 'Draft'), 'submitted' => $tr('مرسل', 'Submitted'),
        'acknowledged' => $tr('تم الاستلام', 'Acknowledged'), 'action_required' => $tr('يتطلب إجراء', 'Action required'),
        'returned_for_revision' => $tr('معاد للتعديل', 'Returned for revision'), 'completed' => $tr('مكتمل', 'Completed'),
    ];
@endphp
<!doctype html>
<html lang="{{ $locale }}" dir="{{ $ar ? 'rtl' : 'ltr' }}">
<head>
    <meta charset="utf-8">
    <style>
        @font-face { font-family:"Amiri"; font-style:normal; font-weight:400; src:url("{{ $fontRegular }}") format("truetype"); }
        @font-face { font-family:"Amiri"; font-style:normal; font-weight:700; src:url("{{ $fontBold }}") format("truetype"); }
        @page { margin: 22mm 16mm 18mm; }
        html, body { font-family:"Amiri", "DejaVu Sans", sans-serif; }
        body { color:#000; font-size:11px; line-height:1.55; direction:{{ $ar ? 'rtl' : 'ltr' }}; }
        h1 { text-align:center; font-size:17px; margin:0 0 5px; font-weight:700; }
        h2 { font-size:13px; margin:16px 0 6px; padding-bottom:3px; border-bottom:1px solid #000; page-break-after:avoid; }
        p { margin:4px 0; }
        .sub { text-align:center; margin:0 0 14px; font-size:9px; }
        .urgent { font-weight:bold; border:1px solid #000; padding:6px; }
        table { width:100%; border-collapse:collapse; margin:6px 0 12px; direction:ltr; table-layout:fixed; }
        tr { page-break-inside:avoid; }
        th, td { border:1px solid #000; padding:5px 6px; vertical-align:top; direction:{{ $ar ? 'rtl' : 'ltr' }}; text-align:{{ $ar ? 'right' : 'left' }}; overflow-wrap:break-word; }
        th { font-weight:bold; background:#eee; }
        .short { width:18%; text-align:center; }
        .meta .label { font-weight:bold; width:18%; background:#f5f5f5; }
        .footer { margin-top:22px; border-top:1px solid #000; padding-top:5px; font-size:8px; }
        .ltr { direction:ltr; text-align:left; unicode-bidi:embed; }
        .rtl { direction:rtl; text-align:right; unicode-bidi:embed; }
        .roster-appendix { page-break-before:always; }
        .roster-names { line-height:1.8; }
    </style>
</head>
<body>
<h1>{{ $tr('جامعة الخليل كلية الطب البشري', 'Hebron University Faculty of Medicine') }}</h1>
<h1>{{ $titles[$form->type] ?? $tr('نموذج متابعة سريرية', 'Clinical Monitoring Form') }}</h1>
<p class="sub ltr">{{ $form->reference_number }} | R{{ $form->revision }}</p>

<table class="meta">
    <tr>@foreach($ordered([
        ['class'=>'label','text'=>$tr('أعد بواسطة', 'Prepared by')], ['class'=>'','text'=>$value($form->creator?->name)],
        ['class'=>'label','text'=>$tr('مرفوع إلى', 'Submitted to')], ['class'=>'','text'=>$form->type === 'director_supervisory_visit' ? $tr('عمادة كلية الطب - العميد ونائب العميد', 'Faculty of Medicine Deanship - Dean and Vice Dean') : $value($form->recipient?->name)],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
    <tr>@foreach($ordered([
        ['class'=>'label','text'=>$tr('الحالة', 'Status')], ['class'=>'','text'=>$statusLabels[$form->status] ?? $form->status],
        ['class'=>'label','text'=>$tr('التاريخ', 'Date')], ['class'=>'ltr','text'=>optional($form->activity_date)->format('Y-m-d') ?: optional($form->created_at)->format('Y-m-d')],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
    <tr>@foreach($ordered([
        ['class'=>'label','text'=>$tr('المستشفى', 'Hospital')], ['class'=>'','text'=>$value($ar ? $form->trainingSite?->name_ar : ($form->trainingSite?->name_en ?: $form->trainingSite?->name_ar))],
        ['class'=>'label','text'=>$tr('القسم', 'Department')], ['class'=>'','text'=>$value($ar ? $form->department?->name_ar : ($form->department?->name_en ?: $form->department?->name_ar))],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
</table>
@if($form->is_urgent)<p class="urgent">{{ $tr('هذا النموذج يتضمن حالة عاجلة تستلزم المتابعة.', 'This form contains an urgent matter requiring follow-up.') }}</p>@endif

@if($form->type === 'assistant_follow_up')
    <h2>{{ $tr('معلومات الزيارة', 'Visit information') }}</h2>
    <table class="meta">
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('التخصص', 'Specialty')], ['class'=>'','text'=>$value($context['clinical_specialty'] ?? null)],
            ['class'=>'label','text'=>$tr('المساق أو الدورة', 'Course or rotation')], ['class'=>'','text'=>$value($context['rotation_name'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('المشرف السريري', 'Clinical supervisor')], ['class'=>'','text'=>$value($context['clinical_supervisor'] ?? null)],
            ['class'=>'label','text'=>$tr('مجموعة الطلبة', 'Student group')], ['class'=>'','text'=>$value($context['student_group'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        @if(($context['attendance_source'] ?? null) === 'schedule')
            <tr>@foreach($ordered([
                ['class'=>'label','text'=>$tr('عدد الطلبة المجدولين', 'Scheduled students')], ['class'=>'','text'=>$value($context['scheduled_students'] ?? null)],
                ['class'=>'label','text'=>$tr('مصدر البيانات', 'Data source')], ['class'=>'','text'=>$tr('جدول التدريب السريري المنشور', 'Published clinical schedule')],
            ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        @else
            <tr>@foreach($ordered([
                ['class'=>'label','text'=>$tr('الحاضرون', 'Present')], ['class'=>'','text'=>$value($context['students_present'] ?? null)],
                ['class'=>'label','text'=>$tr('الغائبون', 'Absent')], ['class'=>'','text'=>$value($context['students_absent'] ?? null)],
            ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        @endif
    </table>
    @if(!empty($context['schedule_groups']))
        <h2>{{ $tr('المجموعات التي تمت زيارتها', 'Visited groups') }}</h2>
        <table><tr>@foreach($ordered([
            ['class'=>'','text'=>$tr('المجموعة', 'Group')], ['class'=>'','text'=>$tr('المساق', 'Course')],
            ['class'=>'','text'=>$tr('المشرف', 'Supervisor')], ['class'=>'short','text'=>$tr('الطلبة', 'Students')],
        ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
        @foreach($context['schedule_groups'] as $group)<tr>@foreach($ordered([
            ['class'=>'','text'=>$value($group['subgroup'] ?? $group['group'] ?? null)], ['class'=>'','text'=>$value($group['course'] ?? null)],
            ['class'=>'','text'=>$value($group['supervisors'] ?? [])], ['class'=>'short','text'=>$value($group['student_count'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach</table>
    @endif
    <h2>{{ $tr('قائمة التحقق', 'Monitoring checklist') }}</h2>
    <table><tr>@foreach($ordered([
        ['class'=>'','text'=>$tr('البند', 'Item')], ['class'=>'short','text'=>$tr('التقييم', 'Assessment')], ['class'=>'','text'=>$tr('الملاحظة', 'Comment')],
    ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
    @foreach($assistantItems as $code => $label)<tr>@foreach($ordered([
        ['class'=>'','text'=>$label], ['class'=>'short','text'=>$ratingLabels[data_get($payload, "responses.$code.rating")] ?? '-'], ['class'=>'','text'=>$value(data_get($payload, "responses.$code.comment"))],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach
    </table>
    @php
        $groupsWithStudents = collect($context['schedule_groups'] ?? [])->filter(fn ($group) => !empty($group['students']))->values();
    @endphp
    @if($groupsWithStudents->isNotEmpty())
        <section class="roster-appendix">
            <h2>{{ $tr('ملحق أسماء الطلبة حسب المجموعة', 'Appendix: Student names by group') }}</h2>
            <p>{{ $tr('قائمة مرجعية من الجدول السريري المنشور، مفصولة عن نموذج المتابعة.', 'Reference list from the published clinical schedule, kept separate from the follow-up form.') }}</p>
            <table>
                <tr>@foreach($ordered([
                    ['class'=>'','text'=>$tr('المجموعة', 'Group')],
                    ['class'=>'','text'=>$tr('أسماء الطلبة', 'Student names')],
                ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
                @foreach($groupsWithStudents as $group)
                    @php
                        $groupStudents = collect($group['students'])->map(function ($student) use ($ar) {
                            return $student[$ar ? 'name_ar' : 'name_en'] ?? $student['name_ar'] ?? '';
                        })->filter()->values();
                    @endphp
                    <tr>@foreach($ordered([
                        ['class'=>'','text'=>$value($group['subgroup'] ?? $group['group'] ?? null)],
                        ['class'=>'roster-names','text'=>$groupStudents->map(fn ($name, $index) => ($index + 1).'. '.$name)->join($ar ? '    ' : '    ')],
                    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
                @endforeach
            </table>
        </section>
    @endif
@elseif($form->type === 'department_periodic_report')
    <h2>{{ $tr('بيانات الفترة', 'Reporting period') }}</h2>
    <table class="meta">
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('من', 'From')], ['class'=>'ltr','text'=>optional($form->period_from)->format('Y-m-d')],
            ['class'=>'label','text'=>$tr('إلى', 'To')], ['class'=>'ltr','text'=>optional($form->period_to)->format('Y-m-d')],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('رئيس القسم', 'Department head')], ['class'=>'','text'=>$value($context['department_head'] ?? null)],
            ['class'=>'label','text'=>$tr('الطلبة والمشرفون', 'Students and supervisors')], ['class'=>'','text'=>$value($context['student_count'] ?? null).' / '.$value($context['supervisor_count'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('مواقع التدريب', 'Training sites')], ['class'=>'','text'=>$value($context['training_sites'] ?? null)],
            ['class'=>'label','text'=>$tr('المساقات أو الدورات', 'Courses or rotations')], ['class'=>'','text'=>$value($context['courses_rotations'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
    </table>
    <h2>{{ $tr('تقييم الفترة', 'Period assessment') }}</h2>
    <table><tr>@foreach($ordered([
        ['class'=>'','text'=>$tr('البند', 'Item')], ['class'=>'short','text'=>$tr('التقييم', 'Assessment')], ['class'=>'','text'=>$tr('الملاحظة', 'Comment')],
    ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
    @foreach($departmentItems as $code => $label)<tr>@foreach($ordered([
        ['class'=>'','text'=>$label], ['class'=>'short','text'=>$ratingLabels[data_get($payload, "responses.$code.rating")] ?? '-'], ['class'=>'','text'=>$value(data_get($payload, "responses.$code.comment"))],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach
    </table>
@else
    <h2>{{ $tr('معلومات الزيارة', 'Visit information') }}</h2>
    <table class="meta">
        <tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('نوع الزيارة', 'Visit type')], ['class'=>'','text'=>$value($context['visit_type'] ?? null)],
            ['class'=>'label','text'=>$tr('ممثلو المستشفى', 'Hospital representatives')], ['class'=>'','text'=>$value($context['representatives'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>
        @if(isset($context['scheduled_groups']))<tr>@foreach($ordered([
            ['class'=>'label','text'=>$tr('المجموعات والطلبة', 'Groups and students')], ['class'=>'','text'=>$value($context['scheduled_groups']).' / '.$value($context['scheduled_students'] ?? null)],
            ['class'=>'label','text'=>$tr('المشرفون', 'Supervisors')], ['class'=>'','text'=>$value($context['scheduled_supervisors'] ?? null)],
        ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endif
    </table>
    <h2>{{ $tr('تقييم التخصصات', 'Clinical specialties') }}</h2>
    <table><tr>@foreach($ordered([
        ['class'=>'','text'=>$tr('التخصص', 'Specialty')], ['class'=>'','text'=>$tr('التقييم', 'Assessment')],
        ['class'=>'','text'=>$tr('أساس التقييم', 'Basis')], ['class'=>'','text'=>$tr('ملاحظات', 'Notes')],
    ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
    @foreach(($payload['specialties'] ?? []) as $item)<tr>@foreach($ordered([
        ['class'=>'','text'=>$value($ar ? ($item['name_ar'] ?? $item['name'] ?? '-') : ($item['name_en'] ?? $item['name'] ?? $item['name_ar'] ?? '-'))],
        ['class'=>'','text'=>$ratingLabels[$item['rating'] ?? ''] ?? '-'], ['class'=>'','text'=>$ratingLabels[$item['basis'] ?? ''] ?? '-'], ['class'=>'','text'=>$value($item['notes'] ?? null)],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach</table>
    <h2>{{ $tr('التقييم العام للمستشفى', 'Overall hospital assessment') }}</h2>
    <table><tr>@foreach($ordered([
        ['class'=>'','text'=>$tr('البند', 'Item')], ['class'=>'short','text'=>$tr('التقييم', 'Assessment')], ['class'=>'','text'=>$tr('الملاحظة', 'Comment')],
    ]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
    @foreach($overallItems as $code => $label)<tr>@foreach($ordered([
        ['class'=>'','text'=>$label], ['class'=>'short','text'=>$ratingLabels[data_get($payload, "overall.$code.rating")] ?? '-'], ['class'=>'','text'=>$value(data_get($payload, "overall.$code.comment"))],
    ]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach</table>
@endif

<h2>{{ $tr('الخلاصة والإجراءات', 'Summary and actions') }}</h2>
@foreach(['observations' => $tr('الملاحظات', 'Observations'), 'strengths' => $tr('نقاط القوة', 'Strengths'), 'challenges' => $tr('التحديات', 'Challenges'), 'summary' => $tr('الخلاصة', 'Summary'), 'proposed_action' => $tr('الإجراء المقترح', 'Proposed action'), 'support_requested' => $tr('الدعم أو القرار المطلوب', 'Support or decision requested'), 'required_actions' => $tr('الإجراءات المطلوبة', 'Required actions'), 'dean_intervention' => $tr('تدخل العميد المطلوب', 'Dean intervention required')] as $key => $label)
    @if(!empty($payload[$key]))<p><strong>{{ $label }}:</strong> {{ $value($payload[$key]) }}</p>@endif
@endforeach

@php
    $actionSource = $payload['actions'] ?? $payload['improvements'] ?? [];
    $actions = collect(is_array($actionSource) ? $actionSource : [])->filter(fn ($item) => is_array($item));
@endphp
@if($actions->isNotEmpty())
<table><tr>@foreach($ordered([
    ['class'=>'','text'=>$tr('المجال', 'Area')], ['class'=>'','text'=>$tr('التحسين', 'Improvement')], ['class'=>'','text'=>$tr('الإجراء', 'Action')],
    ['class'=>'','text'=>$tr('المسؤول والموعد', 'Responsible and deadline')], ['class'=>'','text'=>$tr('الأولوية', 'Priority')],
]) as $cell)<th class="{{ $cell['class'] }}">{{ $cell['text'] }}</th>@endforeach</tr>
@foreach($actions as $action)<tr>@foreach($ordered([
    ['class'=>'','text'=>$value($action['area'] ?? null)], ['class'=>'','text'=>$value($action['improvement'] ?? null)], ['class'=>'','text'=>$value($action['action'] ?? null)],
    ['class'=>'','text'=>$value(($action['responsible'] ?? '-').' | '.($action['deadline'] ?? '-'))], ['class'=>'','text'=>$value($action['priority'] ?? null)],
]) as $cell)<td class="{{ $cell['class'] }}">{{ $cell['text'] }}</td>@endforeach</tr>@endforeach</table>
@endif

@if($form->is_urgent)
<h2 class="urgent">{{ $tr('توثيق الحالة العاجلة', 'Urgent case record') }}</h2>
<p><strong>{{ $tr('التفاصيل', 'Details') }}:</strong> {{ $value(data_get($payload, 'urgent.details')) }}</p>
<p><strong>{{ $tr('الإجراء الفوري', 'Immediate action') }}:</strong> {{ $value(data_get($payload, 'urgent.action_taken')) }}</p>
<p><strong>{{ $tr('وقت التبليغ', 'Notification time') }}:</strong> {{ $value(data_get($payload, 'urgent.notified_at')) }}</p>
@endif

<div class="footer">{{ $tr('سجل إلكتروني صادر عن نظام إدارة الدائرة السريرية', 'Electronic record generated by the Clinical Department Management System') }} · {{ now()->format('Y-m-d H:i') }}</div>
</body>
</html>
