/**
 * Language registry.
 *
 * Adding a language is one new file in this directory, typed as `typeof en`,
 * plus an entry here. The type annotation is the completeness test: a language
 * file missing a key does not compile.
 */

import { en } from './en';
import { zu } from './zu';
import { xh } from './xh';
import { st } from './st';
import { af } from './af';
import { sw } from './sw';
import { am } from './am';

/** The canonical shape of a language file. */
export type Strings = typeof en;

export type Language = 'en' | 'zu' | 'xh' | 'st' | 'af' | 'sw' | 'am';

export const STRINGS: Record<Language, Strings> = { en, zu, xh, st, af, sw, am };

export const LANGUAGE_OPTIONS: ReadonlyArray<{
  code: Language;
  label: string;
  reviewed: boolean;
}> = [
  { code: 'en', label: 'English', reviewed: true },
  { code: 'zu', label: 'isiZulu', reviewed: true },
  { code: 'xh', label: 'isiXhosa', reviewed: false },
  { code: 'st', label: 'Sesotho', reviewed: false },
  { code: 'af', label: 'Afrikaans', reviewed: false },
  { code: 'sw', label: 'Kiswahili', reviewed: false },
  { code: 'am', label: 'አማርኛ', reviewed: false },
];

export function isLanguage(value: string | null): value is Language {
  return LANGUAGE_OPTIONS.some(option => option.code === value);
}

export function isReviewedLanguage(value: string | null): value is Language {
  return LANGUAGE_OPTIONS.some(option => option.code === value && option.reviewed);
}

/** Get the strings for the current language. */
export const getStrings = (lang: Language): Strings => STRINGS[lang];
