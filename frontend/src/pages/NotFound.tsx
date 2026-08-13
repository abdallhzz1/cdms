import { Link } from 'react-router-dom';
import { useI18n } from '@/i18n/I18nContext';

export function NotFound() {
  const { t } = useI18n();

  return (
    <div className="space-y-3 text-center">
      <h1 className="text-xl font-semibold text-slate-900">{t('notFound.title')}</h1>
      <p className="text-sm text-slate-500">{t('notFound.body')}</p>
      <Link to="/" className="inline-block text-sm font-medium text-brand-700 underline">
        {t('notFound.backLink')}
      </Link>
    </div>
  );
}
