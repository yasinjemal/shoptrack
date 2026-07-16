/**
 * ============================================
 * CURRENCY
 * ============================================
 *
 * One place that knows what money looks like. Everything user-facing formats
 * amounts through formatMoney(); nothing else may hard-code a currency symbol.
 *
 * The shop's currency is a SETTING (settings table, key 'currency_code'), not
 * a constant: it travels inside backups, so a shop restored onto a new phone
 * comes back in its own money. It is loaded once at startup and after every
 * restore (App.tsx), then read synchronously from here -- screens should not
 * need a database handle to print a price.
 *
 * Deliberately offline and deterministic: no Intl currency lookup, no locale
 * negotiation. `symbol + amount.toFixed(decimals)` is what a shop owner's
 * paper book looks like, and it renders identically on every phone.
 */

export interface Currency {
  /** ISO 4217 code, stored in settings and backups. */
  code: string;
  /** What the owner writes in their book: R, KSh, ₦, Br. */
  symbol: string;
  /** Decimal places shown by default. */
  decimals: number;
  /** BCP 47 locale for dates and number grouping where needed. */
  locale: string;
}

/**
 * The launch markets, in roadmap order (docs/ROADMAP.md): South Africa now,
 * Kenya + Nigeria next, Ethiopia after. Adding a currency here is deliberately
 * all it takes -- everything else reads through the registry.
 */
export const CURRENCIES = {
  ZAR: { code: 'ZAR', symbol: 'R', decimals: 2, locale: 'en-ZA' },
  KES: { code: 'KES', symbol: 'KSh', decimals: 2, locale: 'en-KE' },
  NGN: { code: 'NGN', symbol: '₦', decimals: 2, locale: 'en-NG' },
  ETB: { code: 'ETB', symbol: 'Br', decimals: 2, locale: 'am-ET' },
} as const satisfies Record<string, Currency>;

export type CurrencyCode = keyof typeof CURRENCIES;

export const CURRENCY_CODES = Object.keys(CURRENCIES) as CurrencyCode[];

/** Every shop before multi-currency was a Rand shop; that must never change. */
export const DEFAULT_CURRENCY: Currency = CURRENCIES.ZAR;

/** The settings-table key the shop's currency is stored under. */
export const CURRENCY_SETTING_KEY = 'currency_code';

let current: Currency = DEFAULT_CURRENCY;

/**
 * Apply a stored currency code. Unknown or missing codes fall back to the
 * default rather than throwing: a backup from a build with more currencies
 * must still restore, in Rand, not crash.
 */
export function setCurrentCurrency(code: string | null | undefined): Currency {
  const known = code != null && code in CURRENCIES
    ? CURRENCIES[code as CurrencyCode]
    : DEFAULT_CURRENCY;
  current = known;
  return known;
}

export function getCurrentCurrency(): Currency {
  return current;
}

/**
 * Format an amount in the shop's currency: R240.00, KSh1,400 stays out of
 * scope -- no grouping, matching what every screen printed before.
 *
 * decimals defaults to the currency's own; pass 0 for the big round hero
 * numbers ("R240 profit").
 */
export function formatMoney(amount: number, decimals?: number): string {
  return `${current.symbol}${amount.toFixed(decimals ?? current.decimals)}`;
}
