import assert from 'node:assert/strict';
import { calculateBusinessHealthReport } from './healthReport';

const DAY = 24 * 60 * 60 * 1000;
const now = new Date(2026, 6, 16, 12).getTime();
const report = calculateBusinessHealthReport({
  countSessions: [{ completed_at: now - DAY }, { completed_at: now - DAY + 1000 }, { completed_at: now - 8 * DAY }],
  products: [
    { id: 1, name: 'A', unit_label: 'units', buy_price: 8, sell_price: 10, current_qty: 1 },
    { id: 2, name: 'B', unit_label: 'units', buy_price: null, sell_price: 5, current_qty: 1 },
  ],
  creditEntries: [
    { id: 1, customer_id: 1, type: 'CREDIT', amount: 100, recorded_at: now - DAY },
    { id: 2, customer_id: 1, type: 'PAYMENT', amount: 60, recorded_at: now - DAY },
  ],
  cashUps: [
    { id: 1, counted_amount: 100, expected_amount: 100, difference: 0, taken_out: 0, is_opening: false, recorded_at: now - DAY },
    { id: 2, counted_amount: 90, expected_amount: 100, difference: -10, taken_out: 0, is_opening: false, recorded_at: now - 2 * DAY },
  ],
}, now);

assert.equal(report.count_sessions, 3);
assert.equal(report.unique_count_days, 2);
assert.equal(report.average_known_margin_pct, 20);
assert.equal(report.repayment_pct, 60);
assert.equal(report.cash_up_discipline_pct, 50);

console.log('health report tests passed');
