import { calculateActivationMetric } from './activation';

let failures = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`); }
}

const day = 86400000;
equal(calculateActivationMetric([]).activated, false, 'an install is not a habit');
equal(calculateActivationMetric([1000, 2000]).unique_days, 1, 'many entries today count as one day');
const active = calculateActivationMetric([1000, day + 1000, day + 2000], 999);
equal(active.activated, true, 'two distinct days activate');
equal(active.unique_days, 2, 'unique days are retained');
equal(active.activated_at, day + 1000, 'activation happened on the first entry of day two');
equal(active.computed_at, 999, 'calculation time is explicit');

if (failures > 0) { console.error(`FAILED: ${failures} activation assertion(s)`); process.exit(1); }
console.log('PASSED: all activation assertions held');

