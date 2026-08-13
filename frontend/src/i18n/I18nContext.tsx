import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import en from './locales/en';
import ar from './locales/ar';
import { DEFAULT_LOCALE, LOCALE_DIRECTION, SUPPORTED_LOCALES, type Locale } from './types';

const dictionaries: Record<Locale, typeof en> = { en, ar };

const STORAGE_KEY = 'cdms.locale';

// Builds a union of every dotted key path in the translation dictionary
// (e.g. "common.appName" | "foundation.title" | ...) so `t()` calls are
// checked at compile time against the *actual* set of translation keys —
// a typo or a key that only exists in one language fails to build.
type DotPaths<T, Prefix extends string = ''> = T extends Record<string, unknown>
  ? {
      [K in keyof T & string]: T[K] extends Record<string, unknown>
        ? DotPaths<T[K], `${Prefix}${K}.`>
        : `${Prefix}${K}`;
    }[keyof T & string]
  : never;

export type TranslationKey = DotPaths<typeof en>;

function resolve(dictionary: unknown, key: string): string {
  const value = key.split('.').reduce<unknown>((node, segment) => {
    if (node && typeof node === 'object' && segment in node) {
      return (node as Record<string, unknown>)[segment];
    }
    return undefined;
  }, dictionary);

  return typeof value === 'string' ? value : key;
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
  t: (key: TranslationKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  // Switching language switches document direction and text direction
  // together — Arabic renders RTL, English LTR, and the two are never
  // mixed within one layout (PROJECT_RULES.md §7).
  useEffect(() => {
    const direction = LOCALE_DIRECTION[locale];
    document.documentElement.lang = locale;
    document.documentElement.dir = direction;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    window.localStorage?.setItem(STORAGE_KEY, next);
  }, []);

  const t = useCallback(
    (key: TranslationKey) => resolve(dictionaries[locale], key),
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ locale, direction: LOCALE_DIRECTION[locale], setLocale, t }),
    [locale, setLocale, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error('useI18n must be used within an <I18nProvider>.');
  }
  return ctx;
}
