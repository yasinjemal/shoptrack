import assert from 'node:assert/strict';

import { BACKUP_FORMAT_VERSION } from './db';
import {
  formatMoneyInCurrency,
  getCurrentCurrency,
  setCurrentCurrency,
} from './currency';
import { buildRemoteShopSnapshot } from './remoteViewer';

const backup = {
  shoptrack_backup: true,
  backup_format_version: BACKUP_FORMAT_VERSION,
  schema_version: 11,
  created_at: '2026-07-18T09:30:00.000Z',
  data: {
    products: [
      {
        id: 1, name: 'Bread', unit_label: 'loaf', current_qty: 7,
        buy_price: 10, sell_price: 15, is_active: 1, photo_path: null,
      },
      {
        id: 2, name: 'Old line', unit_label: 'each', current_qty: 99,
        buy_price: 1, sell_price: 2, is_active: 0, photo_path: null,
      },
    ],
    stock_movements: [
      {
        id: 1, product_id: 1, type: 'COUNT', quantity: 10,
        buy_price_at_time: null, sell_price_at_time: 15,
        session_id: 1, recorded_at: 100,
      },
      {
        id: 2, product_id: 1, type: 'STOCK_IN', quantity: 2,
        buy_price_at_time: 10, sell_price_at_time: 15,
        session_id: null, recorded_at: 150,
      },
      {
        id: 3, product_id: 1, type: 'COUNT', quantity: 7,
        buy_price_at_time: null, sell_price_at_time: 15,
        session_id: 2, recorded_at: 200,
      },
    ],
    count_sessions: [
      { id: 1, started_at: 90, completed_at: 100 },
      { id: 2, started_at: 190, completed_at: 200 },
    ],
    customers: [
      { id: 1, name: 'Lerato', phone: '071 000 0000', is_active: 1, photo_path: null },
      { id: 2, name: 'Archived', phone: null, is_active: 0, photo_path: null },
    ],
    credit_entries: [
      {
        id: 1, customer_id: 1, type: 'CREDIT', amount: 100, notes: 'Groceries',
        payment_method: null, due_at: null, recorded_at: 300,
      },
      {
        id: 2, customer_id: 1, type: 'PAYMENT', amount: 40, notes: null,
        payment_method: 'CASH', due_at: null, recorded_at: 400,
      },
      {
        id: 3, customer_id: 2, type: 'CREDIT', amount: 10, notes: null,
        payment_method: null, due_at: null, recorded_at: 400,
      },
    ],
    expenses: [
      {
        id: 1, category: 'TRANSPORT', amount: 20, notes: 'Taxi',
        receipt_photo_path: null, recorded_at: 500,
      },
    ],
    cash_ups: [
      {
        id: 1, counted_amount: 90, expected_amount: 100, difference: -10,
        taken_out: 0, is_opening: 0, digital_takings: null,
        recorded_by: null, notes: null, recorded_at: 600,
      },
    ],
    sales_entries: [
      {
        id: 1, period: 'DAY', period_key: '2026-07-18', amount: 200,
        margin_pct: 25, notes: null, recorded_at: 700,
      },
    ],
    settings: [
      { key: 'currency_code', value: 'NGN', updated_at: 1 },
      { key: 'shop_name', value: "  Nomsa's Shop  ", updated_at: 1 },
      { key: 'owner_pin', value: '1234', updated_at: 1 },
    ],
    staff_members: [
      { id: 1, name: 'Sipho', pin: '4321', is_active: 1, created_at: 1, updated_at: 1 },
    ],
    media: [],
  },
};

console.log('TEST: decrypted backup becomes a useful read-only shop projection');
const snapshot = buildRemoteShopSnapshot(backup, 1_000);
assert.equal(snapshot.shopName, "Nomsa's Shop");
assert.equal(snapshot.currencyCode, 'NGN');
assert.equal(snapshot.backupCreatedAt, Date.parse('2026-07-18T09:30:00.000Z'));
assert.deepEqual(snapshot.products.map(product => product.name), ['Bread']);
assert.equal(snapshot.stockSellingValue, 105);
assert.deepEqual(snapshot.customers, [{
  id: 1,
  name: 'Lerato',
  phone: '071 000 0000',
  balance: 60,
  lastActivityAt: 400,
}]);
assert.equal(snapshot.totalOutstanding, 60);
assert.equal(snapshot.totalExpenses, 20);
assert.equal(snapshot.totalSales, 200);
assert.equal(snapshot.salesBookProfit, 50);
assert.deepEqual(snapshot.latestCount, {
  completedAt: 200,
  profit: 25,
  revenue: 75,
  unitsSold: 5,
});
assert.deepEqual(snapshot.latestCashUp, {
  countedAmount: 90,
  expectedAmount: 100,
  difference: -10,
  isOpening: false,
  recordedAt: 600,
});

console.log('TEST: viewer projection excludes authentication secrets and media bytes');
const serialized = JSON.stringify(snapshot);
assert.equal(serialized.includes('1234'), false);
assert.equal(serialized.includes('4321'), false);
assert.equal(serialized.includes('base64'), false);
assert.equal(serialized.includes('media'), false);

console.log('TEST: backup currency formats without mutating this phone');
setCurrentCurrency('KES');
assert.equal(formatMoneyInCurrency(25, snapshot.currencyCode), '₦25.00');
assert.equal(getCurrentCurrency().code, 'KES');
assert.equal(formatMoneyInCurrency(25, 'unknown'), 'R25.00');
setCurrentCurrency('ZAR');

console.log('TEST: first count remains an honest baseline, not invented profit');
const firstCountBackup = structuredClone(backup);
firstCountBackup.data.stock_movements = [firstCountBackup.data.stock_movements[0]];
firstCountBackup.data.count_sessions = [firstCountBackup.data.count_sessions[0]];
assert.deepEqual(buildRemoteShopSnapshot(firstCountBackup, 1_000).latestCount, {
  completedAt: 100,
  profit: null,
  revenue: null,
  unitsSold: null,
});

console.log('TEST: malformed decrypted rows are rejected before rendering');
const malformed = structuredClone(backup);
malformed.data.sales_entries[0].amount = Number.NaN;
assert.throws(() => buildRemoteShopSnapshot(malformed), /Sales entry 1 amount must be a number/);
assert.throws(
  () => buildRemoteShopSnapshot({ ...backup, shoptrack_backup: false }),
  /Not a ShopTrack backup/
);

console.log('remote viewer model tests passed');
