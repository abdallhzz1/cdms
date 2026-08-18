import { useI18n } from '@/i18n/I18nContext';
import { Globe } from 'lucide-react';

export function LanguageSwitcher() {
  const { locale, setLocale } = useI18n();

  const toggleLanguage = () => {
    setLocale(locale === 'ar' ? 'en' : 'ar');
  };

  return (
    <button
      type="button"
      onClick={toggleLanguage}
      title={locale === 'ar' ? 'Switch to English (EN)' : 'التحويل إلى العربية (AR)'}
      className="flex items-center gap-1.5 p-2 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200/80 bg-white hover:bg-slate-50 text-slate-600 hover:text-teal-600 text-xs font-bold transition-all shadow-2xs"
    >
      <Globe className="w-4 h-4 text-teal-600 shrink-0" />
      <span className="hidden sm:inline">
        {locale === 'ar' ? 'العربية' : 'English'}
      </span>
    </button>
  );
}
