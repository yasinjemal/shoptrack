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

/**
 * How a payment arrived. Recording only -- ShopTrack never moves money.
 * Undefined means unrecorded, which every payment before schema v8 is.
 */
export type PaymentMethod = 'CASH' | 'MOBILE_MONEY' | 'BANK' | 'OTHER';

export const PAYMENT_METHODS: PaymentMethod[] = ['CASH', 'MOBILE_MONEY', 'BANK', 'OTHER'];

export interface CreditEntry {
  id: number;
  customer_id: number;
  /** CREDIT = took goods (owes more). PAYMENT = paid (owes less). */
  type: 'CREDIT' | 'PAYMENT';
  /** Always positive; `type` carries the direction. */
  amount: number;
  notes?: string;
  /** How a PAYMENT arrived. Undefined = unrecorded. Meaningless on CREDIT rows. */
  payment_method?: PaymentMethod;
  /**
   * When the customer said they would pay, on a CREDIT entry.
   * Undefined means they did not say -- common, and fine.
   */
  due_at?: number;
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

  /**
   * When the oldest still-unpaid credit was promised for.
   * Null if they owe nothing, or never named a day.
   */
  due_at: number | null;
  /** They named a day, they still owe, and the day has passed. */
  is_overdue: boolean;
  /** Days past the promise; null unless overdue. */
  days_overdue: number | null;

  /** Structured summary rendered by the selected language/currency. */
  statement: CreditStatement;
}

export type CreditStatement =
  | { kind: 'paid_up'; customer_name: string }
  | { kind: 'change_owed'; customer_name: string; amount: number }
  | { kind: 'owes'; customer_name: string; amount: number }
  | { kind: 'overdue_today'; customer_name: string; amount: number }
  | { kind: 'overdue'; customer_name: string; amount: number; days: number }
  | { kind: 'stale'; customer_name: string; amount: number; days: number };

export interface OutstandingStatement {
  kind: 'outstanding';
  amount: number;
  people: number;
}

export interface CreditSummary {
  total_outstanding: number;   // Money out in the community right now
  customers_owing: number;
  customers_stale: number;
  customers_overdue: number;

  credit_given: number;        // Credit handed out in the period
  payments_received: number;   // Cash collected in the period
  cash_payments_received: number;
  digital_payments_received: number;

  /**
   * Only those with a non-zero balance, biggest debt first. Answers "who owes
   * me?" -- it is NOT the customer list. Do not render a screen from this.
   */
  owing: CustomerBalance[];
  /**
   * EVERY active customer, including the paid-up, biggest debt first.
   * This is the list screens render.
   *
   * The names matter here. This field was once called `all_balances` next to a
   * plain `balances`, and it was not obvious which one a screen should use. The
   * screen picked the filtered one, so a newly added person -- balance zero --
   * was filtered out and vanished the instant they were created, with no way to
   * ever give them credit. Shipped, and found by a shop owner on a real phone.
   */
  everyone: CustomerBalance[];
  stale_debts: CustomerBalance[];
  /** Owing, past a day they named. A broken promise, not just silence. */
  overdue_debts: CustomerBalance[];
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

  const oldestUnpaid = balance > 0 ? findOldestUnpaidCredit(mine, total_paid) : null;
  const due_at = oldestUnpaid?.due_at ?? null;

  const is_overdue = balance > 0 && due_at != null && due_at < now;
  const days_overdue = is_overdue
    ? Math.floor((now - due_at!) / MS_PER_DAY)
    : null;

  return {
    customer_id: customer.id,
    customer_name: customer.name,
    total_credit: round2(total_credit),
    total_paid: round2(total_paid),
    balance,
    last_activity_at,
    days_since_activity,
    is_stale,
    due_at,
    is_overdue,
    days_overdue,
    statement: describeBalance(customer.name, balance, days_since_activity, is_overdue, days_overdue),
  };
}

/**
 * Find the oldest credit the customer has not yet paid off.
 *
 * Payments settle oldest debts first -- that is how a shop book works, and it
 * is what the owner means by "she still hasn't paid for the bread". The ledger
 * does not record which payment covers which debt, so allocate here: walk the
 * credits oldest-first, consuming the payment total, and return the first one
 * not fully covered.
 *
 * Without this, a customer who took credit in January (paid) and again in March
 * would look overdue against January's promise forever.
 */
