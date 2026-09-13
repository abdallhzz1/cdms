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
      className="flex items-center gap-1.5 rounded-xl p-2 text-xs font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-teal-700"
    >
      <Globe className="w-4 h-4 text-teal-600 shrink-0" />
      <span className="hidden sm:inline">
        {locale === 'ar' ? 'EN' : 'ع'}
      </span>
    </button>
  );
}
