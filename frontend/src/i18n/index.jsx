import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getSiteLanguage, setSiteLanguage } from '../utils/siteLanguage';
import { trackEvent } from '../analytics/metrics';
import en from './en';
import hi from './hi';
import { pagesEn, pagesHi } from './pages';

/**
 * Interface translation.
 *
 * Hand-rolled rather than react-i18next: two languages, flat keys, no
 * pluralisation rules to speak of, and the bundle already carries leaflet and
 * the OAuth SDK. A library would add 40KB to solve problems this app does not
 * have.
 *
 * Hindi is the default. The audience is Hindi-speaking party workers, so
 * English was the wrong default even while it was the only option — and a
 * missing key falls back to English rather than showing a raw key, so a screen
 * that has not been translated yet degrades to the old text instead of
 * breaking.
 */

const DICTIONARIES = { en: { ...en, ...pagesEn }, hi: { ...hi, ...pagesHi } };
export const DEFAULT_LANGUAGE = 'hi';

const I18nContext = createContext(null);

/**
 * Look one key up. Returns English when Hindi lacks it, and the key itself
 * only when neither has it — which is a missing-translation bug, and looks
 * like one, deliberately.
 */
export function translate(lang, key, vars) {
  const dict = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANGUAGE];
  let text = dict?.[key] ?? DICTIONARIES.en?.[key] ?? key;
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      text = text.split(`{${name}}`).join(String(value));
    }
  }
  return text;
}

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => getSiteLanguage() ?? DEFAULT_LANGUAGE);

  // `lang` on <html> drives the Devanagari font stack in index.css, and screen
  // readers pick their voice from it.
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const changeLanguage = useCallback((next) => {
    if (!DICTIONARIES[next]) return;
    setSiteLanguage(next);
    setLang(next);
    // Worth counting on a two-language product: it says which one people
    // actually choose, as opposed to which one they were given.
    trackEvent('language_change', { language: next });
  }, []);

  const value = useMemo(
    () => ({ lang, changeLanguage, t: (key, vars) => translate(lang, key, vars) }),
    [lang, changeLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/**
 * `const { t, lang, changeLanguage } = useI18n()`.
 *
 * Usable outside the provider so a component rendered in a portal, or a test
 * mounting one screen on its own, does not crash — it just gets the default
 * language.
 */
export function useI18n() {
  const ctx = useContext(I18nContext);
  if (ctx) return ctx;
  const lang = getSiteLanguage() ?? DEFAULT_LANGUAGE;
  return { lang, changeLanguage: () => {}, t: (key, vars) => translate(lang, key, vars) };
}
