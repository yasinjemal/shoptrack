import { sanitiseCrashEvent } from './privacy';

let failures = 0;
function check(value: boolean, label: string) {
  if (value) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}`); }
}

const event = sanitiseCrashEvent({
  message: 'Sipho failed buying Bread for R240',
  user: { name: 'Sipho' },
  request: { data: 'Bread' },
  breadcrumbs: [{ message: 'R240' }],
  extra: { customer: 'Sipho' },
  contexts: { shop: { product: 'Bread' } },
  tags: { amount: 'R240' },
  transaction: 'credit/Sipho',
  exception: { values: [{ type: 'TypeError', value: 'Bread R240', stacktrace: { frames: [] } }] },
});
const serialised = JSON.stringify(event);
check(!serialised.includes('Sipho'), 'customer names are removed');
check(!serialised.includes('Bread'), 'product names are removed');
check(!serialised.includes('R240'), 'amounts are removed');
check(serialised.includes('TypeError'), 'error type remains useful');
check(serialised.includes('frames'), 'stack frames remain useful');

if (failures > 0) { console.error(`FAILED: ${failures} privacy assertion(s)`); process.exit(1); }
console.log('PASSED: remote crash privacy boundary held');

