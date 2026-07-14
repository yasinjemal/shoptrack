/**
 * ============================================
 * SHOPTRACK DB ADAPTER TESTS
 * ============================================
 *
 * Runs the adapter's real SQL against the real schema, end to end.
 *
 * This exists because the engine tests cannot catch anything here. A query
 * with a wrong column name typechecks perfectly -- SQL is just a string. That
 * class of bug (`movement_type` vs `type`, a NOT NULL column with no value)
 * only shows up when the statement actually executes.
 *
 * db.ts imports expo-sqlite with `import type`, which erases at runtime, so
 * these functions load fine in node against node:sqlite.
 *
 * Run with: npm run test:db
 */

import { DatabaseSync } from 'node:sqlite';
import { initDatabase, type MigrationDb } from './schema';
import {
  addCustomer,
  deactivateCustomer,
  deleteExpense,
  loadCreditEntries,
  loadCustomers,
  loadExpenses,
  loadMovements,
  loadProducts,
  recordCount,
  recordCreditEntry,
  recordExpense,
  recordStockIn,
  toCoreProduct,
  type AppProduct,
} from './db';
import { calculateCreditSummary } from './credit';
import { calculatePeriodSummary } from './calculations';
import { calculateExpenseSummary, calculateNetProfit } from './expenses';

