/**
 * ============================================
 * SHOPTRACK CASH-UP ENGINE
 * ============================================
 *
 * Count the till. Compare it to what should be there. Explain the gap.
 *
 * WHY THIS EXISTS
 * ---------------
 * This is the question the other three engines cannot answer on their own:
 *
 *   calculations.ts  "did the stock make money?"
 *   expenses.ts      "what do I keep after costs?"
 *   credit.ts        "what am I still owed?"
 *   cashup.ts        "is the money that should be here, here?"   <- this
 *
 * A shop can be profitable and still bleed cash. Stock walks, change is given
 * wrong, a sale goes in a pocket, an expense is paid and never written down.
 * None of that shows up in profit -- the stock left the shelf either way, so
 * the profit engine happily books the sale. Only counting the cash finds it.
 *
 * THE CASH TRAIL
 * --------------
 * Every one of these moves money in or out of the till:
 *
 *   opening            what was left in after the last cash-up
 *   + revenue          everything that left the shelf, at its selling price
 *   - credit given     goods that left WITHOUT cash coming in
 *   + payments         old debts settled today
 *   - expenses         rent, transport, wages paid from the till
 *   - stock purchases  deliveries paid for from the till
 *   = expected
 *
 * ⚠️  STOCK PURCHASES BELONG HERE, EVEN THOUGH THEY ARE NOT AN EXPENSE.
 *
 * expenses.ts deliberately excludes stock, because buying stock is already the
 * cost side of gross profit -- counting it twice would fake a loss. But cash is
 * a different question. Handing R280 to a supplier removes R280 from the till,
 * whatever the accounting says. Leave it out and every cash-up after a delivery
 * reports a shortfall the size of that delivery, and the owner goes looking for
 * a thief who does not exist.
 *
 * That is the whole trap: profit and cash disagree on what stock is, and both
 * are right.
 *
 * Pure module: no SQLite, no side effects.
 */

// ============================================
// TYPES
// ============================================

export interface CashFlowInputs {
  /** Till balance after the previous cash-up (counted minus anything removed). */
  opening: number;
  /** Sales at selling price for the window -- calculations.ts. */
  revenue: number;
  /** Portion of revenue received into a phone/bank rather than the drawer. */
  digitalTakings: number;
  /** Goods that left on credit, so no cash arrived -- credit.ts. */
  creditGiven: number;
  /** Debts settled in the window -- credit.ts. */
  paymentsReceived: number;
  /** Running costs paid in the window -- expenses.ts. */
  expenses: number;
  /** Deliveries paid for in the window -- calculations.ts total_stock_in_cost. */
  stockPurchases: number;
}

export type LineDirection = 'in' | 'out' | 'opening';

export interface CashLine {
  key: 'opening' | 'revenue' | 'digital_takings' | 'credit_given' | 'payments' | 'expenses' | 'stock';
  amount: number;
  direction: LineDirection;
}

export interface ExpectedCash {
  expected: number;
  /** Every step of the trail, in the order it should be read. */
  lines: CashLine[];
}

export type CashUpVerdict = 'balanced' | 'short' | 'over';
export type CashUpSeverity = 'fine' | 'small' | 'large';

export interface CashUpResult {
  counted: number;
  expected: number;
  /** counted - expected. Negative means money is missing. */
  difference: number;

  verdict: CashUpVerdict;
  severity: CashUpSeverity;
  statement: CashUpStatement;
}

export type CashUpStatement =
  | { kind: 'balanced' }
  | { kind: 'over'; gap: number }
  | { kind: 'short_large'; gap: number }
  | { kind: 'short_small'; gap: number };

/**
 * Cash never reconciles to the cent in a shop that gives change from a tin.
 * Anything inside this is noise, and calling it a shortfall would train the
 * owner to ignore the number entirely -- which costs them the one day it is
 * real.
 */
export const CASH_TOLERANCE = 20;

/**
 * Beyond this share of the money that moved, a gap stops being rounding and
 * starts being worth acting on.
 */
export const LARGE_GAP_SHARE = 0.05;

// ============================================
// EXPECTED CASH
// ============================================

export function calculateExpectedCash(i: CashFlowInputs): ExpectedCash {
  const expected = round2(
    i.opening
    + i.revenue
    - i.digitalTakings
    - i.creditGiven
    + i.paymentsReceived
    - i.expenses
    - i.stockPurchases
  );

  // Every line is shown, including zeros: an owner checking why the number is
  // wrong needs to see that "credit given" was counted and was nothing, not
  // guess whether it was considered at all.
  const lines: CashLine[] = [
    { key: 'opening', amount: round2(i.opening), direction: 'opening' },
    { key: 'revenue', amount: round2(i.revenue), direction: 'in' },
    { key: 'digital_takings', amount: round2(i.digitalTakings), direction: 'out' },
    { key: 'credit_given', amount: round2(i.creditGiven), direction: 'out' },
    { key: 'payments', amount: round2(i.paymentsReceived), direction: 'in' },
    { key: 'expenses', amount: round2(i.expenses), direction: 'out' },
    { key: 'stock', amount: round2(i.stockPurchases), direction: 'out' },
  ];

  return { expected, lines };
}

// ============================================
// RECONCILE
// ============================================

/**
 * Compare the counted till against expectation.
 *
 * `turnover` scales what counts as a large gap: R100 missing from a R200 day
 * is a disaster, from a R20,000 day it is a rounding error. Pass the cash that
 * actually moved through the till.
 */
export function reconcile(
  expected: number,
  counted: number,
  turnover: number = 0
): CashUpResult {
  const difference = round2(counted - expected);
  const gap = Math.abs(difference);

  const verdict: CashUpVerdict =
    gap <= CASH_TOLERANCE ? 'balanced' : difference < 0 ? 'short' : 'over';

  let severity: CashUpSeverity = 'fine';
  if (verdict !== 'balanced') {
    const threshold = Math.max(CASH_TOLERANCE, turnover * LARGE_GAP_SHARE);
    severity = gap > threshold ? 'large' : 'small';
  }

  return {
    counted: round2(counted),
    expected: round2(expected),
    difference,
    verdict,
    severity,
    statement: describe(verdict, severity, gap),
  };
}

/**
 * Explain the gap without accusing anyone.
 *
 * A shortfall has many innocent causes -- change given wrong, an expense paid
 * and not written down, a sale on credit not recorded. Leading with theft would
 * be wrong most of the time and would poison the owner's trust in the app the
 * first time it was wrong about their family. State the number, offer the
 * likely causes, let them draw the conclusion.
 */
function describe(verdict: CashUpVerdict, severity: CashUpSeverity, gap: number): CashUpStatement {
  if (verdict === 'balanced') {
    return { kind: 'balanced' };
  }

  if (verdict === 'over') {
    return { kind: 'over', gap };
  }

  if (severity === 'large') {
    return { kind: 'short_large', gap };
  }

  return { kind: 'short_small', gap };
}

// ============================================
// HELPERS
// ============================================

/**
 * How much cash actually moved through the till, used to scale what counts as
 * a large gap. Not the same as revenue: a day with a big delivery moves a lot
 * of money even if little was sold.
 */
export function cashTurnover(i: CashFlowInputs): number {
  return round2(
    Math.abs(i.revenue - i.creditGiven)
    + i.paymentsReceived
    + i.expenses
    + i.stockPurchases
  );
}

/**
 * Money is stored as REAL, so a six-line sum drifts. Round at the boundary or
 * a balanced till reports being R0.000000001 short.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
