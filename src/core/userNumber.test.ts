/** Run with: npx tsx src/core/userNumber.test.ts */

import {
  parseNonNegativeDecimal,
  parseNonNegativeWhole,
  parsePositiveDecimal,
} from './userNumber';

let failures = 0;

function equal(actual: unknown, expected: unknown, label: string) {
  if (Object.is(actual, expected)) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${String(expected)}\n         actual:   ${String(actual)}`);
  }
}

console.log('========================================');
console.log('TEST: whole quantities require the whole input');
console.log('========================================');

equal(parseNonNegativeWhole('0'), 0, 'zero is a valid quantity');
equal(parseNonNegativeWhole('0012'), 12, 'leading zeroes are harmless');
equal(parseNonNegativeWhole(' 42 '), 42, 'surrounding whitespace is harmless');
equal(parseNonNegativeWhole(''), null, 'blank is not a number');
equal(parseNonNegativeWhole('1.5'), null, 'fractional quantities are rejected');
equal(parseNonNegativeWhole('1,5'), null, 'comma fractions are rejected for quantities');
equal(parseNonNegativeWhole('12abc'), null, 'partial numeric prefixes are rejected');
equal(parseNonNegativeWhole('-1'), null, 'negative quantities are rejected');
equal(parseNonNegativeWhole('1e3'), null, 'exponent notation is rejected');
equal(
  parseNonNegativeWhole(String(Number.MAX_SAFE_INTEGER + 1)),
  null,
  'unsafe whole numbers are rejected'
);

console.log('');
console.log('========================================');
console.log('TEST: decimal amounts are finite and non-negative');
console.log('========================================');

equal(parseNonNegativeDecimal('0'), 0, 'zero is a valid non-negative amount');
equal(parseNonNegativeDecimal('12.50'), 12.5, 'dot decimals are accepted');
equal(parseNonNegativeDecimal('.5'), 0.5, 'a leading zero may be omitted');
equal(parseNonNegativeDecimal('12.'), 12, 'a trailing decimal separator is accepted');
equal(parseNonNegativeDecimal('12,50'), 12.5, 'locale comma decimals are accepted');
equal(parseNonNegativeDecimal(',5'), 0.5, 'locale comma may start a fraction');
equal(parseNonNegativeDecimal(' 7.25 '), 7.25, 'surrounding whitespace is harmless');
equal(parseNonNegativeDecimal(''), null, 'blank is not a decimal');
equal(parseNonNegativeDecimal('12abc'), null, 'partial decimal prefixes are rejected');
equal(parseNonNegativeDecimal('1.2.3'), null, 'multiple separators are rejected');
equal(parseNonNegativeDecimal('1,000.50'), null, 'mixed separators are rejected');
equal(parseNonNegativeDecimal('-0.5'), null, 'negative decimals are rejected');
equal(parseNonNegativeDecimal('NaN'), null, 'NaN text is rejected');
equal(parseNonNegativeDecimal('Infinity'), null, 'Infinity text is rejected');
equal(parseNonNegativeDecimal('1e309'), null, 'exponent notation is rejected');

console.log('');
console.log('========================================');
console.log('TEST: positive amounts exclude zero');
console.log('========================================');

equal(parsePositiveDecimal('0'), null, 'numeric zero is not positive');
equal(parsePositiveDecimal('0.00'), null, 'decimal zero is not positive');
equal(parsePositiveDecimal('0,01'), 0.01, 'a positive locale decimal is accepted');
equal(parsePositiveDecimal('25'), 25, 'a positive whole amount is accepted');
equal(parsePositiveDecimal('25oops'), null, 'junk is still rejected');

if (failures > 0) {
  console.error(`\n${failures} user-number test(s) failed.`);
  process.exit(1);
}

console.log('\nAll user-number tests passed.');
