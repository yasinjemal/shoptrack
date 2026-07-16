import type { PaymentMethod } from './credit';
import type { CurrencyCode } from './currency';
import type { ExpenseCategory } from './expenses';
import type { Language } from '../i18n';

export type CountryPackCode = 'ZA' | 'KE' | 'NG' | 'ET';
export const COUNTRY_PACK_SETTING_KEY = 'country_pack';

export interface CountryPack {
  code: CountryPackCode;
  name: string;
  currency: CurrencyCode;
  languages: Language[];
  expenseCategories: ExpenseCategory[];
  paymentVocabulary: Record<PaymentMethod, string>;
  calendar: 'gregorian' | 'ethiopian';
}

const expenses: ExpenseCategory[] = ['RENT', 'ELECTRICITY', 'TRANSPORT', 'WAGES', 'AIRTIME', 'OTHER'];

export const COUNTRY_PACKS: Record<CountryPackCode, CountryPack> = {
  ZA: {
    code: 'ZA', name: 'South Africa', currency: 'ZAR',
    languages: ['en', 'zu', 'xh', 'st', 'af'], expenseCategories: expenses,
    paymentVocabulary: { CASH: 'Cash', MOBILE_MONEY: 'MoMo Pay', BANK: 'Bank transfer', OTHER: 'Other' },
    calendar: 'gregorian',
  },
  KE: {
    code: 'KE', name: 'Kenya', currency: 'KES',
    languages: ['en', 'sw'], expenseCategories: expenses,
    paymentVocabulary: { CASH: 'Cash', MOBILE_MONEY: 'M-Pesa', BANK: 'Bank transfer', OTHER: 'Other' },
    calendar: 'gregorian',
  },
  NG: {
    code: 'NG', name: 'Nigeria', currency: 'NGN',
    languages: ['en'], expenseCategories: expenses,
    paymentVocabulary: { CASH: 'Cash', MOBILE_MONEY: 'MoMo / OPay', BANK: 'Bank transfer', OTHER: 'Other' },
    calendar: 'gregorian',
  },
  ET: {
    code: 'ET', name: 'Ethiopia', currency: 'ETB',
    languages: ['am', 'en'], expenseCategories: expenses,
    paymentVocabulary: { CASH: 'Cash', MOBILE_MONEY: 'telebirr', BANK: 'Bank transfer', OTHER: 'Other' },
    calendar: 'ethiopian',
  },
};

export const COUNTRY_PACK_CODES = Object.keys(COUNTRY_PACKS) as CountryPackCode[];

let currentCountryPack: CountryPack = COUNTRY_PACKS.ZA;

export function setCurrentCountryPack(code: string | null | undefined): CountryPack {
  currentCountryPack = code != null && code in COUNTRY_PACKS
    ? COUNTRY_PACKS[code as CountryPackCode]
    : COUNTRY_PACKS.ZA;
  return currentCountryPack;
}

export function getCurrentCountryPack(): CountryPack {
  return currentCountryPack;
}

/** Mobile-money brand vocabulary is country-specific; other labels stay translated. */
export function paymentMethodLabel(method: PaymentMethod, translatedFallback: string): string {
  return method === 'MOBILE_MONEY'
    ? currentCountryPack.paymentVocabulary.MOBILE_MONEY
    : translatedFallback;
}

export function isCountryPackCode(value: string | null): value is CountryPackCode {
  return value != null && value in COUNTRY_PACKS;
}
