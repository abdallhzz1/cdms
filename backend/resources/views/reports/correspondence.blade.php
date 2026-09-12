<!doctype html>
<html lang="{{ $locale }}" dir="{{ $locale === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"><style>
@page{margin:34px} body{font-family:'DejaVu Sans',sans-serif;color:#1e293b;font-size:11px}.head{border-bottom:3px solid #0f766e;padding-bottom:14px;margin-bottom:18px}.brand{font-size:18px;font-weight:bold;color:#134e4a}.sub{color:#64748b;margin-top:4px}.ref{float:{{ $locale === 'ar' ? 'left' : 'right' }};direction:ltr;background:#f0fdfa;padding:8px 12px;border:1px solid #99f6e4}.subject{font-size:17px;font-weight:bold;margin:18px 0 8px}.meta{width:100%;border-collapse:collapse;margin-bottom:16px}.meta td{padding:7px;border-bottom:1px solid #e2e8f0}.label{color:#64748b;width:22%}.body{white-space:pre-wrap;line-height:2;border:1px solid #e2e8f0;border-radius:8px;padding:14px}.message{margin-top:12px;padding:12px;border-inline-start:3px solid #14b8a6;background:#f8fafc}.footer{position:fixed;bottom:0;left:0;right:0;border-top:1px solid #cbd5e1;padding-top:7px;color:#64748b;font-size:9px}.page:after{content:counter(page)}
</style></head><body>
@php
$name = fn($u) => $locale === 'ar' ? ($u?->person?->full_name_ar ?: $u?->name) : ($u?->person?->full_name_en ?: $u?->name);
$text = fn($value) => $locale === 'ar' ? \App\Support\ArabicPdfText::visual($value) : $value;
$html = fn($value) => $locale === 'ar' ? \App\Support\ArabicPdfText::html($value) : $value;
$to = $item->participants->where('participant_role','to')->map(fn($p) => $name($p->user))->filter()->join('، ');
$cc = $item->participants->where('participant_role','cc')->map(fn($p) => $name($p->user))->filter()->join('، ');
$bcc = $item->participants->where('participant_role','fyi')->map(fn($p) => $name($p->user))->filter()->join('، ');
@endphp
<div class="head"><div class="ref">{{ $item->reference_number }}</div><div class="brand">{{ $text($locale === 'ar' ? 'جامعة الخليل — البريد الداخلي' : 'Hebron University — Internal Mail') }}</div><div class="sub">{{ $text($locale === 'ar' ? 'كلية الطب · الدائرة السريرية' : 'Faculty of Medicine · Clinical Department') }}</div></div>
<div class="subject">{{ $text($item->subject) }}</div>
<table class="meta"><tr><td class="label">{{ $text($locale === 'ar' ? 'من' : 'From') }}</td><td>{{ $text($name($item->sender)) }}</td></tr><tr><td class="label">{{ $text($locale === 'ar' ? 'إلى' : 'To') }}</td><td>{{ $text($to ?: '—') }}</td></tr>@if($cc)<tr><td class="label">CC</td><td>{{ $text($cc) }}</td></tr>@endif @if($bcc)<tr><td class="label">BCC</td><td>{{ $text($bcc) }}</td></tr>@endif<tr><td class="label">{{ $text($locale === 'ar' ? 'التاريخ' : 'Date') }}</td><td dir="ltr">{{ optional($item->submitted_at)->format('Y/m/d H:i') }}</td></tr></table>
<div class="body">{!! $html($item->summary ?: '—') !!}</div>
@foreach($item->messages as $message)<div class="message"><strong>{{ $text($name($message->sender)) }}</strong> · <span dir="ltr">{{ $message->created_at->format('Y/m/d H:i') }}</span><br><br>{!! $html($message->body) !!}</div>@endforeach
<div class="footer"><span>{{ $text($locale === 'ar' ? 'وثيقة مولدة من النظام — رمز التحقق:' : 'System-generated document — verification code:') }} {{ strtoupper(substr(hash('sha256', $item->reference_number.'|'.$item->created_at), 0, 12)) }}</span><span style="float:{{ $locale === 'ar' ? 'left' : 'right' }}">{{ $text($locale === 'ar' ? 'صفحة' : 'Page') }} <span class="page"></span></span></div>
</body></html>
