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
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { initDatabase, type MigrationDb } from './schema';
import {
  addProduct,
  addCustomer,
  addCustomerToBook,
  createBackup,
  deactivateCustomer,
  deleteExpense,
  getLastCashUp,
  getLatestCountSession,
  loadCashUps,
  loadCreditEntries,
  loadCustomers,
  loadExpenses,
  loadMovements,
  loadProducts,
  normaliseBackup,
  openingBalanceFrom,
  recordCashUp,
  recordCount,
  recordCreditEntry,
  recordExpense,
  recordSales,
  recordStockIn,
  restoreBackup,
  saveCountSession,
  clearMonthDays,
  clearMonthSummary,
  deleteSalesEntry,
  recordSalesDays,
  loadSalesEntries,
  stockPurchaseTotal,
  toCoreProduct,
  type AppProduct,
  undoCountSession,
  undoStockIn,
} from './db';
import { calculateCreditSummary } from './credit';
import { calculatePeriodSummary } from './calculations';
import { calculateExpenseSummary, calculateNetProfit } from './expenses';
import { calculateExpectedCash, cashTurnover, reconcile } from './cashup';
import { calculateMonth, calculateSalesHistory, monthOf } from './sales';

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

const REPO_ROOT = join(__dirname, '..', '..');
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

  await recordCreditEntry(db, thandiId, 'CREDIT', 120, 'Bread and milk', null, MONDAY + DAY);
  await recordCreditEntry(db, thandiId, 'PAYMENT', 30, null, null, MONDAY + 3 * DAY);
  await recordCreditEntry(db, siphoId, 'CREDIT', 200, null, null, MONDAY - 60 * DAY);

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
  console.log('TEST: the journey — add someone, then find them');
  console.log('========================================');

  // This is the test that was missing. The engine tests all passed while the
  // feature was unusable on a real phone, because they asserted the engine's
  // intent instead of walking the path a shop owner walks: add a person, look
  // at the list, expect to see them.
  const { db: bookDb } = await freshDb();

  const leratoId = await addCustomerToBook(
    bookDb,
    { name: 'Lerato', phone: null },
    { amount: 90, notes: 'Bread and airtime', dueAt: MONDAY + 4 * DAY },
    MONDAY
  );

  const bookAfterAdd = calculateCreditSummary(
    await loadCustomers(bookDb),
    await loadCreditEntries(bookDb),
    MONDAY,
    MONDAY + 7 * DAY,
    MONDAY + DAY
  );

  equal(bookAfterAdd.everyone.length, 1, 'the person you just added is in the list');
  equal(bookAfterAdd.everyone[0].customer_name, 'Lerato', 'and it is them');
  equal(bookAfterAdd.everyone[0].balance, 90, 'with what they took already on the book');
  equal(bookAfterAdd.total_outstanding, 90, 'and it counts toward what you are owed');
  equal(bookAfterAdd.everyone[0].due_at, MONDAY + 4 * DAY, 'their promise is recorded');
  equal(bookAfterAdd.everyone[0].is_overdue, false, 'and is not yet broken');

  // Adding a bare name must also work, and must not vanish.
  await addCustomerToBook(bookDb, { name: 'Bare Name' }, undefined, MONDAY);
  const withBare = calculateCreditSummary(
    await loadCustomers(bookDb),
    await loadCreditEntries(bookDb),
    MONDAY,
    MONDAY + 7 * DAY,
    MONDAY + DAY
  );
  equal(withBare.everyone.length, 2, 'someone added with no debt is still listed');
  equal(withBare.owing.length, 1, 'but only the debtor shows under "who owes me"');
  check(
    withBare.everyone.some(b => b.customer_name === 'Bare Name' && b.balance === 0),
    'the bare name is present, reachable, and owes nothing'
  );

  // Once the promised day passes, they read as overdue.
  const lateBook = calculateCreditSummary(
    await loadCustomers(bookDb),
    await loadCreditEntries(bookDb),
    MONDAY,
    MONDAY + 30 * DAY,
    MONDAY + 10 * DAY
  );
  equal(lateBook.customers_overdue, 1, 'a passed promise shows up as overdue');
  equal(lateBook.overdue_debts[0].customer_name, 'Lerato', 'naming who is late');
  equal(lateBook.overdue_debts[0].days_overdue, 6, 'and by how long');

  // The due date must survive the round-trip through SQL.
  const storedEntries = await loadCreditEntries(bookDb);
  equal(storedEntries[0].due_at, MONDAY + 4 * DAY, 'due_at round-trips');
  equal(leratoId, 1, 'addCustomerToBook returns the new id');

  // A payment is not a promise, so it must never carry a due date.
  await recordCreditEntry(bookDb, leratoId, 'PAYMENT', 50, null, MONDAY + 99 * DAY, MONDAY + 5 * DAY);
  const payment = (await loadCreditEntries(bookDb)).find(e => e.type === 'PAYMENT');
  equal(payment?.due_at, undefined, 'a due date passed to a payment is dropped');

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
  console.log('TEST: cash-up through real SQL');
  console.log('========================================');

  // The delivery recorded earlier cost R280 and came out of the till.
  const purchases = await stockPurchaseTotal(db, MONDAY, MONDAY + 7 * DAY);
  equal(purchases, 280, 'stock purchase total reads total_cost from real rows');

  equal(openingBalanceFrom(null), null, 'no baseline before the first cash-up');
  equal(await getLastCashUp(db), null, 'no cash-up yet');

  // First cash-up sets the float, like the first stock count sets a baseline.
  await recordCashUp(
    db,
    { counted: 500, expected: 0, difference: 0 },
    { isOpening: true, notes: 'Starting float' },
    MONDAY
  );

  const opening = await getLastCashUp(db);
  equal(opening?.is_opening, true, 'the first cash-up is flagged as opening');
  equal(openingBalanceFrom(opening), 500, 'opening balance is what was counted');

  // Second cash-up: the real reconciliation, built from all four engines.
  const inputs = {
    opening: openingBalanceFrom(opening)!,
    revenue: summary.total_estimated_revenue,
    creditGiven: book.credit_given,
    paymentsReceived: book.payments_received,
    expenses: expenseSummary.total,
    stockPurchases: purchases,
  };
  const trail = calculateExpectedCash(inputs);

  // This shop paid R1,700 in costs against R540 of sales, so more cash left the
  // till than entered it. Expected legitimately goes negative -- it means the
  // owner covered the gap from somewhere the app cannot see. A till, though,
  // can never hold less than nothing, which the schema enforces.
  check(trail.expected < 0, 'expected cash can go negative when payouts exceed takings');

  const counted = 0;
  const result = reconcile(trail.expected, counted, cashTurnover(inputs));
  equal(
    result.verdict,
    'over',
    'an empty till against negative expected reads as over, not short'
  );

  const negativeCountRejected = await (async () => {
    try {
      await recordCashUp(db, { counted: -50, expected: 0, difference: -50 }, {}, MONDAY);
      return false;
    } catch {
      return true;
    }
  })();
  check(negativeCountRejected, 'the database refuses a negative till count');

  await recordCashUp(db, result, { takenOut: 0 }, MONDAY + 5 * DAY);

  const last = await getLastCashUp(db);
  equal(last?.is_opening, false, 'a normal cash-up is not an opening one');
  equal(last?.counted_amount, counted, 'counted amount round-trips');
  equal(last?.expected_amount, result.expected, 'expected round-trips, negative and all');
  equal(last?.difference, result.difference, 'difference round-trips');
  equal(openingBalanceFrom(last), 0, 'an empty till leaves nothing for tomorrow');

  // Taking money out lowers where the next cash-up starts.
  await recordCashUp(
    db,
    { counted: 900, expected: 900, difference: 0 },
    { takenOut: 400 },
    MONDAY + 6 * DAY
  );
  const afterDraw = await getLastCashUp(db);
  equal(afterDraw?.taken_out, 400, 'money taken out round-trips');
  equal(
    openingBalanceFrom(afterDraw),
    500,
    'next opening balance is what was left after taking money out'
  );

  const history = await loadCashUps(db);
  equal(history.length, 3, 'every cash-up is stored');
  equal(history[0].taken_out, 400, 'history comes back newest first');

  // The stored expected must never be recomputed. A backdated expense changes
  // what "expected" would be today, but the owner reconciled against the number
  // they were shown.
  const storedExpected = afterDraw!.expected_amount;
  await recordExpense(db, 'OTHER', 999, 'backdated, entered late', MONDAY + 2 * DAY);
  const afterBackdate = await getLastCashUp(db);
  equal(
    afterBackdate?.expected_amount,
    storedExpected,
    'a backdated expense does not rewrite a past cash-up'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: count and stock corrections are safe');
  console.log('========================================');

  const { db: correctionDb } = await freshDb();
  const correctionProductId = await addProduct(
    correctionDb,
    { name: 'Milk', buyPrice: 10, sellPrice: 14, quantity: 10 },
    MONDAY
  );
  const correctionProduct = (await loadProducts(correctionDb)).find(p => p.id === correctionProductId)!;

  const saved = await saveCountSession(
    correctionDb,
    [{ product: correctionProduct, quantity: 7 }],
    1,
    MONDAY + DAY
  );
  equal((await getLatestCountSession(correctionDb))?.id, saved.sessionId, 'latest count session is findable');
  equal((await loadProducts(correctionDb))[0].current_qty, 7, 'atomic count updates current stock');
  check(
    await undoCountSession(correctionDb, saved.sessionId, MONDAY + DAY + 1000),
    'latest count can be undone within one hour'
  );
  equal((await loadProducts(correctionDb))[0].current_qty, 10, 'undo restores the previous quantity');
  equal(await getLatestCountSession(correctionDb), null, 'undo removes the count session');

  const deliveryId = await recordStockIn(
    correctionDb,
    (await loadProducts(correctionDb))[0],
    5,
    60,
    MONDAY + 2 * DAY
  );
  equal((await loadProducts(correctionDb))[0].current_qty, 15, 'delivery increases current stock');
  equal((await loadProducts(correctionDb))[0].buy_price, 12, 'delivery updates the buy price');
  check(
    await undoStockIn(correctionDb, deliveryId, MONDAY + 2 * DAY + 1000),
    'delivery can be undone within 24 hours'
  );
  equal((await loadProducts(correctionDb))[0].current_qty, 10, 'delivery undo restores quantity');
  equal((await loadProducts(correctionDb))[0].buy_price, 10, 'delivery undo restores the prior buy price');

  const invalidProduct: AppProduct = {
    id: 999,
    name: 'Missing',
    unit_label: 'units',
    buy_price: 1,
    sell_price: 2,
    current_qty: 0,
  };
  let countRolledBack = false;
  try {
    await saveCountSession(
      correctionDb,
      [
        { product: (await loadProducts(correctionDb))[0], quantity: 4 },
        { product: invalidProduct, quantity: 1 },
      ],
      2,
      MONDAY + 3 * DAY
    );
  } catch {
    countRolledBack = true;
  }
  check(countRolledBack, 'a failed multi-product count is rejected');
  equal((await loadProducts(correctionDb))[0].current_qty, 10, 'failed count rolls back product updates');
  equal(await getLatestCountSession(correctionDb), null, 'failed count rolls back its session');

  console.log('');
  console.log('========================================');
  console.log('TEST: backup and restore covers the whole shop');
  console.log('========================================');

  const { db: backupSource } = await freshDb();
  const backupProductId = await addProduct(
    backupSource,
    { name: 'Bread', buyPrice: 14, sellPrice: 18, quantity: 20 },
    MONDAY
  );
  const backupProduct = (await loadProducts(backupSource)).find(p => p.id === backupProductId)!;
  await recordStockIn(backupSource, backupProduct, 10, 140, MONDAY + 1000);
  await saveCountSession(
    backupSource,
    [{ product: (await loadProducts(backupSource))[0], quantity: 12 }],
    1,
    MONDAY + DAY
  );
  await addCustomerToBook(
    backupSource,
    { name: 'Lerato', phone: '0720000000' },
    { amount: 35, notes: 'Bread', dueAt: MONDAY + 7 * DAY },
    MONDAY + DAY
  );
  await recordExpense(backupSource, 'TRANSPORT', 40, 'Taxi', MONDAY + DAY);
  await recordCashUp(
    backupSource,
    { counted: 200, expected: 190, difference: 10 },
    { takenOut: 50 },
    MONDAY + DAY
  );
  await recordSales(backupSource, 'MONTH', '2026-01', 48000, 25, 'from the book', MONDAY + DAY);
  await recordSales(backupSource, 'DAY', '2026-07-01', 1400, 25, null, MONDAY + DAY);

  const backup = await createBackup(backupSource);
  equal(backup.backup_format_version, 2, 'backup format is independent from schema version');
  check(backup.data.products.length > 0, 'backup includes products');
  check(backup.data.stock_movements.length > 0, 'backup includes stock movements');
  check(backup.data.count_sessions.length > 0, 'backup includes count sessions');
  check(backup.data.customers.length > 0, 'backup includes customers');
  check(backup.data.credit_entries.length > 0, 'backup includes credit entries');
  check(backup.data.expenses.length > 0, 'backup includes expenses');
  check(backup.data.cash_ups.length > 0, 'backup includes cash-ups');
  equal(backup.data.sales_entries.length, 2, 'backup includes the sales book');

  const { db: backupTarget } = await freshDb();
  // A sales entry the backup does not know about: restore must replace it,
  // not leave it mixed in with the restored book.
  await recordSales(backupTarget, 'MONTH', '2020-01', 999, 10, 'stale', MONDAY);
  await restoreBackup(backupTarget, backup);
  equal((await loadProducts(backupTarget))[0].name, 'Bread', 'restored product round-trips');
  equal((await loadMovements(backupTarget)).length, backup.data.stock_movements.length, 'all movements restore');
  equal((await loadCustomers(backupTarget))[0].name, 'Lerato', 'customers restore');
  equal((await loadCreditEntries(backupTarget))[0].amount, 35, 'credit ledger restores');
  equal((await loadExpenses(backupTarget))[0].amount, 40, 'expenses restore');
  equal((await loadCashUps(backupTarget))[0].counted_amount, 200, 'cash-ups restore');
  const restoredSales = await loadSalesEntries(backupTarget);
  equal(restoredSales.length, 2, 'sales book restores');
  check(!restoredSales.some(e => e.notes === 'stale'), 'restore clears sales entries missing from the backup');
  equal(restoredSales.find(e => e.period_key === '2026-01')!.amount, 48000, 'sales amounts round-trip');
  equal(restoredSales.find(e => e.period_key === '2026-01')!.margin_pct, 25, 'sales margins round-trip');

  const brokenBackup = structuredClone(backup);
  brokenBackup.data.expenses[0].category = 'STOCK';
  let restoreRolledBack = false;
  try {
    await restoreBackup(backupTarget, brokenBackup);
  } catch {
    restoreRolledBack = true;
  }
  check(restoreRolledBack, 'invalid restore is rejected');
  equal((await loadProducts(backupTarget))[0].name, 'Bread', 'failed restore keeps existing data');
  equal((await loadExpenses(backupTarget))[0].category, 'TRANSPORT', 'failed restore rolls back every table');

  const brokenSalesBackup = structuredClone(backup);
  brokenSalesBackup.data.sales_entries[0].period = 'WEEK';
  let salesRestoreRolledBack = false;
  try {
    await restoreBackup(backupTarget, brokenSalesBackup);
  } catch {
    salesRestoreRolledBack = true;
  }
  check(salesRestoreRolledBack, 'an invalid sales entry rejects the whole restore');
  equal((await loadSalesEntries(backupTarget)).length, 2, 'failed restore keeps the existing sales book');

  // A format-1 backup (made before the sales book existed) still restores;
  // the sales book it never knew about becomes an explicit empty set.
  const v1 = normaliseBackup({
    shoptrack_backup: true,
    backup_format_version: 1,
    schema_version: 5,
    created_at: backup.created_at,
    data: {
      products: backup.data.products,
      stock_movements: backup.data.stock_movements,
      count_sessions: backup.data.count_sessions,
      customers: backup.data.customers,
      credit_entries: backup.data.credit_entries,
      expenses: backup.data.expenses,
      cash_ups: backup.data.cash_ups,
    },
  });
  equal(v1.backup_format_version, 2, 'format-1 backup is upgraded');
  equal(v1.data.sales_entries.length, 0, 'format-1 backup gets an explicit empty sales book');
  await restoreBackup(backupTarget, v1);
  equal((await loadSalesEntries(backupTarget)).length, 0, 'restoring a format-1 backup replaces the sales book too');
  equal((await loadCustomers(backupTarget))[0].name, 'Lerato', 'format-1 restore keeps its seven tables');

  const legacy = normaliseBackup({
    shoptrack_backup: true,
    version: 5,
    created_at: backup.created_at,
    data: {
      products: backup.data.products,
      stock_movements: backup.data.stock_movements,
      count_sessions: backup.data.count_sessions,
    },
  });
  equal(legacy.backup_format_version, 2, 'legacy pre-pilot backup is upgraded');
  equal(legacy.data.customers.length, 0, 'missing legacy tables become explicit empty sets');
  equal(legacy.data.sales_entries.length, 0, 'legacy backups get an explicit empty sales book');

  console.log('');
  console.log('========================================');
  console.log('TEST: the sales book through real SQL');
  console.log('========================================');

  const { db: salesDb } = await freshDb();

  // The scenario: installed in July, paper book goes back to January.
  await recordSales(salesDb, 'MONTH', '2026-01', 48000, 25, 'from the book', MONDAY);
  await recordSales(salesDb, 'MONTH', '2026-02', 44000, 25, null, MONDAY);
  await recordSales(salesDb, 'MONTH', '2026-03', 50000, 20, null, MONDAY);
  // July is now being kept day by day.
  await recordSales(salesDb, 'DAY', '2026-07-01', 1400, 25, null, MONDAY);
  await recordSales(salesDb, 'DAY', '2026-07-02', 1600, 25, null, MONDAY);

  const stored = await loadSalesEntries(salesDb);
  equal(stored.length, 5, 'every entry is stored');
  equal(stored[0].period_key, '2026-07-02', 'entries come back newest first');
  equal(stored[4].notes, 'from the book', 'notes round-trip');
  equal(stored[3].notes, undefined, 'a missing note is undefined, not null');
  equal(stored[4].margin_pct, 25, 'the margin snapshot round-trips');

  const salesHistory = calculateSalesHistory(stored);
  equal(salesHistory.months.length, 4, 'four months have data');
  equal(salesHistory.total_sales, 145000, 'takings from real rows: 48000+44000+50000+3000');
  equal(salesHistory.total_profit, 33750, 'profit from real rows, each month at its own margin');

  const january = salesHistory.months.find(m => m.month_key === '2026-01')!;
  equal(january.profit, 12000, 'January profit is R12,000');

  // Re-entering a day corrects it rather than adding a second one.
  await recordSales(salesDb, 'DAY', '2026-07-01', 1500, 25, 'recounted', MONDAY + DAY);
  const corrected = await loadSalesEntries(salesDb);
  equal(corrected.length, 5, 'correcting a day does not create a duplicate');
  equal(
    corrected.find(e => e.period_key === '2026-07-01')!.amount,
    1500,
    'the corrected amount replaces the old one'
  );

  // A day and a month can both exist; the engine reports the clash.
  await recordSales(salesDb, 'MONTH', '2026-07', 40000, 25, null, MONDAY);
  const clashing = calculateSalesHistory(await loadSalesEntries(salesDb));
  equal(clashing.conflicts.length, 1, 'the day/month clash is reported');
  equal(clashing.conflicts[0].month_key, '2026-07', 'and names the month');

  // Clearing the summary resolves it, leaving the days.
  await clearMonthSummary(salesDb, '2026-07');
  const resolved = calculateSalesHistory(await loadSalesEntries(salesDb));
  equal(resolved.conflicts.length, 0, 'clearing the month total resolves the clash');
  equal(resolved.months.find(m => m.month_key === '2026-07')!.sales, 3100, 'the days survive');

  const removable = (await loadSalesEntries(salesDb)).find(e => e.period_key === '2026-03')!;
  await deleteSalesEntry(salesDb, removable.id);
  equal((await loadSalesEntries(salesDb)).length, 4, 'an entry can be removed');

  // The database refuses nonsense the UI should never send.
  const badMargin = await (async () => {
    try {
      await recordSales(salesDb, 'DAY', '2026-07-09', 100, 150, null, MONDAY);
      return false;
    } catch { return true; }
  })();
  check(badMargin, 'the database refuses a margin over 100%');

  const negativeSales = await (async () => {
    try {
      await recordSales(salesDb, 'DAY', '2026-07-10', -100, 25, null, MONDAY);
      return false;
    } catch { return true; }
  })();
  check(negativeSales, 'the database refuses negative takings');

  // A closed day is a real thing: zero takings must be recordable.
  await recordSales(salesDb, 'DAY', '2026-07-11', 0, 25, 'closed', MONDAY);
  equal(
    (await loadSalesEntries(salesDb)).find(e => e.period_key === '2026-07-11')!.amount,
    0,
    'a day the shop was closed records as zero, not as an error'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: filling a month from the calendar');
  console.log('========================================');

  const { db: calDb } = await freshDb();

  // The owner opens January and types down their book. Days they left blank are
  // simply not passed in.
  await recordSalesDays(calDb, '2026-01', [
    { dayKey: '2026-01-01', amount: 0 },      // closed for New Year
    { dayKey: '2026-01-02', amount: 1400 },
    { dayKey: '2026-01-03', amount: 1600 },
  ], 25, MONDAY);

  const janEntries = await loadSalesEntries(calDb);
  equal(janEntries.length, 3, 'only the days that were filled in are stored');
  equal(janEntries.every(e => e.period === 'DAY'), true, 'they are stored as days');
  equal(janEntries.find(e => e.period_key === '2026-01-01')!.amount, 0, 'a closed day is kept as zero');

  const janMonth = calculateMonth('2026-01', janEntries);
  equal(janMonth.sales, 3000, 'the month adds up its days');
  equal(janMonth.profit, 750, 'and earns at the margin given');
  equal(janMonth.days_recorded, 3, 'and knows how many days it has');

  // Re-opening January and correcting a day must not duplicate it.
  await recordSalesDays(calDb, '2026-01', [
    { dayKey: '2026-01-02', amount: 1500 },
  ], 25, MONDAY + DAY);
  const corrected2 = await loadSalesEntries(calDb);
  equal(corrected2.length, 3, 'saving again does not duplicate days');
  equal(
    corrected2.find(e => e.period_key === '2026-01-02')!.amount,
    1500,
    'the corrected day replaces the old one'
  );
  equal(
    corrected2.find(e => e.period_key === '2026-01-03')!.amount,
    1600,
    'days not touched this time are left alone'
  );

  // Detailing a month must drop any whole-month total for it, or the two would
  // describe the same trading.
  await recordSales(calDb, 'MONTH', '2026-02', 40000, 25, null, MONDAY);
  await recordSalesDays(calDb, '2026-02', [{ dayKey: '2026-02-01', amount: 900 }], 25, MONDAY);

  const feb = calculateSalesHistory(await loadSalesEntries(calDb)).months
    .find(m => m.month_key === '2026-02')!;
  equal(feb.has_conflict, false, 'detailing a month clears its old total, so no clash');
  equal(feb.sales, 900, 'only the day counts');
  equal(feb.source, 'days', 'and the month reads as detailed');

  // The reverse: going back to a single total drops the days.
  await clearMonthDays(calDb, '2026-02');
  await recordSales(calDb, 'MONTH', '2026-02', 40000, 25, null, MONDAY);
  const febAgain = calculateSalesHistory(await loadSalesEntries(calDb)).months
    .find(m => m.month_key === '2026-02')!;
  equal(febAgain.source, 'month', 'clearing the days leaves the month total');
  equal(febAgain.sales, 40000, 'and the total is what counts');
  equal(febAgain.has_conflict, false, 'with no clash left behind');

  // clearMonthDays must not reach into a neighbouring month via its LIKE.
  equal(
    (await loadSalesEntries(calDb)).filter(e => monthOf(e.period_key) === '2026-01').length,
    3,
    'clearing February left January alone'
  );

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
  equal((await loadSalesEntries(emptyDb)).length, 0, 'no sales entries');

  const emptyBook = calculateCreditSummary([], [], MONDAY, MONDAY + 7 * DAY, MONDAY);
  equal(emptyBook.total_outstanding, 0, 'an empty book is zero, not NaN');

  const emptyExpenses = calculateExpenseSummary([], MONDAY, MONDAY + 7 * DAY);
  equal(emptyExpenses.total, 0, 'an empty expense list is zero, not NaN');

  equal((await loadCashUps(emptyDb)).length, 0, 'no cash-ups');
  equal(await getLastCashUp(emptyDb), null, 'no last cash-up');
  // SUM() over no rows is NULL in SQL, which would poison every downstream sum.
  equal(
    await stockPurchaseTotal(emptyDb, MONDAY, MONDAY + 7 * DAY),
    0,
    'stock purchase total is 0, not null, when there are no deliveries'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: no synchronous SQLite calls anywhere');
  console.log('========================================');

  // On web, expo-sqlite runs SQLite in a worker. The sync API reaches it by
  // spinning on Atomics.load over a SharedArrayBuffer until the worker replies
  // (expo-sqlite/web/WorkerChannel.ts) and gives up with "Sync operation
  // timeout" when that is not satisfied -- which is routine in a browser that
  // is not cross-origin isolated. The async API posts to the same worker and
  // awaits a promise: nothing to time out.
  //
  // The two APIs are interchangeable on native, so this regression is invisible
  // until someone opens the web build. Catch it here instead.
  const SYNC_CALL = /\b(openDatabaseSync|openDatabaseSyncFromDb|execSync|runSync|getAllSync|getFirstSync|getEachSync|prepareSync|closeSync|withTransactionSync|isInTransactionSync|serializeSync)\s*\(/;

  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
        sources.push(full);
      }
    }
  };
  walk(join(REPO_ROOT, 'src'));
  sources.push(join(REPO_ROOT, 'App.tsx'));

  const offenders = sources.filter(f => SYNC_CALL.test(readFileSync(f, 'utf8')));
  if (offenders.length > 0) {
    failures++;
    console.error(
      `  FAIL synchronous SQLite call found -- this breaks the web build:\n` +
      offenders.map(f => `         ${f.replace(REPO_ROOT, '.')}`).join('\n')
    );
  } else {
    console.log(`  ok   ${sources.length} source files, all on the async path`);
  }

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
