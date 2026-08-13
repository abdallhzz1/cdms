import { useI18n } from '@/i18n/I18nContext';
import { SUPPORTED_LOCALES, LOCALE_LABEL } from '@/i18n/types';

/**
 * Minimal language switcher used to verify (and, later, to actually drive)
 * the i18n foundation. Switching language here also switches document
 * direction — see I18nContext.
 */
export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <label className="flex items-center gap-2 text-sm text-slate-600">
      <span className="sr-only">{t('common.language')}</span>
      <select
        aria-label={t('common.language')}
        value={locale}
        onChange={(event) => setLocale(event.target.value as typeof locale)}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      >
        {SUPPORTED_LOCALES.map((code) => (
          <option key={code} value={code}>
            {LOCALE_LABEL[code]}
          </option>
        ))}
      </select>
    </label>
  );
}
