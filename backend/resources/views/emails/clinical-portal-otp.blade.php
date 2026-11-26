<!doctype html>
<html lang="{{ app()->getLocale() }}" dir="{{ app()->getLocale() === 'ar' ? 'rtl' : 'ltr' }}">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#172033;padding:24px;line-height:1.8">
<p>{{ __('clinical_feedback.otp_intro') }}</p>
<p dir="ltr" style="font-size:28px;font-weight:bold;letter-spacing:4px">{{ $otp }}</p>
<p>{{ __('clinical_feedback.otp_expiry') }}</p>
</body>
</html>
