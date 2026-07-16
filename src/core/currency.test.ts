/**
 * ============================================
 * CURRENCY TESTS
 * ============================================
 *
 * Run with: npm run test:currency
 */

import {
  CURRENCIES,
  CURRENCY_CODES,
  DEFAULT_CURRENCY,
  formatMoney,
  getCurrentCurrency,
  setCurrentCurrency,
} from './currency';

let failures = 0;

function check(condition: boolean, label: string) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`);
  }
}

console.log('========================================');
console.log('TEST: the default shop is a Rand shop');
console.log('========================================');

equal(getCurrentCurrency().code, 'ZAR', 'starts in Rand');
equal(formatMoney(240), 'R240.00', 'formats like the paper book');
equal(formatMoney(240, 0), 'R240', 'hero numbers can drop the cents');
equal(formatMoney(0.5), 'R0.50', 'cents keep both digits');

console.log('');
console.log('========================================');
console.log('TEST: switching currency changes every format');
console.log('========================================');

setCurrentCurrency('KES');
equal(formatMoney(1400), 'KSh1400.00', 'Kenya formats in shillings');
setCurrentCurrency('NGN');
equal(formatMoney(25), '₦25.00', 'Nigeria formats in naira');
setCurrentCurrency('ETB');
equal(formatMoney(100), 'Br100.00', 'Ethiopia formats in birr');

console.log('');
console.log('========================================');
console.log('TEST: unknown codes fail safe, never closed');
console.log('========================================');

const applied = setCurrentCurrency('XXX');
equal(applied.code, DEFAULT_CURRENCY.code, 'an unknown code falls back to the default');
equal(setCurrentCurrency(null).code, 'ZAR', 'a missing setting falls back to the default');
equal(setCurrentCurrency(undefined).code, 'ZAR', 'an absent setting falls back to the default');

console.log('');
console.log('========================================');
console.log('TEST: the registry is coherent');
console.log('========================================');

for (const code of CURRENCY_CODES) {
  const c = CURRENCIES[code];
  check(c.code === code, `${code}: registry key matches its code`);
  check(c.symbol.length > 0, `${code}: has a symbol`);
  check(c.decimals >= 0 && c.decimals <= 4, `${code}: sane decimals`);
}

// Leave the module the way every other test expects to find it.
setCurrentCurrency('ZAR');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} currency check(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all currency checks held');
