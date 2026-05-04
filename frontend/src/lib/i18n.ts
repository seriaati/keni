import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '../locales/en.json';
import zhTW from '../locales/zh-TW.json';

export const SUPPORTED_LOCALES: { value: string; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'zh-TW', label: '繁體中文' },
];

const supportedCodes = new Set(SUPPORTED_LOCALES.map((l) => l.value));

function browserLocale(): string {
  for (const lang of navigator.languages ?? [navigator.language]) {
    if (supportedCodes.has(lang)) return lang;
  }
  return 'en';
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    'zh-TW': { translation: zhTW },
  },
  lng: browserLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export default i18n;
