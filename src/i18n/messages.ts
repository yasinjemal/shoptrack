import { formatMoney } from '../core/currency';
import type { ShareMessage } from '../core/messages';
import type { PaymentMethod } from '../core/credit';
import { paymentMethodLabel } from '../core/countryPacks';
import { shopSignature } from '../core/shopProfile';

export interface ShareStrings {
  SHARE_CREDIT_OVERDUE: (name: string, amount: string, days: number) => string;
  SHARE_CREDIT_REMINDER: (name: string, amount: string, days: number | null) => string;
  SHARE_PAYMENT_RECEIPT: (name: string, amount: string, method: string, remaining: string, when: string) => string;
  SHARE_COUNT_SUMMARY: (units: number, profit: string, counts: number) => string;
  SHARE_CASHUP_VERDICT: (verdict: 'balanced' | 'short' | 'over') => string;
  SHARE_CASHUP_SUMMARY: (verdict: string, counted: string, expected: string, gap: string, digital: string) => string;
  SHARE_SIGNOFF: (shop: string) => string;
  CREDIT_PAYMENT_METHOD_LABEL: (method: PaymentMethod) => string;
  FORMAT_WHEN: (ts: number) => string;
}

/**
 * Every shared message is signed with the shop's name when one is set --
 * read synchronously from the profile, exactly as formatMoney reads the
 * currency. A shop that has not named itself sends the message unchanged.
 */
export function renderShareMessage(message: ShareMessage, strings: ShareStrings): string {
  const body = renderShareBody(message, strings);
  const signature = shopSignature();
  return signature ? `${body}\n\n${strings.SHARE_SIGNOFF(signature)}` : body;
}

function renderShareBody(message: ShareMessage, strings: ShareStrings): string {
  switch (message.kind) {
    case 'credit_reminder':
      return message.days_overdue != null
        ? strings.SHARE_CREDIT_OVERDUE(message.customer_name, formatMoney(message.balance), message.days_overdue)
        : strings.SHARE_CREDIT_REMINDER(message.customer_name, formatMoney(message.balance), message.days_since_activity);
    case 'payment_receipt':
      return strings.SHARE_PAYMENT_RECEIPT(
        message.customer_name,
        formatMoney(message.amount),
        paymentMethodLabel(message.method, strings.CREDIT_PAYMENT_METHOD_LABEL(message.method)),
        formatMoney(Math.max(0, message.remaining_balance)),
        strings.FORMAT_WHEN(message.recorded_at)
      );
    case 'count_summary':
      return strings.SHARE_COUNT_SUMMARY(message.units_sold, formatMoney(message.profit), message.counts_used);
    case 'cashup_summary':
      return strings.SHARE_CASHUP_SUMMARY(
        strings.SHARE_CASHUP_VERDICT(message.verdict),
        formatMoney(message.counted),
        formatMoney(message.expected),
        formatMoney(Math.abs(message.difference)),
        formatMoney(message.digital_takings)
      );
  }
}
