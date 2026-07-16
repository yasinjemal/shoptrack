/** Render pure engine facts at the UI boundary. */

import type { TruthStatement } from '../core/calculations';
import type { CashUpStatement } from '../core/cashup';
import type { CreditStatement, OutstandingStatement } from '../core/credit';
import type { NetProfitStatement } from '../core/expenses';
import { formatMoney } from '../core/currency';
import { formatMonth, type SalesBookStatement, type SalesMonthStatement } from '../core/sales';
import type { Strings } from './index';

export function renderTruthStatement(statement: TruthStatement, strings: Strings): string {
  switch (statement.kind) {
    case 'no_data': return strings.STAT_TRUTH_NO_DATA(statement.product_name);
    case 'impossible_gain': return strings.STAT_TRUTH_IMPOSSIBLE_GAIN(statement.product_name);
    case 'loss': return strings.STAT_TRUTH_LOSS(statement.product_name);
    case 'incorrect': return strings.STAT_TRUTH_INCORRECT(statement.product_name);
    case 'no_sales': return strings.STAT_TRUTH_NO_SALES(statement.product_name);
    case 'sales': {
      const amount = formatMoney(Math.abs(statement.estimated_profit), 0);
      if (statement.estimated_profit < 0) {
        return strings.STAT_TRUTH_LOSING(statement.product_name, statement.estimated_sold, amount);
      }
      if (statement.confidence < 0.5) {
        return strings.STAT_TRUTH_SALES_ROUGH(statement.product_name, statement.estimated_sold, amount);
      }
      if (statement.confidence < 0.8) {
        return strings.STAT_TRUTH_SALES_ABOUT(statement.product_name, statement.estimated_sold, amount);
      }
      return strings.STAT_TRUTH_SALES(statement.product_name, statement.estimated_sold, amount);
    }
  }
}

export function renderCreditStatement(statement: CreditStatement, strings: Strings): string {
  switch (statement.kind) {
    case 'paid_up': return strings.STAT_CREDIT_PAID_UP(statement.customer_name);
    case 'change_owed': return strings.STAT_CREDIT_CHANGE(statement.customer_name, formatMoney(statement.amount));
    case 'owes': return strings.STAT_CREDIT_OWES(statement.customer_name, formatMoney(statement.amount));
    case 'overdue_today': return strings.STAT_CREDIT_OVERDUE_TODAY(statement.customer_name, formatMoney(statement.amount));
    case 'overdue': return strings.STAT_CREDIT_OVERDUE(statement.customer_name, formatMoney(statement.amount), statement.days);
    case 'stale': return strings.STAT_CREDIT_STALE(statement.customer_name, formatMoney(statement.amount), statement.days);
  }
}

export function renderOutstandingStatement(statement: OutstandingStatement, strings: Strings): string {
  return strings.STAT_OUTSTANDING(formatMoney(statement.amount), statement.people);
}

export function renderNetProfitStatement(statement: NetProfitStatement, strings: Strings): string {
  switch (statement.kind) {
    case 'no_expenses': return strings.STAT_NET_NO_EXPENSES(formatMoney(statement.gross_profit));
    case 'loss': return strings.STAT_NET_LOSS(formatMoney(statement.loss));
    case 'break_even': return strings.STAT_NET_BREAK_EVEN;
    case 'profit': return strings.STAT_NET_PROFIT(
      formatMoney(statement.gross_profit),
      formatMoney(statement.expenses),
      formatMoney(statement.net_profit)
    );
  }
}

export function renderCashUpStatement(statement: CashUpStatement, strings: Strings): string {
  switch (statement.kind) {
    case 'balanced': return strings.CASHUP_STATEMENT_BALANCED;
    case 'over': return strings.CASHUP_STATEMENT_OVER(formatMoney(statement.gap));
    case 'short_large': return strings.CASHUP_STATEMENT_SHORT_LARGE(formatMoney(statement.gap));
    case 'short_small': return strings.CASHUP_STATEMENT_SHORT_SMALL(formatMoney(statement.gap));
  }
}

export function renderSalesMonthStatement(
  statement: SalesMonthStatement,
  strings: Strings,
  locale?: string
): string {
  const month = formatMonth(statement.month_key, locale);
  if (statement.kind === 'empty') return strings.STAT_SALES_EMPTY(month);
  return statement.source === 'days'
    ? strings.STAT_SALES_DAYS(month, formatMoney(statement.sales), formatMoney(statement.profit), statement.days_recorded)
    : strings.STAT_SALES_MONTH(month, formatMoney(statement.sales), formatMoney(statement.profit));
}

export function renderSalesBookStatement(statement: SalesBookStatement, strings: Strings): string {
  return strings.STAT_SALES_BOOK(formatMoney(statement.profit), statement.months);
}
