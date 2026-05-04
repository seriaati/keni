import en from './en.json';
import zhTW from './zh-TW.json';

export type Translations = typeof en;

export function getTranslations(locale: string | undefined): Translations {
  if (locale === 'zh-TW') return zhTW as unknown as Translations;
  return en;
}
