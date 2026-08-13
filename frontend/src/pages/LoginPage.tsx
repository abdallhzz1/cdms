import { useState } from 'react';
import { useNavigate, useLocation, type Location } from 'react-router-dom';
import { useI18n, type TranslationKey } from '@/i18n/I18nContext';
import { useZodForm } from '@/lib/form/useZodForm';
import { loginSchema, type LoginFormValues } from '@/auth/loginSchema';
import { useAuth } from '@/auth/AuthContext';
import { ApiError } from '@/api/client';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface LocationState {
  from?: Location;
}

/**
 * Bilingual/RTL-LTR login screen — Prompt 02 §14: professional, calm,
 * minimal, responsive. No animation, no illustration, no fabricated
 * statistics; matches the rest of the app's plain/neutral visual language
 * (src/styles/index.css).
 */
export function LoginPage() {
  const { t } = useI18n();
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
      const state = location.state as LocationState | null;
      navigate(state?.from?.pathname ?? '/', { replace: true });
    } catch (error) {
      // Deliberately generic — mirrors the backend's own refusal to
      // disclose whether the email exists or which field was wrong
      // (Prompt 02 §11).
      if (error instanceof ApiError) {
        setFormError(t('auth.invalidCredentials'));
      } else {
        setFormError(t('auth.unknownError'));
      }
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex justify-end">
          <LanguageSwitcher />
        </div>

        <div className="mb-6 text-center">
          <p className="text-sm font-semibold text-slate-800">{t('common.appName')}</p>
          <p className="text-xs text-slate-500">{t('common.organization')}</p>
        </div>

        <h1 className="mb-1 text-lg font-semibold text-slate-900">{t('auth.title')}</h1>
        <p className="mb-5 text-sm text-slate-500">{t('auth.subtitle')}</p>

        <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.emailLabel')}
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              {...register('email')}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-700">{t(errors.email.message as TranslationKey)}</p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              {t('auth.passwordLabel')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              {...register('password')}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-700">{t(errors.password.message as TranslationKey)}</p>
            )}
          </div>

          {formError && (
            <p role="alert" className="text-sm text-red-700">
              {formError}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-brand-700 px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-brand-600 disabled:opacity-50"
          >
            {isSubmitting ? t('auth.submitting') : t('auth.submit')}
          </button>
        </form>
      </div>
    </div>
  );
}
