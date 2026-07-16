import { calculateCustomerBalance } from './credit';
import { buildCashUpSummary, buildCountSummary, buildCreditReminder, buildPaymentReceipt } from './messages';
import { reconcile } from './cashup';

let failures = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`); }
}

const balance = calculateCustomerBalance(
  { id: 1, name: 'Sipho' },
  [{ id: 1, customer_id: 1, type: 'CREDIT', amount: 240, recorded_at: 1 }],
  10 * 86400000
);
const reminder = buildCreditReminder(balance);
equal(reminder.kind, 'credit_reminder', 'builds a reminder fact');
equal(reminder.kind === 'credit_reminder' ? reminder.balance : null, 240, 'keeps the raw balance');

const receipt = buildPaymentReceipt('Sipho', 100, 'MOBILE_MONEY', 140, 123);
equal(receipt.kind, 'payment_receipt', 'builds a receipt fact');
equal(receipt.kind === 'payment_receipt' ? receipt.method : null, 'MOBILE_MONEY', 'keeps the payment rail');

const count = buildCountSummary(-1, 90, 2);
equal(count.kind === 'count_summary' ? count.units_sold : null, 0, 'invalid negative units fail safe');

const cash = buildCashUpSummary(reconcile(1000, 900, 2000), 300);
equal(cash.kind === 'cashup_summary' ? cash.difference : null, -100, 'cash-up share keeps the signed gap');
equal(cash.kind === 'cashup_summary' ? cash.digital_takings : null, 300, 'cash-up share includes money in the phone');

if (failures > 0) { console.error(`FAILED: ${failures} message assertion(s)`); process.exit(1); }
console.log('PASSED: all message-builder assertions held');

