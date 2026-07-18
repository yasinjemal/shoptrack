/**
 * Strict parsers for numbers typed or pasted into app forms.
 *
 * JavaScript's parseInt/parseFloat accept a valid prefix, so values such as
 * "12abc" silently become 12. Form input must match the whole string. Both
 * decimal separators are accepted because mobile decimal pads follow the
 * phone's locale.
 */

const WHOLE_NUMBER = /^\d+$/;
const DECIMAL_NUMBER = /^(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;

function clean(input: string): string {
  return input.trim();
}

/** Parse a whole quantity, including zero, or return null when invalid. */
export function parseNonNegativeWhole(input: string): number | null {
  const value = clean(input);
  if (!WHOLE_NUMBER.test(value)) return null;

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

/** Parse a decimal amount, including zero, or return null when invalid. */
export function parseNonNegativeDecimal(input: string): number | null {
  const value = clean(input);
  if (!DECIMAL_NUMBER.test(value)) return null;

  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** Parse a decimal amount greater than zero, or return null when invalid. */
export function parsePositiveDecimal(input: string): number | null {
  const parsed = parseNonNegativeDecimal(input);
  return parsed != null && parsed > 0 ? parsed : null;
}
