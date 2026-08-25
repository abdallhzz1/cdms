import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useI18n, type TranslationKey } from '@/i18n/I18nContext';
import { useZodForm } from '@/lib/form/useZodForm';
import { loginSchema, type LoginFormValues } from '@/auth/loginSchema';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/api/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { Mail, Lock, AlertCircle, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react';
import hebronLogo from '@/assets/hebron.png';

export function LoginPage() {
  const { t, locale } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useZodForm(loginSchema);

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null);
    try {
      await login(values.email, values.password);
      navigate('/', { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        setFormError(error.status === 401
          ? (locale === 'ar' ? 'تعذر إنشاء جلسة دخول آمنة. امسح بيانات الموقع ثم أعد المحاولة.' : 'A secure login session could not be established. Clear this site’s data and try again.')
          : t('auth.invalidCredentials'));
      } else {
        setFormError(t('auth.unknownError'));
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#edf2f7] bg-[radial-gradient(#cbd5e1_1.2px,transparent_1.2px)] [background-size:24px_24px] px-4 py-10 relative overflow-hidden">
      {/* Rich Ambient Glowing Background Orbs */}
      <div className="absolute -top-24 -right-24 w-[450px] sm:w-[550px] h-[450px] sm:h-[550px] bg-teal-400/20 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-[450px] sm:w-[550px] h-[450px] sm:h-[550px] bg-emerald-400/15 rounded-full blur-[110px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] sm:w-[750px] h-[550px] sm:h-[750px] bg-teal-200/10 rounded-full blur-[140px] pointer-events-none" />

      {/* Floating Centered Card Container */}
      <div className="w-full max-w-md relative z-10">
        <div className="bg-white rounded-3xl p-7 sm:p-9 shadow-2xl border border-slate-100 space-y-6">
          
          {/* Top Bar: Brand Logo & Language Switcher */}
          <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div className="flex items-center gap-3 min-w-0">
              <img 
                src={hebronLogo} 
                alt={locale === 'ar' ? 'جامعة الخليل' : 'Hebron University'} 
                className="h-11 w-11 object-contain shrink-0 drop-shadow-xs" 
              />
              <div className="min-w-0">
                <div className="text-xs sm:text-sm font-bold text-slate-800 leading-tight truncate">
                  {locale === 'ar' ? 'جامعة الخليل' : 'Hebron University'}
                </div>
                <div className="text-[11px] sm:text-xs font-semibold text-teal-600 truncate mt-0.5">
                  {locale === 'ar' ? 'كلية الطب والعلوم الصحية' : 'Faculty of Medicine & Health Sciences'}
                </div>
              </div>
            </div>

            <LanguageSwitcher />
          </div>

          {/* Title & Subtitle */}
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-black text-slate-800 tracking-tight">
              {t('auth.title')}
            </h1>
            <p className="text-xs text-slate-500 font-medium leading-relaxed">
              {locale === 'ar' 
                ? 'بوابة تسجيل الدخول لنظام إدارة الدائرة السريرية (CDMS)' 
                : 'Clinical Department Management System (CDMS) Portal'}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
            {/* Email Field */}
            <div className="space-y-1.5">
              <label htmlFor="email" className="block text-xs font-bold text-slate-700">
                {t('auth.emailLabel')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 rtl:right-0 rtl:left-auto ltr:left-0 ltr:right-auto flex items-center px-3.5 pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  placeholder="example@hebron.edu"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 py-3 px-4 rtl:pr-10 ltr:pl-10 text-sm text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(errors.email.message as TranslationKey)}</span>
                </p>
              )}
            </div>

            {/* Password Field */}
            <div className="space-y-1.5">
              <label htmlFor="password" className="block text-xs font-bold text-slate-700">
                {t('auth.passwordLabel')}
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 right-0 rtl:right-0 rtl:left-auto ltr:left-0 ltr:right-auto flex items-center px-3.5 pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50/60 py-3 px-4 rtl:pr-10 ltr:pl-10 text-sm text-slate-800 focus:bg-white focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all"
                  {...register('password')}
                />
              </div>
              {errors.password && (
                <p className="text-xs font-semibold text-red-600 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>{t(errors.password.message as TranslationKey)}</span>
                </p>
              )}
            </div>

            {/* Form Error Alert */}
            {formError && (
              <div role="alert" className="p-3.5 rounded-2xl bg-red-50 border border-red-100 text-xs font-bold text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 min-h-[46px] rounded-2xl bg-gradient-to-tr from-teal-500 to-teal-400 py-3.5 px-4 text-sm font-bold text-white shadow-lg shadow-teal-500/30 hover:opacity-95 active:scale-[0.99] disabled:opacity-50 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>{isSubmitting ? t('auth.submitting') : t('auth.submit')}</span>
              {locale === 'ar' ? <ArrowLeft className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
            </button>
          </form>

          {/* Footer Inside Card */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400 font-medium">
            <span>{locale === 'ar' ? 'جامعة الخليل © 2026' : 'Hebron University © 2026'}</span>
            <div className="flex items-center gap-1.5 text-teal-600 font-semibold">
              <ShieldCheck className="w-4 h-4" />
              <span>{locale === 'ar' ? 'نظام آمن ومشفر' : 'Secure CDMS Portal'}</span>
            </div>
          </div>

        </div>

        {/* Subtle Copyright below card */}
        <p className="text-center text-xs text-slate-400 font-medium mt-6">
          {locale === 'ar' ? 'كلية الطب والعلوم الصحية — جامعة الخليل' : 'Faculty of Medicine & Health Sciences — Hebron University'}
        </p>
      </div>
    </div>
  );
}
