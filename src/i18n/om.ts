import { en } from './en';

/**
 * Afaan Oromo scaffold. The owner speaks Afaan Oromo and will review the
 * drafted translations in the app; until the draft lands this shows English.
 */
export const om: typeof en = { ...en, LANGUAGE_LABEL: 'Afaan', SPEECH_LOCALE: 'om-ET' };
