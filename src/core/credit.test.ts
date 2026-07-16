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
  dueDateOptions,
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
equal(settled.statement.kind, 'paid_up', 'says the account is clear without display copy');

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
equal(owing.statement.kind, 'owes', 'states what is owed');
equal('amount' in owing.statement ? owing.statement.amount : null, 90, 'keeps the raw amount currency-free');

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
equal(stale.statement.kind, 'stale', 'statement flags the silence');
equal('days' in stale.statement ? stale.statement.days : null, 60, 'statement carries the quiet-day count');

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
equal(overpaid.statement.kind, 'change_owed', 'explains the debt runs the other way');

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
equal(summary.cash_payments_received, 30, 'legacy unlabelled payments remain cash-compatible');
equal(summary.digital_payments_received, 0, 'no digital payment is invented');

const digitalBook = calculateCreditSummary([THANDI], [
  entry({ customer_id: 1, type: 'PAYMENT', amount: 70, payment_method: 'MOBILE_MONEY', recorded_at: daysAgo(1) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 30, payment_method: 'CASH', recorded_at: daysAgo(1) }),
], week.start, week.end, NOW);
equal(digitalBook.payments_received, 100, 'all payment rails still add to the book');
equal(digitalBook.cash_payments_received, 30, 'cash rail is split for the drawer');
equal(digitalBook.digital_payments_received, 70, 'mobile money is split for the phone');

equal(summary.owing.length, 2, 'the "who owes me" list drops paid-up customers');
equal(summary.owing[0].customer_name, 'Sipho', 'biggest debt is listed first');
equal(summary.stale_debts[0].customer_name, 'Sipho', 'stale list names the right person');

// ...but they must still be reachable. Screens list from everyone.
equal(summary.everyone.length, 3, 'everyone keeps paid-up customers');
equal(summary.everyone[0].customer_name, 'Sipho', 'everyone is also biggest-debt-first');
check(
  summary.everyone.some(b => b.customer_name === 'Nomsa' && b.balance === 0),
  'a paid-up customer is present with a zero balance'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a person you just added does not vanish');
console.log('========================================');

// The bug this guards: a new customer has no entries, so their balance is 0.
// `balances` filters zero balances, so listing from it made the person vanish
// the moment they were created -- and they could then never be given credit,
// because they never appeared to tap. Found on a real phone, not by the engine
// tests, which only ever asserted the engine's own intent.
const justAdded: Customer = { id: 9, name: 'Lerato' };
const freshBook = calculateCreditSummary([justAdded], [], week.start, week.end, NOW);

equal(freshBook.owing.length, 0, 'a new person owes nothing, so is not in "who owes me"');
equal(freshBook.everyone.length, 1, 'but they ARE in the list the screen renders');
equal(freshBook.everyone[0].customer_name, 'Lerato', 'and it is them');
equal(freshBook.everyone[0].balance, 0, 'with a zero balance');
equal(freshBook.everyone[0].statement.kind, 'paid_up', 'described sensibly');
equal(summariseOutstanding(freshBook), null, 'and no outstanding card is shown');

equal(summariseOutstanding(summary)?.amount, 290, 'home summary carries the amount as data');
equal(summariseOutstanding(summary)?.people, 2, 'home summary carries the people count');

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
equal(summariseOutstanding(onePerson)?.people, 1, 'one debtor stays a numeric count for translation');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a promise that was kept, and one that was not');
console.log('========================================');

const brokePromise = calculateCustomerBalance(THANDI, [
  entry({
    customer_id: 1,
    type: 'CREDIT',
    amount: 90,
    recorded_at: daysAgo(10),
    due_at: daysAgo(3),
  }),
], NOW);

equal(brokePromise.is_overdue, true, 'a passed promise with money still owed is overdue');
equal(brokePromise.days_overdue, 3, 'counts days past the promise');
equal(brokePromise.due_at, daysAgo(3), 'reports the day they named');
equal(brokePromise.statement.kind, 'overdue', 'the statement names the broken promise');
equal('days' in brokePromise.statement ? brokePromise.statement.days : null, 3, 'the overdue fact carries three days');

const notYetDue = calculateCustomerBalance(THANDI, [
  entry({
    customer_id: 1,
    type: 'CREDIT',
    amount: 90,
    recorded_at: daysAgo(2),
    due_at: NOW + 3 * DAY,
  }),
], NOW);
equal(notYetDue.is_overdue, false, 'a promise still in the future is not overdue');
equal(notYetDue.days_overdue, null, 'nothing to count yet');

// Paying up clears the promise, however late it was.
const paidLate = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 90, recorded_at: daysAgo(10), due_at: daysAgo(5) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 90, recorded_at: daysAgo(1) }),
], NOW);
equal(paidLate.is_overdue, false, 'settling the debt clears the overdue flag');
equal(paidLate.due_at, null, 'and there is no outstanding promise left');

