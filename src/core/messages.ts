import type { CashUpResult } from './cashup';
import type { CustomerBalance, PaymentMethod } from './credit';

export type ShareMessage =
  | {
      kind: 'credit_reminder';
      customer_name: string;
      balance: number;
      days_since_activity: number | null;
      days_overdue: number | null;
    }
  | {
      kind: 'payment_receipt';
      customer_name: string;
      amount: number;
      method: PaymentMethod;
      remaining_balance: number;
      recorded_at: number;
    }
  | {
      kind: 'count_summary';
      units_sold: number;
      profit: number;
      counts_used: number;
    }
  | {
      kind: 'cashup_summary';
      verdict: CashUpResult['verdict'];
      counted: number;
      expected: number;
      difference: number;
      digital_takings: number;
    };

export function buildCreditReminder(balance: CustomerBalance): ShareMessage {
  if (balance.balance <= 0) throw new Error('A reminder requires an outstanding balance.');
  return {
    kind: 'credit_reminder',
    customer_name: balance.customer_name,
    balance: balance.balance,
    days_since_activity: balance.days_since_activity,
    days_overdue: balance.days_overdue,
  };
}

export function buildPaymentReceipt(
  customerName: string,
  amount: number,
  method: PaymentMethod,
  remainingBalance: number,
  recordedAt = Date.now()
): ShareMessage {
  if (amount <= 0) throw new Error('A receipt requires a positive amount.');
  return {
    kind: 'payment_receipt',
    customer_name: customerName,
    amount,
    method,
    remaining_balance: remainingBalance,
    recorded_at: recordedAt,
  };
}

export function buildCountSummary(unitsSold: number, profit: number, countsUsed: number): ShareMessage {
  return { kind: 'count_summary', units_sold: Math.max(0, unitsSold), profit, counts_used: Math.max(0, countsUsed) };
}

export function buildCashUpSummary(result: CashUpResult, digitalTakings: number): ShareMessage {
  return {
    kind: 'cashup_summary',
    verdict: result.verdict,
    counted: result.counted,
    expected: result.expected,
    difference: result.difference,
    digital_takings: Math.max(0, digitalTakings),
  };
}

