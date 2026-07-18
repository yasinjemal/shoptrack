/**
 * ============================================
 * SHOPTRACK SALES BOOK ENGINE
 * ============================================
 *
 * The owner's own record: what the till took, and roughly what they keep of it.
 *
 * WHY THIS EXISTS
 * ---------------
 * Counting stock is the app's cleverest idea and its slowest. It needs two
 * counts before it can say anything, so a new owner waits days for their first
 * answer -- and gets nothing at all for the years they traded before installing.
 *
 * But most shop owners already keep a book. They know they took R1,400 on
 * Tuesday. What they do not know is what that earned. This module answers that
 * from what they already have:
 *
 *   profit = takings x margin%
 *
 * It is rougher than the count engine, and it is honest about that: the margin
 * is the owner's own estimate, so the answer is only as good as their guess.
 * What it buys is an answer today, and an answer for January.
 *
 * ⚠️  NEVER ADD THIS TO COUNTED PROFIT.
 *
 * calculations.ts and this module are two estimates of the SAME money, not two
 * different piles of it. A week that has both a stock count and a sales-book
 * entry made roughly one profit, not two. Sum them and the shop looks twice as
 * good as it is. They are shown as separate lenses on the same question:
 *
 *   "what does the shelf say I made?"  -> calculations.ts
 *   "what does my book say I made?"    -> this module
 *
 * Where they disagree, that gap is interesting -- it is shrinkage, or a bad
 * margin guess, or an unrecorded delivery. Reporting the disagreement is
 * useful. Adding them is a lie.
 *
 * Pure module: no SQLite, no side effects.
 */

// ============================================
// TYPES
// ============================================

export type SalesPeriod = 'DAY' | 'MONTH';

export interface SalesEntry {
  id: number;
  /** DAY = one day's takings. MONTH = a whole month, typed from a paper book. */
  period: SalesPeriod;
  /** Calendar label: 'YYYY-MM-DD' for a day, 'YYYY-MM' for a month. */
  period_key: string;
  /** What the till took. Gross takings, not profit. */
  amount: number;
  /** The owner's margin estimate at the time, 0-100. Snapshotted per entry. */
  margin_pct: number;
  notes?: string;
  recorded_at: number;
}

/** Where a month's number came from. Shown, because it changes how much to trust it. */
export type MonthSource = 'days' | 'month' | 'none';

export interface MonthlySales {
  /** 'YYYY-MM'. */
  month_key: string;
  sales: number;
  profit: number;
  /** Takings-weighted, so a month of days with differing margins still totals right. */
  margin_pct: number;

  source: MonthSource;
  /** How many individual days were entered. 0 for a month typed as one total. */
  days_recorded: number;
  /**
   * Both a month total AND individual days exist for this month. The days win,
   * but the owner is told, because one of the two is wrong.
   */
  has_conflict: boolean;

  statement: SalesMonthStatement;
}

export type SalesMonthStatement =
  | { kind: 'empty'; month_key: string }
  | {
      kind: 'summary';
      month_key: string;
      sales: number;
      profit: number;
      source: Exclude<MonthSource, 'none'>;
      days_recorded: number;
    };

export interface SalesBookStatement {
  kind: 'sales_book';
  profit: number;
  months: number;
}

export interface SalesChange {
  /** Current period minus the comparison period. */
  amount: number;
  /** Null when the earlier period is zero, because a percentage is undefined. */
  percent: number | null;
  direction: 'up' | 'down' | 'same';
}

export interface DailySalesStatistic {
  day_key: string;
  sales: number;
  profit: number;
}

export interface SalesMonthComparison {
  current: Pick<MonthlySales, 'month_key' | 'sales' | 'profit'>;
  previous: Pick<MonthlySales, 'month_key' | 'sales' | 'profit'>;
  sales_change: SalesChange;
  profit_change: SalesChange;
}

export interface SalesYearToDatePeriod {
  year: number;
  sales: number;
  profit: number;
  /** Missing months are unknown, never silently treated as zero. */
  months_recorded: number;
}

export interface SalesYearToDateStatistic {
  /** Calendar month number (1-12) covered by both sides of the comparison. */
  through_month: number;
  current: SalesYearToDatePeriod;
  previous: SalesYearToDatePeriod | null;
  sales_change: SalesChange | null;
  profit_change: SalesChange | null;
}

export interface SalesStatistics {
  /** Newest recorded month; the UI labels this explicitly. */
  month_key: string;
  /** Only individual day entries can truthfully identify a best/quietest day. */
  highest_day: DailySalesStatistic | null;
  lowest_day: DailySalesStatistic | null;
  /** Only adjacent calendar months are compared. Gaps are not disguised. */
  month_over_month: SalesMonthComparison | null;
  year_to_date: SalesYearToDateStatistic;
}

export interface SalesHistory {
  /** Every month with data, newest first. */
  months: MonthlySales[];
  total_sales: number;
  total_profit: number;
  /** Across everything, takings-weighted. */
  average_margin_pct: number;
  months_recorded: number;
  /** Months where a total and individual days disagree about the same trading. */
  conflicts: MonthlySales[];
  /** Comparisons anchored to the newest recorded month; null for an empty book. */
  statistics: SalesStatistics | null;
}

