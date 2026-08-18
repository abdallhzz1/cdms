import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './locales/en';
import ar from './locales/ar';
import { DEFAULT_LOCALE, LOCALE_DIRECTION, SUPPORTED_LOCALES, type Locale } from './types';

const dictionaries: Record<Locale, typeof en> = { en, ar };

const STORAGE_KEY = 'cdms.locale';

export type TranslationKey = string;

function resolve(dictionary: unknown, key: string): string | undefined {
  if (!dictionary || typeof dictionary !== 'object') return undefined;
  const value = key.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, dictionary);

  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const stored = window.localStorage?.getItem(STORAGE_KEY);
  if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
    return stored as Locale;
  }

  const browserLang = window.navigator?.language?.slice(0, 2);
  if (browserLang && SUPPORTED_LOCALES.includes(browserLang as Locale)) {
    return browserLang as Locale;
  }

  return DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: Locale;
  direction: 'ltr' | 'rtl';
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    const direction = LOCALE_DIRECTION[locale];
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    if (!SUPPORTED_LOCALES.includes(next)) return;
    setLocaleState(next);
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // Storage unavailable, ignore
    }
  }, []);

  const t = useCallback(
    (key: TranslationKey, fallback?: string): string => {
      // 1. Try current locale
      const currentVal = resolve(dictionaries[locale], key);
      if (currentVal) return currentVal;

      // 2. If explicit fallback provided, use it
      if (fallback && fallback.trim().length > 0) return fallback;

      // 3. Try alternative locale dictionary
      const otherLocale = locale === 'ar' ? 'en' : 'ar';
      const otherVal = resolve(dictionaries[otherLocale], key);
      if (otherVal) return otherVal;

      // 4. Clean human-readable fallback (never show raw dotted tokens)
      const lastSegment = key.split('.').pop() || key;
      return lastSegment
        .replace(/([A-Z])/g, ' $1')
        .replace(/_/g, ' ')
        .replace(/^\w/, c => c.toUpperCase())
        .trim();
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      direction: LOCALE_DIRECTION[locale],
      setLocale,
      t,
    }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an <I18nProvider>');
  }
  return context;
}
