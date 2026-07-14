/**
 * ============================================
 * SHOPTRACK CASH-UP ENGINE TESTS
 * ============================================
 *
 * Run with: npm run test:cashup
 */

import {
  calculateExpectedCash,
  reconcile,
  cashTurnover,
  CASH_TOLERANCE,
  type CashFlowInputs,
} from './cashup';

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

function flows(over: Partial<CashFlowInputs> = {}): CashFlowInputs {
  return {
    opening: 0,
    revenue: 0,
    creditGiven: 0,
    paymentsReceived: 0,
    expenses: 0,
    stockPurchases: 0,
    ...over,
  };
}

// ============================================
console.log('========================================');
console.log('TEST: a plain cash day');
console.log('========================================');

const plain = calculateExpectedCash(flows({ opening: 500, revenue: 1200 }));
equal(plain.expected, 1700, 'opening plus sales');
equal(plain.lines.length, 6, 'every line of the trail is shown, including zeros');
equal(plain.lines[0].key, 'opening', 'the trail starts with what was there');
equal(plain.lines[0].direction, 'opening', 'opening is neither in nor out');
equal(plain.lines[1].direction, 'in', 'revenue is money in');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: credit given never reached the till');
console.log('========================================');

// R1,200 left the shelf but R300 of it went on the book. Only R900 is cash.
const withCredit = calculateExpectedCash(flows({
  opening: 500,
  revenue: 1200,
  creditGiven: 300,
}));
equal(withCredit.expected, 1400, 'credit given is subtracted from expected cash');
equal(
  withCredit.lines.find(l => l.key === 'credit_given')?.direction,
  'out',
  'credit given reads as money not received'
);

const withPayments = calculateExpectedCash(flows({
  opening: 500,
  revenue: 1200,
  creditGiven: 300,
  paymentsReceived: 250,
}));
equal(withPayments.expected, 1650, 'old debts paid today add cash back');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a delivery takes cash out, though it is not an expense');
console.log('========================================');

// The trap this engine exists for. expenses.ts excludes stock on purpose --
// counting it would double-charge profit. But cash does not care: handing R800
// to a supplier empties the till by R800.
const withDelivery = calculateExpectedCash(flows({
  opening: 500,
  revenue: 1200,
  stockPurchases: 800,
}));
equal(withDelivery.expected, 900, 'stock purchases reduce expected cash');
equal(
  withDelivery.lines.find(l => l.key === 'stock')?.direction,
  'out',
  'stock reads as money out of the till'
);

// If stock were left out, expected would be R1,700 and the owner would count
// R900 and be told they are R800 short -- hunting a thief who is a supplier.
const ifStockIgnored = calculateExpectedCash(flows({ opening: 500, revenue: 1200 }));
const wrongVerdict = reconcile(ifStockIgnored.expected, 900, 2000);
equal(wrongVerdict.verdict, 'short', 'ignoring stock WOULD fake a shortfall');
equal(wrongVerdict.difference, -800, 'the fake shortfall is exactly the delivery');

const rightVerdict = reconcile(withDelivery.expected, 900, 2000);
equal(rightVerdict.verdict, 'balanced', 'counting stock, the same till balances');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: the full trail');
console.log('========================================');

const fullDay = flows({
  opening: 500,
  revenue: 2400,
  creditGiven: 300,
  paymentsReceived: 150,
  expenses: 450,
  stockPurchases: 800,
});
// 500 + 2400 - 300 + 150 - 450 - 800
equal(calculateExpectedCash(fullDay).expected, 1500, 'the whole trail adds up');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: small gaps are noise, not shortfalls');
console.log('========================================');

// A shop giving change from a tin never reconciles to the cent. Calling R5 a
// shortfall trains the owner to ignore the number that matters.
equal(reconcile(1500, 1495, 3000).verdict, 'balanced', 'R5 short is within tolerance');
equal(reconcile(1500, 1505, 3000).verdict, 'balanced', 'R5 over is within tolerance');
equal(reconcile(1500, 1500, 3000).verdict, 'balanced', 'an exact match balances');

equal(
  reconcile(1500, 1500 - CASH_TOLERANCE, 3000).verdict,
  'balanced',
  'exactly at tolerance still balances'
);
equal(
  reconcile(1500, 1500 - CASH_TOLERANCE - 0.01, 3000).verdict,
  'short',
  'a cent past tolerance is short'
);

check(
  reconcile(1500, 1500, 3000).statement.includes('matches'),
  'a balanced till says so plainly'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a real shortfall');
console.log('========================================');

const short = reconcile(1500, 1300, 3000);
equal(short.difference, -200, 'difference is counted minus expected');
equal(short.verdict, 'short', 'less cash than expected is short');
equal(short.severity, 'large', 'R200 of a R3000 day is a large gap');
check(short.statement.includes('R200.00 short'), 'names the amount');
check(
  short.statement.includes('not recorded'),
  'offers a bookkeeping cause rather than accusing anyone'
);
check(
  !/theft|steal|stole|thief/i.test(short.statement),
  'never accuses anyone of stealing'
);

// Same gap, much bigger day: proportionally minor.
const smallForBigShop = reconcile(1500, 1450, 20000);
equal(smallForBigShop.verdict, 'short', 'R50 is still short');
equal(smallForBigShop.severity, 'small', 'R50 of a R20,000 day is small');

// Same gap, tiny day: serious.
const bigForSmallShop = reconcile(300, 250, 300);
equal(bigForSmallShop.severity, 'large', 'R50 of a R300 day is large');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: extra cash is explained too');
console.log('========================================');

const over = reconcile(1500, 1700, 3000);
equal(over.difference, 200, 'a surplus is a positive difference');
equal(over.verdict, 'over', 'more cash than expected reads as over');
check(over.statement.includes('more than expected'), 'says there is extra');
check(
  !/theft|steal|thief/i.test(over.statement),
  'a surplus is not treated as suspicious'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: turnover scales, and does not go negative');
console.log('========================================');

equal(cashTurnover(fullDay), 3500, 'turnover counts all cash that moved');

// A quiet day with a big delivery still moved a lot of money.
equal(
  cashTurnover(flows({ revenue: 100, stockPurchases: 2000 })),
  2100,
  'a delivery counts toward turnover even on a slow day'
);

// Everything sold on credit: no cash moved at all, so turnover must not go
// negative and drag the threshold below zero.
const allCredit = flows({ revenue: 500, creditGiven: 500 });
equal(cashTurnover(allCredit), 0, 'an all-credit day has no cash turnover');
check(cashTurnover(allCredit) >= 0, 'turnover is never negative');
equal(
  reconcile(0, 0, cashTurnover(allCredit)).verdict,
  'balanced',
  'an all-credit day with an empty till balances'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: cents do not drift');
console.log('========================================');

const drifting = calculateExpectedCash(flows({
  opening: 0.1,
  revenue: 0.2,
}));
equal(drifting.expected, 0.3, 'a six-line sum is rounded to cents');

const driftReconcile = reconcile(0.3, 0.3, 1);
equal(driftReconcile.difference, 0, 'a balanced till is exactly zero, not 1e-17');
equal(driftReconcile.verdict, 'balanced', 'float noise does not create a shortfall');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: an empty shop does not crash');
console.log('========================================');

const nothing = calculateExpectedCash(flows());
equal(nothing.expected, 0, 'nothing in, nothing out, nothing expected');
equal(reconcile(0, 0, 0).verdict, 'balanced', 'an empty till against nothing balances');
check(!Number.isNaN(reconcile(0, 0, 0).difference), 'difference is never NaN');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all cash-up assertions held');
