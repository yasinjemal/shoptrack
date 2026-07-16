/**
 * ============================================
 * SHOPTRACK EXPENSES ENGINE
 * ============================================
 *
 * What the shop pays out to stay open: rent, electricity, transport, wages,
 * airtime.
 *
 * WHY THIS EXISTS
 * ---------------
 * calculations.ts answers "did the stock make money?" -- revenue minus what
 * the goods cost. That is gross profit, and on its own it flatters the shop.
 * An owner who sees "R2,400 profit" but paid R500 rent and R300 for transport
 * did not make R2,400. They made R1,600.
 *
 * The pilot asks "does this feel right?". An owner who cleared R1,600 and is
 * shown R2,400 will trust the app less, not more. Expenses close that gap.
 *
 *   gross profit  (calculations.ts)  = revenue - cost of goods sold
 *   expenses      (this module)      = what else was paid out
 *   net profit                       = gross - expenses   <- the real answer
 *
 * ⚠️  STOCK PURCHASES ARE NOT EXPENSES.
 *
 * Buying stock is already the cost side of gross profit: every unit sold is
 * valued at its buy_price. Counting a delivery here as well would charge the
 * owner twice for the same goods and invent a loss that never happened. There
 * is deliberately no 'STOCK' category, and the database CHECK enforces it.
 *
 * Like the other engines here, this module is pure: no SQLite, no side effects.
 */

// ============================================
// TYPES
// ============================================

/**
 * Fixed list, not free text.
 *
 * Free text would give every shop its own spelling of "electricity" and make
 * totals-by-category meaningless. These six cover what a spaza shop actually
 * pays, and OTHER absorbs the rest rather than blocking the entry.
 */
export const EXPENSE_CATEGORIES = [
  'RENT',
  'ELECTRICITY',
  'TRANSPORT',
  'WAGES',
  'AIRTIME',
  'OTHER',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface Expense {
  id: number;
  category: ExpenseCategory;
  amount: number;
  notes?: string;
  recorded_at: number;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
  /** Share of all expenses in the period, 0-100. */
  share: number;
}

export interface ExpenseSummary {
  total: number;
  count: number;
  by_category: CategoryTotal[];   // Biggest first
  biggest: CategoryTotal | null;
}

export interface NetProfit {
  gross_profit: number;
  expenses: number;
  net_profit: number;

  /** True when expenses swallowed the whole margin. */
  is_loss: boolean;
  /**
   * False when no expenses were recorded for the period. The net figure is
   * then just the gross figure, which is only true if the shop really has no
   * costs -- so callers should say "no expenses recorded" rather than imply
   * the owner kept everything.
   */
  has_expense_data: boolean;

  statement: NetProfitStatement;
}

export type NetProfitStatement =
  | { kind: 'no_expenses'; gross_profit: number }
  | { kind: 'loss'; loss: number }
  | { kind: 'break_even' }
  | { kind: 'profit'; gross_profit: number; expenses: number; net_profit: number };

// ============================================
// SUMMARY
// ============================================

export function calculateExpenseSummary(
  expenses: Expense[],
  period_start: number,
  period_end: number
): ExpenseSummary {
  const inPeriod = expenses.filter(
    e => e.recorded_at >= period_start && e.recorded_at <= period_end
  );

  const total = round2(inPeriod.reduce((sum, e) => sum + e.amount, 0));

  const by_category: CategoryTotal[] = EXPENSE_CATEGORIES
    .map(category => {
      const mine = inPeriod.filter(e => e.category === category);
      const categoryTotal = round2(mine.reduce((sum, e) => sum + e.amount, 0));
      return {
        category,
        total: categoryTotal,
        count: mine.length,
        share: total > 0 ? Math.round((categoryTotal / total) * 100) : 0,
      };
    })
    .filter(c => c.count > 0)
    .sort((a, b) => b.total - a.total);

  return {
    total,
    count: inPeriod.length,
    by_category,
    biggest: by_category.length > 0 ? by_category[0] : null,
  };
}

// ============================================
// NET PROFIT -- the number the owner actually wants
// ============================================

/**
 * Combine gross profit with expenses.
 *
 * `grossProfit` must come from calculations.ts for the same period, and
 * `expenseTotal` from calculateExpenseSummary over that same window.
 * Mismatched periods produce a number that is confidently wrong.
 */
export function calculateNetProfit(
  grossProfit: number,
  expenseTotal: number
): NetProfit {
  const gross_profit = round2(grossProfit);
  const expenses = round2(expenseTotal);
  const net_profit = round2(gross_profit - expenses);

  return {
    gross_profit,
    expenses,
    net_profit,
    is_loss: net_profit < 0,
    has_expense_data: expenses > 0,
    statement: describeNet(gross_profit, expenses, net_profit),
  };
}

function describeNet(gross: number, expenses: number, net: number): NetProfitStatement {
  if (expenses === 0) {
    return { kind: 'no_expenses', gross_profit: gross };
  }

  if (net < 0) {
    return { kind: 'loss', loss: Math.abs(net) };
  }

  if (net === 0) {
    return { kind: 'break_even' };
  }

  return { kind: 'profit', gross_profit: gross, expenses, net_profit: net };
}

// ============================================
// DISPLAY HELPERS
// ============================================

/**
 * Category keys are stable identifiers stored in the database; this maps them
 * to something an owner reads. Kept here so every screen labels them the same.
 */
export const CATEGORY_ICONS: Record<ExpenseCategory, string> = {
  RENT: '🏠',
  ELECTRICITY: '💡',
  TRANSPORT: '🚕',
  WAGES: '👷',
  AIRTIME: '📱',
  OTHER: '📌',
};

// ============================================
// HELPERS
// ============================================

/**
 * Money is stored as REAL, so repeated addition drifts
 * (0.1 + 0.2 = 0.30000000000000004). Round at the boundary so a total never
 * renders as R449.99999999999994.
 */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
