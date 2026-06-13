import { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { Lang, translations } from './translations';

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: string) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'autoglass.lang';

function detectInitialLang(): Lang {
  if (typeof window === 'undefined') return 'no';
  const stored = window.localStorage.getItem(STORAGE_KEY) as Lang | null;
  if (stored && ['no', 'sv', 'en'].includes(stored)) return stored;
  return 'no';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('no');

  useEffect(() => {
    setLangState(detectInitialLang());
  }, []);

  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
      document.documentElement.lang = l === 'no' ? 'nb' : l;
    } catch {
      /* noop */
    }
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      setLang,
      t: (key: string) => translations[lang][key] ?? translations.no[key] ?? key,
    }),
    [lang]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
