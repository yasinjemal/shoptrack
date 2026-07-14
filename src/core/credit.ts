/**
 * ============================================
 * SHOPTRACK CREDIT ENGINE
 * ============================================
 *
 * The shop's book -- izikweletu. What customers owe, and what they have paid.
 *
 * WHY THIS EXISTS
 * ---------------
 * ShopTrack infers sales from stock movement: what left the shelf was sold.
 * That is true, but it is not the whole truth. When goods leave on credit, the
 * shelf empties and the app books a sale -- yet no cash arrived. Profit looks
 * healthy while the till stays empty.
 *
 * So profit and cash are two different questions:
 *
 *   "Did I make money?"     -> calculations.ts (stock-based, accrual)
 *   "Where is the money?"   -> this module (what is still owed)
 *
 * These are shown side by side, never subtracted from one another. Subtracting
 * would double-count: the profit figure already includes the credit sale, and
 * the debt is that same sale seen from the cash side. An owner needs both
 * numbers to be true at once.
 *
 * Like calculations.ts, this module is pure: no SQLite, no side effects.
 */

// ============================================
// TYPES
// ============================================

export interface Customer {
  id: number;
  name: string;
  phone?: string;
}

export interface CreditEntry {
  id: number;
  customer_id: number;
  /** CREDIT = took goods (owes more). PAYMENT = paid (owes less). */
  type: 'CREDIT' | 'PAYMENT';
  /** Always positive; `type` carries the direction. */
  amount: number;
  notes?: string;
  recorded_at: number;
}

export interface CustomerBalance {
  customer_id: number;
  customer_name: string;

  total_credit: number;   // Everything ever taken on credit
  total_paid: number;     // Everything ever paid back
  balance: number;        // What is owed right now (credit - paid)

  last_activity_at: number | null;
  /** Days since anything happened on this account; null if never used. */
  days_since_activity: number | null;
  /** Owing, and silent for a long time. The debts that quietly go bad. */
  is_stale: boolean;

  /** Plain-language summary, e.g. "Thandi owes R90". */
  statement: string;
}

export interface CreditSummary {
  total_outstanding: number;   // Money out in the community right now
  customers_owing: number;
  customers_stale: number;

  credit_given: number;        // Credit handed out in the period
  payments_received: number;   // Cash collected in the period

  balances: CustomerBalance[];  // Everyone with a balance, biggest debt first
  stale_debts: CustomerBalance[];
}

/**
 * A debt nobody has touched for this long is drifting. Chosen to be longer
 * than a typical month-end payday cycle, so the regular "pays when paid"
 * customer is never flagged.
 */
export const STALE_AFTER_DAYS = 45;

// ============================================
// BALANCE FOR ONE CUSTOMER
// ============================================

export function calculateCustomerBalance(
  customer: Customer,
  entries: CreditEntry[],
  now: number = Date.now()
): CustomerBalance {
  const mine = entries.filter(e => e.customer_id === customer.id);

  const total_credit = sumOf(mine, 'CREDIT');
  const total_paid = sumOf(mine, 'PAYMENT');
  const balance = round2(total_credit - total_paid);

  const last_activity_at = mine.length > 0
    ? mine.reduce((latest, e) => Math.max(latest, e.recorded_at), 0)
    : null;

  const days_since_activity = last_activity_at != null
    ? Math.floor((now - last_activity_at) / MS_PER_DAY)
    : null;

  const is_stale =
    balance > 0 &&
    days_since_activity != null &&
    days_since_activity >= STALE_AFTER_DAYS;

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    total_credit: round2(total_credit),
    total_paid: round2(total_paid),
    balance,
    last_activity_at,
    days_since_activity,
    is_stale,
    statement: describeBalance(customer.name, balance, days_since_activity),
  };
}

/**
 * Say what the balance means in words the owner would use.
 *
 * A negative balance is not an error: an owner may take a payment before the
 * goods are collected, or round a payment up. Say so plainly instead of
 * hiding it behind a minus sign.
 */
function describeBalance(
  name: string,
  balance: number,
  daysSinceActivity: number | null
): string {
  if (balance === 0) {
    return `${name} is all paid up.`;
  }

  if (balance < 0) {
    return `You owe ${name} R${Math.abs(balance).toFixed(2)} in change.`;
  }

  const owes = `${name} owes R${balance.toFixed(2)}`;

  if (daysSinceActivity != null && daysSinceActivity >= STALE_AFTER_DAYS) {
    return `${owes}, and has not paid anything for ${daysSinceActivity} days.`;
  }

  return `${owes}.`;
}

// ============================================
// SUMMARY ACROSS EVERYONE
// ============================================

/**
 * Everything the owner needs to see about the book.
 *
 * `period_start`/`period_end` scope only credit_given and payments_received --
 * "what moved this week". Balances are always the full lifetime of the
 * account, because a debt does not expire at a week boundary.
 */
export function calculateCreditSummary(
  customers: Customer[],
  entries: CreditEntry[],
  period_start: number,
  period_end: number,
  now: number = Date.now()
): CreditSummary {
  const balances = customers
    .map(c => calculateCustomerBalance(c, entries, now))
    .filter(b => b.balance !== 0)
    .sort((a, b) => b.balance - a.balance);

  const inPeriod = entries.filter(
    e => e.recorded_at >= period_start && e.recorded_at <= period_end
  );

  const stale_debts = balances.filter(b => b.is_stale);

  return {
    total_outstanding: round2(
      balances.reduce((sum, b) => sum + Math.max(0, b.balance), 0)
    ),
    customers_owing: balances.filter(b => b.balance > 0).length,
    customers_stale: stale_debts.length,
    credit_given: round2(sumOf(inPeriod, 'CREDIT')),
    payments_received: round2(sumOf(inPeriod, 'PAYMENT')),
    balances,
    stale_debts,
  };
}

/**
 * One line for Home, sized to what is actually happening.
 * Returns null when there is nothing worth saying.
 */
export function summariseOutstanding(summary: CreditSummary): string | null {
  if (summary.total_outstanding <= 0) return null;

  const amount = `R${summary.total_outstanding.toFixed(2)}`;
  const people = summary.customers_owing === 1 ? '1 person' : `${summary.customers_owing} people`;

  return `${amount} is owed to you by ${people}.`;
}

// ============================================
// HELPERS
// ============================================

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function sumOf(entries: CreditEntry[], type: CreditEntry['type']): number {
  return entries
    .filter(e => e.type === type)
    .reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Money is stored as REAL, so repeated addition drifts (0.1 + 0.2 = 0.30000000000000004).
 * Round at the boundary so a balance never reads R89.99999999999999.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
