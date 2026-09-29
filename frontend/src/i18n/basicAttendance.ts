import { basicAttendanceUi as ar } from './locales/basic-ar';
import { basicAttendanceUi as en } from './locales/basic-en';
import { DEFAULT_LOCALE } from './types';

// Pure helper also used by report/status formatting outside React components.
export function basicLocale(): 'ar' | 'en' {
  try {
    const saved = localStorage.getItem('cdms.locale');
    if (saved === 'ar' || saved === 'en') return saved;
  } catch { /* Storage may be disabled on a private device. */ }
  const language = navigator.language.slice(0, 2);
  return language === 'ar' || language === 'en' ? language : DEFAULT_LOCALE;
}

export function basicText(key: keyof typeof ar, values: Record<string, unknown> = {}): string {
  const value = (basicLocale() === 'ar' ? ar : en)[key];
  return value.replace(/\{(\w+)\}/g, (match, name: string) => String(values[name] ?? match));
}