// Someone who never named a day can go stale, but is never "overdue".
const noPromise = calculateCustomerBalance(SIPHO, [
  entry({ customer_id: 2, type: 'CREDIT', amount: 200, recorded_at: daysAgo(60) }),
], NOW);
equal(noPromise.is_overdue, false, 'no promise means never overdue');
equal(noPromise.due_at, null, 'no date to report');
equal(noPromise.is_stale, true, 'but silence still makes it stale');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: payments settle the oldest debt first');
console.log('========================================');

// Took credit in January (promised, paid), took more in March (promised later).
// Allocating oldest-first is what stops January's kept promise haunting them.
const twoDebts = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 100, recorded_at: daysAgo(60), due_at: daysAgo(50) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 100, recorded_at: daysAgo(52) }),
  entry({ customer_id: 1, type: 'CREDIT', amount: 80, recorded_at: daysAgo(5), due_at: NOW + 5 * DAY }),
], NOW);

equal(twoDebts.balance, 80, 'balance is only the newer debt');
equal(twoDebts.due_at, NOW + 5 * DAY, "the newer debt's promise is the live one");
equal(twoDebts.is_overdue, false, 'the settled old promise does not make them overdue');

// A part-payment leaves the oldest debt still open, so its promise still counts.
const partPaid = calculateCustomerBalance(THANDI, [
  entry({ customer_id: 1, type: 'CREDIT', amount: 100, recorded_at: daysAgo(30), due_at: daysAgo(20) }),
  entry({ customer_id: 1, type: 'PAYMENT', amount: 40, recorded_at: daysAgo(10) }),
  entry({ customer_id: 1, type: 'CREDIT', amount: 50, recorded_at: daysAgo(5), due_at: NOW + 5 * DAY }),
], NOW);
equal(partPaid.balance, 110, 'balance sums both debts less the payment');
equal(partPaid.due_at, daysAgo(20), 'the part-paid older debt is still the live promise');
equal(partPaid.is_overdue, true, 'so they are overdue on it');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: the whole book counts overdue');
console.log('========================================');

const promisedBook = calculateCreditSummary(
  [THANDI, SIPHO],
  [
    entry({ customer_id: 1, type: 'CREDIT', amount: 90, recorded_at: daysAgo(9), due_at: daysAgo(2) }),
    entry({ customer_id: 2, type: 'CREDIT', amount: 60, recorded_at: daysAgo(3), due_at: NOW + DAY }),
  ],
  week.start,
  week.end,
  NOW
);
equal(promisedBook.customers_overdue, 1, 'only the broken promise counts as overdue');
equal(promisedBook.overdue_debts[0].customer_name, 'Thandi', 'and it names the right person');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: "when will you pay?" offers real answers');
console.log('========================================');

// A Wednesday, so Friday is two days out and month end is the 28th.
const WED = new Date(2026, 1, 11, 10, 0, 0).getTime();
const options = dueDateOptions(WED);

equal(options.length, 4, 'four choices');
equal(options[3].key, 'unknown', '"not sure" is always available');
equal(options[3].at, null, 'and records no date');

const friday = options.find(o => o.key === 'friday')!;
equal(new Date(friday.at!).getDay(), 5, '"this Friday" really is a Friday');
equal(new Date(friday.at!).getDate(), 13, 'and it is the coming one');

// End of day, or a debt promised for Friday would be overdue on Friday morning.
equal(new Date(friday.at!).getHours(), 23, 'due at the end of the named day');
equal(new Date(friday.at!).getMinutes(), 59, 'right to the last minute');

const eom = options.find(o => o.key === 'end_of_month')!;
equal(new Date(eom.at!).getDate(), 28, 'end of month knows February 2026 has 28 days');
equal(new Date(eom.at!).getMonth(), 1, 'and stays in February');

const twoWeeks = options.find(o => o.key === 'two_weeks')!;
equal(new Date(twoWeeks.at!).getDate(), 25, 'two weeks lands a fortnight out');

// Asked ON a Friday, "this Friday" means today, not next week.
const FRI = new Date(2026, 1, 13, 10, 0, 0).getTime();
const onFriday = dueDateOptions(FRI).find(o => o.key === 'friday')!;
equal(new Date(onFriday.at!).getDate(), 13, 'asked on Friday, "Friday" means today');
check(onFriday.at! > FRI, 'and is still in the future, because it is end of day');

// December rolls the year, not just the month.
const DEC = new Date(2026, 11, 20, 10, 0, 0).getTime();
const decEom = dueDateOptions(DEC).find(o => o.key === 'end_of_month')!;
equal(new Date(decEom.at!).getDate(), 31, 'December ends on the 31st');
equal(new Date(decEom.at!).getFullYear(), 2026, 'and does not slip into next year');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all credit assertions held');