let failures = 0;

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`);
  }
}

function check(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

/**
 * Present node:sqlite through the slice of the expo-sqlite surface the
 * adapter uses. Any mismatch in SQL or bind parameters surfaces here exactly
 * as it would on a device.
 */
function adapt(db: DatabaseSync): any {
  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async runAsync(sql: string, params: any[] = []) {
      const result = db.prepare(sql).run(...params);
      return { lastInsertRowId: Number(result.lastInsertRowid), changes: Number(result.changes) };
    },
    async getAllAsync(sql: string, params: any[] = []) {
      return db.prepare(sql).all(...params);
    },
    async getFirstAsync(sql: string, params: any[] = []) {
      return db.prepare(sql).get(...params) ?? null;
    },
    async withTransactionAsync(fn: () => Promise<void>) {
      db.exec('BEGIN');
      try {
        await fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

const DAY = 24 * 60 * 60 * 1000;
const MONDAY = Date.UTC(2026, 1, 9, 8, 0, 0);

async function freshDb() {
  const raw = new DatabaseSync(':memory:');
  const db = adapt(raw);
  await initDatabase(db as MigrationDb);
  return { raw, db };
}

async function run() {
  console.log('========================================');
  console.log('TEST: stock flows through real SQL');
  console.log('========================================');

  const { raw, db } = await freshDb();

  raw.exec(`
    INSERT INTO products (id, name, unit_label, buy_price, sell_price, current_qty, created_at, updated_at)
    VALUES (1, 'Bread', 'loaf', 14.0, 18.0, 0, ${MONDAY}, ${MONDAY});
  `);

  const products = await loadProducts(db);
  equal(products.length, 1, 'loadProducts returns the product');
  equal(products[0].name, 'Bread', 'product name round-trips');

  const bread: AppProduct = products[0];

  // Opening count, a delivery, then a closing count.
  await recordCount(db, bread, 20, 1, MONDAY);
  await recordStockIn(db, { ...bread, current_qty: 20 }, 20, 280, MONDAY + 2 * DAY);
  await recordCount(db, { ...bread, current_qty: 40 }, 10, 2, MONDAY + 4 * DAY);

  const movements = await loadMovements(db);
  equal(movements.length, 3, 'all three movements are stored');

  const stockIn = movements.find(m => m.type === 'STOCK_IN');
  equal(stockIn?.buy_price_at_time, 14, 'stock-in snapshots the unit cost it paid');

  const counts = movements.filter(m => m.type === 'COUNT');
  equal(counts.length, 2, 'both counts are stored');
  equal(counts[0].sell_price_at_time, 18, 'count snapshots the sell price');

  // Opening 20 + bought 20 - closing 10 = 30 sold, at R4 margin = R120.
  const summary = calculatePeriodSummary(
    [toCoreProduct(bread)],
    movements,
    MONDAY + 1,
    MONDAY + 5 * DAY
  );
  equal(summary.total_units_sold, 30, 'engine reads the real rows: 20 + 20 - 10 = 30 sold');
  equal(summary.total_estimated_profit, 120, 'profit from real rows is R120');

  const after = await loadProducts(db);
  equal(after[0].current_qty, 10, 'product quantity reflects the last count');
  equal(after[0].buy_price, 14, 'buy price follows the latest delivery');

  console.log('');
  console.log('========================================');
  console.log('TEST: the credit book through real SQL');
  console.log('========================================');

  const thandiId = await addCustomer(db, 'Thandi', '072 000 0000', MONDAY);
  const siphoId = await addCustomer(db, 'Sipho', null, MONDAY);

  equal(thandiId, 1, 'addCustomer returns the new id');
  check(siphoId !== thandiId, 'each customer gets a distinct id');

  const customers = await loadCustomers(db);
  equal(customers.length, 2, 'both customers load');
  equal(customers[0].name, 'Sipho', 'customers come back sorted by name');
  equal(customers[1].phone, '072 000 0000', 'phone round-trips');
  equal(customers[0].phone, undefined, 'a missing phone is undefined, not null');

  await recordCreditEntry(db, thandiId, 'CREDIT', 120, 'Bread and milk', MONDAY + DAY);
  await recordCreditEntry(db, thandiId, 'PAYMENT', 30, null, MONDAY + 3 * DAY);
  await recordCreditEntry(db, siphoId, 'CREDIT', 200, null, MONDAY - 60 * DAY);

  const entries = await loadCreditEntries(db);
  equal(entries.length, 3, 'all ledger entries are stored');
  equal(entries[0].amount, 200, 'entries come back oldest first');
  equal(entries[1].notes, 'Bread and milk', 'notes round-trip');
  equal(entries[2].notes, undefined, 'a missing note is undefined, not null');

  const book = calculateCreditSummary(
    customers,
    entries,
    MONDAY,
    MONDAY + 7 * DAY,
    MONDAY + 5 * DAY
  );
  equal(book.total_outstanding, 290, 'outstanding from real rows: 90 + 200');
  equal(book.customers_owing, 2, 'both customers owe');
  equal(book.credit_given, 120, 'only this week\'s credit counts');
  equal(book.payments_received, 30, 'only this week\'s payments count');

  console.log('');
  console.log('========================================');
  console.log('TEST: hiding a customer keeps their history');
  console.log('========================================');

  await deactivateCustomer(db, siphoId, MONDAY + 5 * DAY);

  const visible = await loadCustomers(db);
  equal(visible.length, 1, 'a deactivated customer drops off the list');
  equal(visible[0].name, 'Thandi', 'the right customer remains');

  // The ledger is untouched, so past totals never silently change.
  const stillThere = await loadCreditEntries(db);
  equal(stillThere.length, 3, 'their ledger entries survive');

  console.log('');
  console.log('========================================');
  console.log('TEST: expenses through real SQL, and net profit');
  console.log('========================================');

  await recordExpense(db, 'RENT', 1500, 'February', MONDAY);
  await recordExpense(db, 'TRANSPORT', 200, 'Taxi to cash and carry', MONDAY + DAY);
  const strayId = await recordExpense(db, 'OTHER', 75, 'typo', MONDAY + 2 * DAY);

  const expenses = await loadExpenses(db);
  equal(expenses.length, 3, 'all expenses are stored');
  equal(expenses[0].notes, 'typo', 'expenses come back newest first');
  equal(expenses[2].category, 'RENT', 'category round-trips');
  equal(expenses[2].amount, 1500, 'amount round-trips');

  await deleteExpense(db, strayId);
  equal((await loadExpenses(db)).length, 2, 'a mistaken expense can be removed');

  const expenseSummary = calculateExpenseSummary(
    await loadExpenses(db),
    MONDAY,
    MONDAY + 7 * DAY
  );
  equal(expenseSummary.total, 1700, 'expense total from real rows');
  equal(expenseSummary.biggest?.category, 'RENT', 'rent is the biggest cost');

  // The whole point: gross profit was R120 from the stock above, but the shop
  // paid R1,700 to stay open. It did not make money this week.
  const realProfit = calculateNetProfit(summary.total_estimated_profit, expenseSummary.total);
  equal(realProfit.gross_profit, 120, 'gross comes from the stock engine');
  equal(realProfit.net_profit, -1580, 'net profit is gross minus expenses');
  equal(realProfit.is_loss, true, 'the shop is flagged as losing money');

  // Stock purchases must never appear as an expense: the R280 delivery above
  // is already priced into gross profit via buy_price.
  const sqlRejectsStock = await (async () => {
    try {
      await recordExpense(db, 'STOCK' as any, 280, null, MONDAY);
      return false;
    } catch {
      return true;
    }
  })();
  check(sqlRejectsStock, 'the database refuses a STOCK expense, so deliveries cannot double-count');

  console.log('');
  console.log('========================================');
  console.log('TEST: an empty shop does not crash');
  console.log('========================================');

  const { db: emptyDb } = await freshDb();
  equal((await loadProducts(emptyDb)).length, 0, 'no products');
  equal((await loadMovements(emptyDb)).length, 0, 'no movements');
  equal((await loadCustomers(emptyDb)).length, 0, 'no customers');
  equal((await loadCreditEntries(emptyDb)).length, 0, 'no credit entries');
  equal((await loadExpenses(emptyDb)).length, 0, 'no expenses');

  const emptyBook = calculateCreditSummary([], [], MONDAY, MONDAY + 7 * DAY, MONDAY);
  equal(emptyBook.total_outstanding, 0, 'an empty book is zero, not NaN');

  const emptyExpenses = calculateExpenseSummary([], MONDAY, MONDAY + 7 * DAY);
  equal(emptyExpenses.total, 0, 'an empty expense list is zero, not NaN');

  console.log('');
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) did not hold`);
    process.exit(1);
  }
  console.log('PASSED: all db adapter checks held');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
