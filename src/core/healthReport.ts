import type { CreditEntry } from './credit';
import type { AppProduct, CashUp } from './db';
import { localDayKey } from './safety';

export interface BusinessHealthReport {
  period_days: number;
  count_sessions: number;
  unique_count_days: number;
  average_known_margin_pct: number | null;
  priced_products: number;
  total_products: number;
  credit_given: number;
  credit_repaid: number;
  repayment_pct: number | null;
  cash_ups: number;
  balanced_cash_ups: number;
  cash_up_discipline_pct: number | null;
  created_at: number;
}

export function calculateBusinessHealthReport(
  input: {
    countSessions: Array<{ completed_at: number }>;
    products: AppProduct[];
    creditEntries: CreditEntry[];
    cashUps: CashUp[];
  },
  now = Date.now(),
  periodDays = 90
): BusinessHealthReport {
  const since = now - periodDays * 24 * 60 * 60 * 1000;
  const counts = input.countSessions.filter(row => row.completed_at >= since && row.completed_at <= now);
  const credit = input.creditEntries.filter(row => row.recorded_at >= since && row.recorded_at <= now);
  const cashUps = input.cashUps.filter(row => !row.is_opening && row.recorded_at >= since && row.recorded_at <= now);
  const margins = input.products.flatMap(product => {
    if (product.buy_price == null || product.sell_price == null || product.sell_price <= 0) return [];
    return [((product.sell_price - product.buy_price) / product.sell_price) * 100];
  });
  const creditGiven = credit.filter(row => row.type === 'CREDIT').reduce((sum, row) => sum + row.amount, 0);
  const creditRepaid = credit.filter(row => row.type === 'PAYMENT').reduce((sum, row) => sum + row.amount, 0);
  const balanced = cashUps.filter(row => Math.abs(row.difference) <= 5).length;

  return {
    period_days: periodDays,
    count_sessions: counts.length,
    unique_count_days: new Set(counts.map(row => localDayKey(row.completed_at))).size,
    average_known_margin_pct: margins.length
      ? margins.reduce((sum, value) => sum + value, 0) / margins.length
      : null,
    priced_products: margins.length,
    total_products: input.products.length,
    credit_given: creditGiven,
    credit_repaid: creditRepaid,
    repayment_pct: creditGiven > 0 ? Math.min(100, (creditRepaid / creditGiven) * 100) : null,
    cash_ups: cashUps.length,
    balanced_cash_ups: balanced,
    cash_up_discipline_pct: cashUps.length ? (balanced / cashUps.length) * 100 : null,
    created_at: now,
  };
}
