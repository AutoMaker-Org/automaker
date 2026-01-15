/**
 * i18n Configuration for Automaker UI
 *
 * Uses react-i18next with:
 * - Browser language detection (localStorage + navigator)
 * - HTTP backend for lazy loading translations
 * - English fallback for missing translations
 */

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import HttpBackend from 'i18next-http-backend';

// Supported languages (matching backend language instruction options)
export const SUPPORTED_LANGUAGES = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'de', name: 'German', nativeName: 'Deutsch' },
  { code: 'es', name: 'Spanish', nativeName: 'Español' },
  { code: 'fr', name: 'French', nativeName: 'Français' },
  { code: 'it', name: 'Italian', nativeName: 'Italiano' },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語' },
  { code: 'zh', name: 'Chinese', nativeName: '中文' },
  { code: 'ko', name: 'Korean', nativeName: '한국어' },
] as const;

export const SUPPORTED_LANGUAGE_CODES = SUPPORTED_LANGUAGES.map((lang) => lang.code);

// Namespaces for organizing translations
export const NAMESPACES = ['common', 'settings', 'agent', 'board'] as const;
export type Namespace = (typeof NAMESPACES)[number];

i18n
  // Load translations via HTTP
  .use(HttpBackend)
  // Detect user language
  .use(LanguageDetector)
  // Pass i18n instance to react-i18next
  .use(initReactI18next)
  // Initialize i18next
  .init({
    // Fallback language when translation is missing
    fallbackLng: 'en',

    // Supported languages
    supportedLngs: SUPPORTED_LANGUAGE_CODES,

    // Namespaces
    ns: NAMESPACES as unknown as string[],
    defaultNS: 'common',

    // Language detection options
    detection: {
      // Order of detection methods
      order: ['localStorage', 'navigator', 'htmlTag'],
      // Cache user language preference
      caches: ['localStorage'],
      // localStorage key
      lookupLocalStorage: 'automaker:ui-language',
    },

    // HTTP backend options
    backend: {
      // Path to translation files
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },

    // React options
    react: {
      // Use Suspense for loading translations
      useSuspense: true,
    },

    // Interpolation options
    interpolation: {
      // React already escapes values
      escapeValue: false,
    },

    // Debug mode (disable in production)
    debug: import.meta.env.DEV,
  });

/**
 * Change the UI language
 */
export async function changeLanguage(languageCode: string): Promise<void> {
  await i18n.changeLanguage(languageCode);
}

/**
 * Get the current UI language
 */
export function getCurrentLanguage(): string {
  return i18n.language;
}

export default i18n;