/**
 * What a spaza shop typically keeps. Only a starting suggestion -- the owner's
 * own number always wins, and this is never used silently in a calculation.
 */
export const DEFAULT_MARGIN_PCT = 25;

// ============================================
// CALENDAR KEYS
// ============================================
//
// Keys are plain calendar labels, not timestamps. A month is not an instant;
// it is what the owner calls "January". Deriving these from a Date uses local
// time on purpose -- the shop's day is the owner's day, not UTC's.

export function dayKey(at: number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function monthKey(at: number | Date): string {
  const d = at instanceof Date ? at : new Date(at);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** The month a key belongs to. '2026-01-14' -> '2026-01'; a month key is itself. */
export function monthOf(key: string): string {
  return key.slice(0, 7);
}

/** 'YYYY-MM' -> a readable label, e.g. "January 2026". */
export function formatMonth(key: string, locale?: string): string {
  const [year, month] = key.split('-').map(Number);
  const d = new Date(year, month - 1, 1);
  return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

/**
 * Every month from `from` up to and including `to`, oldest first.
 *
 * Used to offer "which month are you filling in?" -- an owner backfilling from
 * January should not have to know the key format.
 */
export function monthsBetween(from: string, to: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);

  const out: string[] = [];
  let y = fy;
  let m = fm;
  // Guard against a reversed range rather than looping forever.
  while (y < ty || (y === ty && m <= tm)) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/**
 * Every day in a month, as day keys, oldest first.
 *
 * Day 0 of the next month is the last day of this one, so February and leap
 * years take care of themselves rather than needing a table of month lengths.
 */
export function daysInMonth(month_key: string): string[] {
  const [year, month] = month_key.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();

  const out: string[] = [];
  for (let d = 1; d <= last; d++) {
    out.push(`${month_key}-${pad(d)}`);
  }
  return out;
}

/** '2026-01-14' -> 14. The number the owner sees in their book. */
export function dayNumber(day_key: string): number {
  return Number(day_key.slice(8, 10));
}

/** '2026-01-14' -> 'Wed'. Helps an owner find their place against a paper book. */
export function weekdayLabel(day_key: string, locale?: string): string {
  const [y, m, d] = day_key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale, { weekday: 'short' });
}

/** Sunday-or-Saturday, for greying out the days a shop may not have opened. */
export function isWeekend(day_key: string): boolean {
  const [y, m, d] = day_key.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6;
}

/**
 * Whether a day has already happened. A backfill screen must not invite the
 * owner to record takings for next Tuesday.
 */
export function isFuture(day_key: string, now: number = Date.now()): boolean {
  return day_key > dayKey(now);
}

/** The twelve months of a year, oldest first. */
export function monthsOfYear(year: number): string[] {
  return monthsBetween(`${year}-01`, `${year}-12`);
}

// ============================================
// ONE MONTH
// ============================================

/**
 * Roll one calendar month up from whatever was recorded for it.
 *
 * A month is either detailed (days) or summarised (one total). If both exist,
 * the days win -- they are the finer record -- but has_conflict is raised so the
 * owner can fix it. Silently choosing one would hide a real contradiction about
 * the same trading.
 */
export function calculateMonth(month_key: string, entries: SalesEntry[]): MonthlySales {
  const days = entries.filter(e => e.period === 'DAY' && monthOf(e.period_key) === month_key);
  const total = entries.find(e => e.period === 'MONTH' && e.period_key === month_key);

  const has_conflict = days.length > 0 && total != null;
  const used: SalesEntry[] = days.length > 0 ? days : total ? [total] : [];

  if (used.length === 0) {
    return {
      month_key,
      sales: 0,
      profit: 0,
      margin_pct: 0,
      source: 'none',
      days_recorded: 0,
      has_conflict: false,
      statement: { kind: 'empty', month_key },
    };
  }

  const sales = round2(used.reduce((sum, e) => sum + e.amount, 0));
  // Profit per entry, then summed -- NOT total x average margin. Those differ
  // whenever margins vary, and per-entry is the one that is actually true.
  const profit = round2(used.reduce((sum, e) => sum + e.amount * (e.margin_pct / 100), 0));

  const margin_pct = sales > 0 ? round2((profit / sales) * 100) : 0;
  const source: MonthSource = days.length > 0 ? 'days' : 'month';

  return {
    month_key,
    sales,
    profit,
    margin_pct,
    source,
    days_recorded: days.length,
    has_conflict,
    statement: {
      kind: 'summary',
      month_key,
      sales,
      profit,
      source,
      days_recorded: days.length,
    },
  };
}

// ============================================
// THE WHOLE BOOK
// ============================================

/**
 * Every month the owner has recorded, and what it all adds up to.
 *
 * Months are derived from the entries themselves rather than from a range, so
 * a gap (a month with no trading, or one nobody filled in) simply is not listed
 * instead of appearing as a fake R0.
 */
export function calculateSalesHistory(entries: SalesEntry[]): SalesHistory {
  const keys = Array.from(new Set(entries.map(e => monthOf(e.period_key))));
  keys.sort().reverse(); // Newest first: this month is what gets looked at.

  const months = keys.map(k => calculateMonth(k, entries));

  const total_sales = round2(months.reduce((sum, m) => sum + m.sales, 0));
  const total_profit = round2(months.reduce((sum, m) => sum + m.profit, 0));

  return {
    months,
    total_sales,
    total_profit,
    average_margin_pct: total_sales > 0 ? round2((total_profit / total_sales) * 100) : 0,
    months_recorded: months.filter(m => m.source !== 'none').length,
    conflicts: months.filter(m => m.has_conflict),
    statistics: months[0] ? calculateSalesStatistics(entries, months[0].month_key) : null,
  };
}

/**
 * Derive comparisons without inventing data for days or months the owner did
 * not record. `focusMonth` is explicit so tests, historical backfills and the
 * UI all agree on the calendar boundary.
 */
export function calculateSalesStatistics(
  entries: SalesEntry[],
  focusMonth: string,
): SalesStatistics {
  const current = calculateMonth(focusMonth, entries);
  const previousKey = offsetMonth(focusMonth, -1);
  const previous = calculateMonth(previousKey, entries);

  const daily = entries
    .filter(entry => entry.period === 'DAY' && monthOf(entry.period_key) === focusMonth)
    .sort((a, b) => a.period_key.localeCompare(b.period_key))
    .map(entry => ({
      day_key: entry.period_key,
      sales: round2(entry.amount),
      profit: round2(entry.amount * (entry.margin_pct / 100)),
    }));

  // Keeping the first day on a tie makes the result deterministic and avoids
  // implying that two equal days can be ranked more precisely than the data.
  const highest_day = daily.reduce<DailySalesStatistic | null>(
    (best, candidate) => !best || candidate.sales > best.sales ? candidate : best,
    null,
  );
  const lowest_day = daily.reduce<DailySalesStatistic | null>(
    (best, candidate) => !best || candidate.sales < best.sales ? candidate : best,
    null,
  );

  const month_over_month = current.source !== 'none' && previous.source !== 'none'
    ? {
        current: monthComparisonPeriod(current),
        previous: monthComparisonPeriod(previous),
        sales_change: compareValues(current.sales, previous.sales),
        profit_change: compareValues(current.profit, previous.profit),
      }
    : null;

  const [year, through_month] = focusMonth.split('-').map(Number);
  const currentYtd = calculateYearToDate(entries, year, through_month);
  const previousYtd = calculateYearToDate(entries, year - 1, through_month);
  const hasPreviousYtd = previousYtd.months_recorded > 0;

  return {
    month_key: focusMonth,
    highest_day,
    lowest_day,
    month_over_month,
    year_to_date: {
      through_month,
      current: currentYtd,
      previous: hasPreviousYtd ? previousYtd : null,
      sales_change: hasPreviousYtd
        ? compareValues(currentYtd.sales, previousYtd.sales)
        : null,
      profit_change: hasPreviousYtd
        ? compareValues(currentYtd.profit, previousYtd.profit)
        : null,
    },
  };
}

/**
 * The one line for Home. Null when there is nothing to say, so no empty card.
 */
export function summariseSalesBook(history: SalesHistory): SalesBookStatement | null {
  if (history.months_recorded === 0) return null;
  return { kind: 'sales_book', profit: history.total_profit, months: history.months_recorded };
}

// ============================================
// HELPERS
// ============================================

/** Money is REAL, so a year of daily entries drifts. Round at the boundary. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function monthComparisonPeriod(
  month: MonthlySales,
): Pick<MonthlySales, 'month_key' | 'sales' | 'profit'> {
  return { month_key: month.month_key, sales: month.sales, profit: month.profit };
}

function compareValues(current: number, previous: number): SalesChange {
  const amount = round2(current - previous);
  return {
    amount,
    percent: previous === 0
      ? (current === 0 ? 0 : null)
      : round1((amount / previous) * 100),
    direction: amount > 0 ? 'up' : amount < 0 ? 'down' : 'same',
  };
}

function calculateYearToDate(
  entries: SalesEntry[],
  year: number,
  throughMonth: number,
): SalesYearToDatePeriod {
  const months = monthsBetween(`${year}-01`, `${year}-${pad(throughMonth)}`)
    .map(key => calculateMonth(key, entries))
    .filter(month => month.source !== 'none');

  return {
    year,
    sales: round2(months.reduce((sum, month) => sum + month.sales, 0)),
    profit: round2(months.reduce((sum, month) => sum + month.profit, 0)),
    months_recorded: months.length,
  };
}

function offsetMonth(key: string, offset: number): string {
  const [year, month] = key.split('-').map(Number);
  const zeroBased = year * 12 + month - 1 + offset;
  return `${Math.floor(zeroBased / 12)}-${pad((zeroBased % 12 + 12) % 12 + 1)}`;
}
