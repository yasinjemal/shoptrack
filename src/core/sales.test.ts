/**
 * ============================================
 * SHOPTRACK SALES BOOK TESTS
 * ============================================
 *
 * Run with: npm run test:sales
 */

import {
  calculateMonth,
  calculateSalesHistory,
  summariseSalesBook,
  dayKey,
  dayNumber,
  daysInMonth,
  isFuture,
  isWeekend,
  monthKey,
  monthOf,
  monthsBetween,
  monthsOfYear,
  formatMonth,
  weekdayLabel,
  DEFAULT_MARGIN_PCT,
  type SalesEntry,
} from './sales';

let failures = 0;

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`);
  }
}

function check(condition: boolean, label: string) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

let nextId = 1;
function day(key: string, amount: number, margin = 25): SalesEntry {
  return { id: nextId++, period: 'DAY', period_key: key, amount, margin_pct: margin, recorded_at: 0 };
}
function month(key: string, amount: number, margin = 25): SalesEntry {
  return { id: nextId++, period: 'MONTH', period_key: key, amount, margin_pct: margin, recorded_at: 0 };
}

// ============================================
console.log('========================================');
console.log('TEST: calendar keys are the owner\'s calendar');
console.log('========================================');

// Local time on purpose: the shop's day is the owner's day, not UTC's.
const wed = new Date(2026, 0, 14, 9, 30);
equal(dayKey(wed), '2026-01-14', 'a day key is the local calendar day');
equal(monthKey(wed), '2026-01', 'a month key is the local calendar month');
equal(monthOf('2026-01-14'), '2026-01', 'a day belongs to its month');
equal(monthOf('2026-01'), '2026-01', 'a month key is its own month');

// Late-night trading must not slide into tomorrow via a UTC conversion.
equal(dayKey(new Date(2026, 0, 14, 23, 45)), '2026-01-14', 'a late-night sale stays on its own day');
equal(dayKey(new Date(2026, 0, 1, 0, 15)), '2026-01-01', 'an early-morning sale stays on its own day');

check(formatMonth('2026-01', 'en-ZA').includes('2026'), 'a month formats with its year');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: backfilling January to July');
console.log('========================================');

// The scenario this feature exists for: install in July, but the paper book
// goes back to January.
const range = monthsBetween('2026-01', '2026-07');
equal(range.length, 7, 'January to July offers seven months');
equal(range[0], '2026-01', 'starts at January');
equal(range[6], '2026-07', 'ends at July, inclusive');

// A backfill that crosses a year boundary must not skip or repeat.
const crossYear = monthsBetween('2025-11', '2026-02');
equal(crossYear.length, 4, 'November to February spans four months');
equal(crossYear.join(','), '2025-11,2025-12,2026-01,2026-02', 'and rolls the year correctly');

// A reversed range yields nothing rather than looping forever.
equal(monthsBetween('2026-07', '2026-01').length, 0, 'a backwards range is empty, not infinite');
equal(monthsBetween('2026-03', '2026-03').length, 1, 'a single month is one month');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a month typed from the paper book');
console.log('========================================');

const january = calculateMonth('2026-01', [month('2026-01', 48000, 25)]);
equal(january.sales, 48000, 'takings come straight from the book');
equal(january.profit, 12000, 'profit is takings x margin: 48000 x 25%');
equal(january.margin_pct, 25, 'the margin is reported back');
equal(january.source, 'month', 'the source is a month total');
equal(january.days_recorded, 0, 'no individual days');
equal(january.has_conflict, false, 'nothing to conflict with');
equal(january.statement.kind, 'summary', 'the statement is a structured summary');
check(january.statement.kind === 'summary' && january.statement.sales === 48000, 'the statement carries takings');
check(january.statement.kind === 'summary' && january.statement.profit === 12000, 'and the profit');
check(january.statement.kind === 'summary' && january.statement.source === 'month', 'and says where the number came from');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a month recorded day by day');
console.log('========================================');

const daily = calculateMonth('2026-07', [
  day('2026-07-01', 1400, 25),
  day('2026-07-02', 1600, 25),
  day('2026-07-03', 1000, 25),
]);
equal(daily.sales, 4000, 'days add up');
equal(daily.profit, 1000, 'profit is 25% of the days');
equal(daily.source, 'days', 'the source is individual days');
equal(daily.days_recorded, 3, 'and it says how many');
check(daily.statement.kind === 'summary' && daily.statement.days_recorded === 3, 'the statement says how many days');

// Days from other months must not leak in.
const scoped = calculateMonth('2026-07', [
  day('2026-07-01', 1000),
  day('2026-06-30', 9999),
  day('2026-08-01', 9999),
]);
equal(scoped.sales, 1000, 'neighbouring months are not counted');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: margins that change are not averaged away');
console.log('========================================');

// Profit is summed per entry, not total x average margin. Those differ the
// moment margins vary, and per-entry is the one that is true.
const mixed = calculateMonth('2026-07', [
  day('2026-07-01', 1000, 10),  // R100
  day('2026-07-02', 1000, 50),  // R500
]);
equal(mixed.sales, 2000, 'takings add up');
equal(mixed.profit, 600, 'each day earns at its own margin: 100 + 500');
equal(mixed.margin_pct, 30, 'the reported margin is takings-weighted');

// A zero margin is legitimate: airtime is sold at almost no mark-up.
const noMargin = calculateMonth('2026-07', [day('2026-07-01', 5000, 0)]);
equal(noMargin.profit, 0, 'a zero margin earns nothing, and is not an error');
equal(noMargin.sales, 5000, 'but the takings still count');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a month total and its days disagree');
console.log('========================================');

// Both describe the SAME trading. Adding them would count July twice.
const clash = calculateMonth('2026-07', [
  month('2026-07', 40000, 25),
  day('2026-07-01', 1400, 25),
  day('2026-07-02', 1600, 25),
]);
equal(clash.has_conflict, true, 'the clash is reported, not hidden');
equal(clash.source, 'days', 'the finer record wins');
equal(clash.sales, 3000, 'only the days are counted');
check(clash.sales !== 43000, 'the month total is NOT added to its own days');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: an empty month is empty, not zero');
console.log('========================================');

const nothing = calculateMonth('2026-02', []);
equal(nothing.source, 'none', 'no data is its own state');
equal(nothing.sales, 0, 'no takings');
equal(nothing.profit, 0, 'no profit, and not NaN');
equal(nothing.margin_pct, 0, 'no margin to report');
equal(nothing.statement.kind, 'empty', 'and it says so plainly');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: the whole book, January to July');
console.log('========================================');

const book: SalesEntry[] = [
  month('2026-01', 48000, 25),
  month('2026-02', 44000, 25),
  month('2026-03', 50000, 20),
  // April was not filled in.
  month('2026-05', 46000, 25),
  month('2026-06', 52000, 30),
  // July is being kept day by day now that the app is installed.
  day('2026-07-01', 1400, 25),
  day('2026-07-02', 1600, 25),
];

const history = calculateSalesHistory(book);

equal(history.months.length, 6, 'six months have data; April is not invented as R0');
equal(history.months[0].month_key, '2026-07', 'newest month first');
equal(history.months[5].month_key, '2026-01', 'oldest month last');

// 48000+44000+50000+46000+52000+3000
equal(history.total_sales, 243000, 'all takings across the book');
// 12000 + 11000 + 10000 + 11500 + 15600 + 750
equal(history.total_profit, 60850, 'all profit to date, each month at its own margin');
equal(history.months_recorded, 6, 'counts months that actually have data');
equal(history.conflicts.length, 0, 'no conflicts in a clean book');

const jan = history.months.find(m => m.month_key === '2026-01')!;
equal(jan.profit, 12000, 'January profit is R12,000 — the question that started this');

const mar = history.months.find(m => m.month_key === '2026-03')!;
equal(mar.profit, 10000, 'March used its own 20% margin, not the book average');

check(history.average_margin_pct > 24 && history.average_margin_pct < 26, 'average margin is weighted, not a mean of margins');

equal(summariseSalesBook(history)?.profit, 60850, 'the Home summary carries profit as data');
equal(summariseSalesBook(history)?.months, 6, 'the Home summary carries its month count');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: an empty book says nothing');
console.log('========================================');

const empty = calculateSalesHistory([]);
equal(empty.months.length, 0, 'no months');
equal(empty.total_profit, 0, 'no profit, and not NaN');
equal(empty.average_margin_pct, 0, 'no margin to average');
equal(summariseSalesBook(empty), null, 'no card on Home when there is nothing to show');

const onlyMonth = calculateSalesHistory([month('2026-01', 1000, 25)]);
equal(summariseSalesBook(onlyMonth)?.months, 1, 'a single month stays a numeric count for translation');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: cents do not drift');
console.log('========================================');

const cents = calculateMonth('2026-07', [
  day('2026-07-01', 0.1, 100),
  day('2026-07-02', 0.2, 100),
]);
equal(cents.sales, 0.3, 'takings are rounded to cents');
equal(cents.profit, 0.3, 'profit is rounded to cents');

check(DEFAULT_MARGIN_PCT > 0 && DEFAULT_MARGIN_PCT < 100, 'the suggested margin is a sane percentage');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: opening a month shows its days');
console.log('========================================');

const jan2026 = daysInMonth('2026-01');
equal(jan2026.length, 31, 'January has 31 days');
equal(jan2026[0], '2026-01-01', 'starts on the 1st');
equal(jan2026[30], '2026-01-31', 'ends on the 31st');

// Month lengths are derived, not tabulated, so February looks after itself.
equal(daysInMonth('2026-02').length, 28, 'February 2026 has 28 days');
equal(daysInMonth('2024-02').length, 29, 'February 2024 is a leap year');
equal(daysInMonth('2000-02').length, 29, 'the year 2000 is a leap year');
equal(daysInMonth('1900-02').length, 28, '1900 is not, despite dividing by 4');
equal(daysInMonth('2026-04').length, 30, 'April has 30 days');
equal(daysInMonth('2026-12').length, 31, 'December has 31 days');

equal(dayNumber('2026-01-14'), 14, 'a day key reads back its own number');
equal(dayNumber('2026-01-01'), 1, 'the 1st is 1, not 01');

// 1 January 2026 is a Thursday.
check(weekdayLabel('2026-01-01', 'en-ZA').startsWith('Thu'), 'weekday labels are real weekdays');
equal(isWeekend('2026-01-03'), true, 'Saturday is a weekend');
equal(isWeekend('2026-01-04'), true, 'Sunday is a weekend');
equal(isWeekend('2026-01-05'), false, 'Monday is not');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: you cannot record next Tuesday');
console.log('========================================');

const todayLocal = new Date(2026, 6, 15, 12, 0, 0).getTime();
equal(isFuture('2026-07-16', todayLocal), true, 'tomorrow is in the future');
equal(isFuture('2026-07-15', todayLocal), false, 'today is not the future');
equal(isFuture('2026-07-14', todayLocal), false, 'yesterday is not the future');
equal(isFuture('2026-08-01', todayLocal), true, 'next month is the future');
equal(isFuture('2025-12-31', todayLocal), false, 'last year is not the future');

// ============================================
console.log('');
console.log('========================================');
console.log('TEST: a year of months to choose from');
console.log('========================================');

const year = monthsOfYear(2026);
equal(year.length, 12, 'a year has twelve months');
equal(year[0], '2026-01', 'starts at January');
equal(year[11], '2026-12', 'ends at December');
check(year.every(k => k.startsWith('2026-')), 'and they all belong to that year');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} assertion(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all sales book assertions held');
