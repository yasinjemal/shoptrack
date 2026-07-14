/**
 * ============================================
 * SHOPTRACK CREDIT ENGINE TESTS
 * ============================================
 *
 * Scenarios drawn from how a spaza shop book actually behaves:
 * - regulars who take goods all week and settle on payday
 * - customers who go quiet owing money
 * - overpayments and round numbers
 *
 * Run with: npm run test:credit
 */

import {
  calculateCustomerBalance,
  calculateCreditSummary,
  summariseOutstanding,
  STALE_AFTER_DAYS,
  type Customer,
  type CreditEntry,
} from './credit';

let failures = 0;

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`);
  }
}

function check(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

const NOW = Date.UTC(2026, 1, 15, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => NOW - n * DAY;

const THANDI: Customer = { id: 1, name: 'Thandi' };
const SIPHO: Customer = { id: 2, name: 'Sipho' };
const NOMSA: Customer = { id: 3, name: 'Nomsa' };

let nextId = 1;
function entry(over: Partial<CreditEntry> & { customer_id: number; type: CreditEntry['type']; amount: number }): CreditEntry {
  return { id: nextId++, recorded_at: NOW, ...over };
}

// ============================================
console.log('========================================');
console.log('TEST: a regular who settles on payday');
console.log('========================================');

const settled = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 45, recorded_at: daysAgo(20) }),
  entry({ customer_id: 1, type: 'CREDIT', amount: 45, recorded_at: daysAgo(15) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 90, recorded_at: daysAgo(2) }),
], NOW);

equal(settled.total_credit, 90, 'total credit adds up');
equal(settled.total_paid, 90, 'total paid adds up');
equal(settled.balance, 0, 'settling in full clears the balance');
equal(settled.is_stale, false, 'a paid-up account is never stale');
equal(settled.statement, 'Thandi is all paid up.', 'says the account is clear');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a customer still owing');
console.log('========================================');

const owing = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 120, recorded_at: daysAgo(10) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 30, recorded_at: daysAgo(3) }),
], NOW);

equal(owing.balance, 90, 'balance is credit minus payments');
equal(owing.days_since_activity, 3, 'days since last activity uses the newest entry');
equal(owing.is_stale, false, 'recent activity is not stale');
equal(owing.statement, 'Thandi owes R90.00.', 'states what is owed');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: money owed by someone gone quiet');
console.log('========================================');

const stale = calculateCustomerBalance(SIPHO, [
  entry({ customer_id: 2, type: 'CREDIT', amount: 200, recorded_at: daysAgo(60) }),
], NOW);

equal(stale.balance, 200, 'balance survives with no payments');
equal(stale.days_since_activity, 60, 'counts days since the debt was taken');
equal(stale.is_stale, true, `60 days is past the ${STALE_AFTER_DAYS}-day mark`);
check(stale.statement.includes('has not paid anything for 60 days'), 'statement flags the silence');

// Boundary: exactly at the threshold counts as stale, one day short does not.
const atEdge = calculateCustomerBalance(SIPHO, [
  entry({ customer_id: 2, type: 'CREDIT', amount: 50, recorded_at: daysAgo(STALE_AFTER_DAYS) }),
], NOW);
equal(atEdge.is_stale, true, `exactly ${STALE_AFTER_DAYS} days is stale`);

const justInside = calculateCustomerBalance(SIPHO, [
  entry({ customer_id: 2, type: 'CREDIT', amount: 50, recorded_at: daysAgo(STALE_AFTER_DAYS - 1) }),
], NOW);
equal(justInside.is_stale, false, `${STALE_AFTER_DAYS - 1} days is not yet stale`);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: overpayment is explained, not hidden');
console.log('========================================');

const overpaid = calculateCustomerBalance(NOMSA, [
  entry({ customer_id: 3, type: 'CREDIT', amount: 40, recorded_at: daysAgo(5) }),
  entry({ customer_id: 3, type: 'PAYMENT', amount: 50, recorded_at: daysAgo(1) }),
], NOW);

equal(overpaid.balance, -10, 'overpayment produces a negative balance');
equal(overpaid.is_stale, false, 'a credit balance is never stale');
equal(overpaid.statement, 'You owe Nomsa R10.00 in change.', 'explains the debt runs the other way');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: cents do not drift');
console.log('========================================');

// 0.1 + 0.2 in floating point is 0.30000000000000004. A shop balance must
// never render as R89.99999999999999.
const cents = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 0.1, recorded_at: daysAgo(2) }),
  entry({ customer_id: 1, type: 'CREDIT', amount: 0.2, recorded_at: daysAgo(2) }),
], NOW);
equal(cents.balance, 0.3, 'repeated addition is rounded to cents');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: the whole book');
console.log('========================================');

const customers = [THANDI, SIPHO, NOMSA];
const book: CreditEntry[] = [
  // Thandi: owes 90, active
  entry({ customer_id: 1, type: 'CREDIT', amount: 120, recorded_at: daysAgo(4) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 30, recorded_at: daysAgo(1) }),
  // Sipho: owes 200, gone quiet
  entry({ customer_id: 2, type: 'CREDIT', amount: 200, recorded_at: daysAgo(60) }),
  // Nomsa: paid up
  entry({ customer_id: 3, type: 'CREDIT', amount: 50, recorded_at: daysAgo(9) }),
  entry({ customer_id: 3, type: 'PAYMENT', amount: 50, recorded_at: daysAgo(8) }),
];

const week = { start: daysAgo(7), end: NOW };
const summary = calculateCreditSummary(customers, book, week.start, week.end, NOW);

equal(summary.total_outstanding, 290, 'outstanding is every positive balance');
equal(summary.customers_owing, 2, 'counts only those who owe');
equal(summary.customers_stale, 1, 'finds the one quiet debt');

// Period figures cover the week; balances cover all time.
equal(summary.credit_given, 120, 'credit given counts only this week');
equal(summary.payments_received, 30, 'payments received count only this week');

equal(summary.balances.length, 2, 'paid-up customers drop off the list');
equal(summary.balances[0].customer_name, 'Sipho', 'biggest debt is listed first');
equal(summary.stale_debts[0].customer_name, 'Sipho', 'stale list names the right person');

equal(
  summariseOutstanding(summary),
  'R290.00 is owed to you by 2 people.',
  'home line reads naturally'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: an empty book says nothing');
console.log('========================================');

const empty = calculateCreditSummary([], [], week.start, week.end, NOW);
equal(empty.total_outstanding, 0, 'no customers means nothing outstanding');
equal(summariseOutstanding(empty), null, 'no card shown when nobody owes anything');

const allPaid = calculateCreditSummary([NOMSA], [
  entry({ customer_id: 3, type: 'CREDIT', amount: 50, recorded_at: daysAgo(9) }),
  entry({ customer_id: 3, type: 'PAYMENT', amount: 50, recorded_at: daysAgo(8) }),
], week.start, week.end, NOW);
equal(summariseOutstanding(allPaid), null, 'no card shown when the book is settled');

// Singular wording, because "1 people" is how an app loses trust.
const onePerson = calculateCreditSummary([THANDI], [
  entry({ customer_id: 1, type: 'CREDIT', amount: 90, recorded_at: daysAgo(2) }),
], week.start, week.end, NOW);
equal(
  summariseOutstanding(onePerson),
  'R90.00 is owed to you by 1 person.',
  'one debtor reads as "1 person"'
);

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all credit assertions held');