function findOldestUnpaidCredit(
  entries: CreditEntry[],
  totalPaid: number
): CreditEntry | null {
  const credits = entries
    .filter(e => e.type === 'CREDIT')
    .sort((a, b) => a.recorded_at - b.recorded_at);

  let unallocated = totalPaid;
  for (const credit of credits) {
    if (unallocated >= credit.amount) {
      unallocated -= credit.amount;
      continue;
    }
    return credit;
  }
  return null;
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
  daysSinceActivity: number | null,
  isOverdue: boolean,
  daysOverdue: number | null
): CreditStatement {
  if (balance === 0) {
    return { kind: 'paid_up', customer_name: name };
  }

  if (balance < 0) {
    return { kind: 'change_owed', customer_name: name, amount: Math.abs(balance) };
  }

  // A broken promise is more specific than silence, so it is worth saying first.
  if (isOverdue && daysOverdue != null) {
    return daysOverdue === 0
      ? { kind: 'overdue_today', customer_name: name, amount: balance }
      : { kind: 'overdue', customer_name: name, amount: balance, days: daysOverdue };
  }

  if (daysSinceActivity != null && daysSinceActivity >= STALE_AFTER_DAYS) {
    return { kind: 'stale', customer_name: name, amount: balance, days: daysSinceActivity };
  }

  return { kind: 'owes', customer_name: name, amount: balance };
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
  // Everyone, biggest debt first, paid-up customers last but still present.
  const everyone = customers
    .map(c => calculateCustomerBalance(c, entries, now))
    .sort((a, b) => b.balance - a.balance);

  const owing = everyone.filter(b => b.balance !== 0);

  const inPeriod = entries.filter(
    e => e.recorded_at >= period_start && e.recorded_at <= period_end
  );

  const stale_debts = owing.filter(b => b.is_stale);
  const overdue_debts = owing
    .filter(b => b.is_overdue)
    .sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0));

  const periodPayments = inPeriod.filter(e => e.type === 'PAYMENT');
  const digitalPayments = periodPayments.filter(
    e => e.payment_method === 'MOBILE_MONEY' || e.payment_method === 'BANK'
  );
  const cashPayments = periodPayments.filter(
    e => e.payment_method !== 'MOBILE_MONEY' && e.payment_method !== 'BANK'
  );

  return {
    total_outstanding: round2(
      owing.reduce((sum, b) => sum + Math.max(0, b.balance), 0)
    ),
    customers_owing: owing.filter(b => b.balance > 0).length,
    customers_stale: stale_debts.length,
    customers_overdue: overdue_debts.length,
    credit_given: round2(sumOf(inPeriod, 'CREDIT')),
    payments_received: round2(sumOf(inPeriod, 'PAYMENT')),
    cash_payments_received: round2(cashPayments.reduce((sum, e) => sum + e.amount, 0)),
    digital_payments_received: round2(digitalPayments.reduce((sum, e) => sum + e.amount, 0)),
    owing,
    everyone,
    stale_debts,
    overdue_debts,
  };
}

/**
 * One line for Home, sized to what is actually happening.
 * Returns null when there is nothing worth saying.
 */
export function summariseOutstanding(summary: CreditSummary): OutstandingStatement | null {
  if (summary.total_outstanding <= 0) return null;
  return {
    kind: 'outstanding',
    amount: summary.total_outstanding,
    people: summary.customers_owing,
  };
}

// ============================================
// WHEN WILL THEY PAY?
// ============================================

export type DueOptionKey = 'friday' | 'end_of_month' | 'two_weeks' | 'unknown';

export interface DueOption {
  key: DueOptionKey;
  /** null means they did not say. */
  at: number | null;
}

/**
 * The handful of answers a customer actually gives to "when will you pay?".
 *
 * Deliberately not a calendar. A date picker is slow at a counter with a queue,
 * needs a native module, and asks for precision nobody has -- people say "month
 * end" or "Friday", not "the 27th". These four cover it, and "not sure" must
 * stay, or the owner skips the whole question and records nothing.
 *
 * Times land at the END of the named day, so a debt promised for Friday is not
 * overdue at nine on Friday morning.
 */
export function dueDateOptions(now: number = Date.now()): DueOption[] {
  const d = new Date(now);

  // (5 - day + 7) % 7 lands on Friday; 0 when today already is Friday.
  const daysUntilFriday = (5 - d.getDay() + 7) % 7;
  const friday = endOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + daysUntilFriday));

  // Day 0 of next month is the last day of this one.
  const endOfMonth = endOfDay(new Date(d.getFullYear(), d.getMonth() + 1, 0));

  const twoWeeks = endOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + 14));

  return [
    { key: 'friday', at: friday },
    { key: 'end_of_month', at: endOfMonth },
    { key: 'two_weeks', at: twoWeeks },
    { key: 'unknown', at: null },
  ];
}

function endOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();
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
