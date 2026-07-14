/**
 * ============================================
 * SHOPTRACK EXPENSES ENGINE TESTS
 * ============================================
 *
 * Run with: npm run test:expenses
 */

import {
  calculateExpenseSummary,
  calculateNetProfit,
  EXPENSE_CATEGORIES,
  CATEGORY_LABELS,
  CATEGORY_ICONS,
  type Expense,
} from './expenses';

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

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = Date.UTC(2026, 1, 9, 8, 0, 0);
const WEEK = { start: MONDAY, end: MONDAY + 7 * DAY };

let nextId = 1;
function expense(over: Partial<Expense> & { category: Expense['category']; amount: number }): Expense {
  return { id: nextId++, recorded_at: MONDAY + DAY, ...over };
}

// ============================================
console.log('========================================');
console.log('TEST: a normal week of costs');
console.log('========================================');

const week: Expense[] = [
  expense({ category: 'RENT', amount: 1500, recorded_at: MONDAY }),
  expense({ category: 'TRANSPORT', amount: 200, recorded_at: MONDAY + DAY }),
  expense({ category: 'TRANSPORT', amount: 150, recorded_at: MONDAY + 3 * DAY }),
  expense({ category: 'ELECTRICITY', amount: 350, recorded_at: MONDAY + 4 * DAY }),
];

const summary = calculateExpenseSummary(week, WEEK.start, WEEK.end);

equal(summary.total, 2200, 'total adds up');
equal(summary.count, 4, 'counts every entry');
equal(summary.by_category.length, 3, 'groups into three categories');
equal(summary.by_category[0].category, 'RENT', 'biggest category is first');
equal(summary.biggest?.category, 'RENT', 'biggest is reported');

const transport = summary.by_category.find(c => c.category === 'TRANSPORT');
equal(transport?.total, 350, 'repeat entries in a category are summed');
equal(transport?.count, 2, 'counts entries within a category');

equal(summary.by_category[0].share, 68, 'share is a percentage of the period total');
check(
  summary.by_category.every(c => c.count > 0),
  'categories with nothing spent are left out'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: only this period counts');
console.log('========================================');

const spanning: Expense[] = [
  expense({ category: 'RENT', amount: 1500, recorded_at: MONDAY - DAY }),      // last week
  expense({ category: 'WAGES', amount: 800, recorded_at: MONDAY + 2 * DAY }),  // this week
  expense({ category: 'OTHER', amount: 50, recorded_at: MONDAY + 30 * DAY }),  // next month
];

const scoped = calculateExpenseSummary(spanning, WEEK.start, WEEK.end);
equal(scoped.total, 800, 'expenses outside the period are ignored');
equal(scoped.count, 1, 'only in-period entries are counted');

// Boundaries are inclusive on both ends.
const onEdges = calculateExpenseSummary([
  expense({ category: 'OTHER', amount: 10, recorded_at: WEEK.start }),
  expense({ category: 'OTHER', amount: 20, recorded_at: WEEK.end }),
], WEEK.start, WEEK.end);
equal(onEdges.total, 30, 'entries exactly on the period boundary are included');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: net profit is the honest number');
console.log('========================================');

// The case this whole module exists for: gross looks great, net is the truth.
const net = calculateNetProfit(2400, 800);
equal(net.gross_profit, 2400, 'gross is carried through');
equal(net.expenses, 800, 'expenses are carried through');
equal(net.net_profit, 1600, 'net is gross minus expenses');
equal(net.is_loss, false, 'a positive net is not a loss');
equal(net.has_expense_data, true, 'expenses were recorded');
equal(
  net.statement,
  'You made R2400.00 from sales, paid R800.00 in costs, and kept R1600.00.',
  'statement shows all three numbers, not just the good one'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a real loss is stated plainly');
console.log('========================================');

const loss = calculateNetProfit(500, 1500);
equal(loss.net_profit, -1000, 'net goes negative when costs exceed margin');
equal(loss.is_loss, true, 'flagged as a loss');
check(
  loss.statement.includes('R1000.00 more than you made'),
  'a loss is explained in plain words, not a minus sign'
);

const breakEven = calculateNetProfit(900, 900);
equal(breakEven.net_profit, 0, 'break-even is exactly zero');
equal(breakEven.is_loss, false, 'break-even is not a loss');
check(breakEven.statement.includes('broke even'), 'break-even says so');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: no expenses recorded is not the same as no costs');
console.log('========================================');

const noData = calculateNetProfit(2400, 0);
equal(noData.net_profit, 2400, 'net equals gross when nothing was recorded');
equal(noData.has_expense_data, false, 'flags that there is no expense data');
check(
  noData.statement.includes('No expenses recorded yet'),
  'says nothing was recorded rather than implying it was all kept'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: an empty period does not crash');
console.log('========================================');

const empty = calculateExpenseSummary([], WEEK.start, WEEK.end);
equal(empty.total, 0, 'empty total is zero, not NaN');
equal(empty.count, 0, 'empty count is zero');
equal(empty.biggest, null, 'no biggest category when there is nothing');
equal(empty.by_category.length, 0, 'no categories listed');

// Share must not divide by zero.
check(
  calculateExpenseSummary([], WEEK.start, WEEK.end).by_category.every(c => !Number.isNaN(c.share)),
  'share never becomes NaN'
);

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: cents do not drift');
console.log('========================================');

const cents = calculateExpenseSummary([
  expense({ category: 'OTHER', amount: 0.1 }),
  expense({ category: 'OTHER', amount: 0.2 }),
], WEEK.start, WEEK.end);
equal(cents.total, 0.3, 'repeated addition is rounded to cents');

const netCents = calculateNetProfit(0.3, 0.1);
equal(netCents.net_profit, 0.2, 'net subtraction is rounded to cents');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: stock is not an expense category');
console.log('========================================');

// Buying stock is already the cost side of gross profit. A STOCK category
// here would charge the owner twice and fake a loss.
check(
  !(EXPENSE_CATEGORIES as readonly string[]).includes('STOCK'),
  'there is no STOCK category to double-count deliveries with'
);

check(
  EXPENSE_CATEGORIES.every(c => CATEGORY_LABELS[c] != null && CATEGORY_LABELS[c] !== ''),
  'every category has a human label'
);
check(
  EXPENSE_CATEGORIES.every(c => CATEGORY_ICONS[c] != null && CATEGORY_ICONS[c] !== ''),
  'every category has an icon'
);

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all expense assertions held');
