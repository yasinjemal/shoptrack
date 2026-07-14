/**
 * ============================================
 * SHOPTRACK DATABASE ADAPTER
 * ============================================
 *
 * The seam between SQLite rows and the pure calculation engine.
 *
 * calculations.ts must stay free of SQLite so it remains testable in plain
 * node. Everything that knows about tables and columns lives here.
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type { Product as CoreProduct, StockMovement } from './calculations';
import type { CreditEntry, Customer } from './credit';
import type { Expense, ExpenseCategory } from './expenses';
import type { CashUpResult } from './cashup';

/**
 * The product shape the UI works with.
 *
 * Prices are nullable here on purpose: an owner can add a product before they
 * know what it costs, and the setup flow depends on that being allowed.
 */
export interface AppProduct {
  id: number;
  name: string;
  unit_label: string;
  buy_price: number | null;
  sell_price: number | null;
  current_qty: number;
  low_stock_threshold?: number;
}

interface MovementRow {
  id: number;
  product_id: number;
  type: 'STOCK_IN' | 'COUNT';
  quantity: number;
  buy_price_at_time: number | null;
  sell_price_at_time: number | null;
  notes: string | null;
  recorded_at: number;
}

/**
 * Bridge a UI product into the engine's shape.
 *
 * A missing price becomes 0, which the engine reads as "no margin known"
 * rather than inventing one.
 */
export function toCoreProduct(p: AppProduct): CoreProduct {
  return {
    id: p.id,
    name: p.name,
    buy_price: p.buy_price ?? 0,
    sell_price: p.sell_price ?? 0,
    current_qty: p.current_qty,
    unit_label: p.unit_label,
    is_active: true,
  };
}

/**
 * A product can only produce trustworthy profit numbers once both prices are
 * known. Screens use this to decide what to omit rather than show as R0.
 */
export function hasPrices(p: AppProduct): boolean {
  return p.buy_price != null && p.sell_price != null;
}

export async function loadProducts(db: SQLiteDatabase): Promise<AppProduct[]> {
  return db.getAllAsync<AppProduct>(
    'SELECT * FROM products WHERE is_active = 1 ORDER BY name'
  );
}

/**
 * Load movements for the engine. Pass `since` to bound the scan; the engine
 * needs history before the period start to derive an opening quantity, so
 * callers should reach further back than the period they are reporting on.
 */
export async function loadMovements(
  db: SQLiteDatabase,
  since?: number
): Promise<StockMovement[]> {
  const rows = since != null
    ? await db.getAllAsync<MovementRow>(
        `SELECT id, product_id, type, quantity, buy_price_at_time, sell_price_at_time, notes, recorded_at
         FROM stock_movements WHERE recorded_at >= ? ORDER BY recorded_at`,
        [since]
      )
    : await db.getAllAsync<MovementRow>(
        `SELECT id, product_id, type, quantity, buy_price_at_time, sell_price_at_time, notes, recorded_at
         FROM stock_movements ORDER BY recorded_at`
      );

  return rows.map(toCoreMovement);
}

function toCoreMovement(r: MovementRow): StockMovement {
  return {
    id: r.id,
    product_id: r.product_id,
    type: r.type,
    quantity: r.quantity,
    buy_price_at_time: r.buy_price_at_time ?? undefined,
    sell_price_at_time: r.sell_price_at_time ?? undefined,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  };
}

/**
 * Record a physical count, snapshotting the sell price so this period's profit
 * stays correct even if the owner reprices the product later.
 */
export async function recordCount(
  db: SQLiteDatabase,
  product: AppProduct,
  quantity: number,
  sessionId: number,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    `INSERT INTO stock_movements (product_id, type, quantity, sell_price_at_time, session_id, recorded_at)
     VALUES (?, 'COUNT', ?, ?, ?, ?)`,
    [product.id, quantity, product.sell_price, sessionId, now]
  );
  await db.runAsync(
    'UPDATE products SET current_qty = ?, updated_at = ? WHERE id = ?',
    [quantity, now, product.id]
  );
}

/**
 * Record a purchase, snapshotting the unit cost paid. The product's buy_price
 * follows the most recent purchase, which is what the owner expects to see.
 */
export async function recordStockIn(
  db: SQLiteDatabase,
  product: AppProduct,
  quantity: number,
  totalCost: number,
  now: number = Date.now()
): Promise<void> {
  const costPerUnit = totalCost / quantity;

  await db.runAsync(
    `INSERT INTO stock_movements (product_id, type, quantity, buy_price_at_time, total_cost, recorded_at)
     VALUES (?, 'STOCK_IN', ?, ?, ?, ?)`,
    [product.id, quantity, costPerUnit, totalCost, now]
  );
  await db.runAsync(
    `UPDATE products SET current_qty = current_qty + ?, buy_price = ?, updated_at = ? WHERE id = ?`,
    [quantity, costPerUnit, now, product.id]
  );
}

// ============================================
// CREDIT BOOK
// ============================================

interface CustomerRow {
  id: number;
  name: string;
  phone: string | null;
}

interface CreditEntryRow {
  id: number;
  customer_id: number;
  type: 'CREDIT' | 'PAYMENT';
  amount: number;
  notes: string | null;
  recorded_at: number;
}

export async function loadCustomers(db: SQLiteDatabase): Promise<Customer[]> {
  const rows = await db.getAllAsync<CustomerRow>(
    'SELECT id, name, phone FROM customers WHERE is_active = 1 ORDER BY name'
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    phone: r.phone ?? undefined,
  }));
}

/**
 * Load the ledger. Balances are lifetime totals, so this deliberately reads
 * every entry rather than a recent window -- a debt from three months ago is
 * still owed today.
 */
export async function loadCreditEntries(db: SQLiteDatabase): Promise<CreditEntry[]> {
  const rows = await db.getAllAsync<CreditEntryRow>(
    `SELECT id, customer_id, type, amount, notes, recorded_at
     FROM credit_entries ORDER BY recorded_at`
  );
  return rows.map(r => ({
    id: r.id,
    customer_id: r.customer_id,
    type: r.type,
    amount: r.amount,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  }));
}

export async function addCustomer(
  db: SQLiteDatabase,
  name: string,
  phone: string | null = null,
  now: number = Date.now()
): Promise<number> {
  const result = await db.runAsync(
    'INSERT INTO customers (name, phone, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [name.trim(), phone?.trim() || null, now, now]
  );
  return result.lastInsertRowId;
}

/**
 * Record credit taken or a payment received.
 *
 * The ledger is append-only: a mistake is corrected by adding the opposite
 * entry, never by editing history. That way the book always reconciles, and
 * the owner can see what actually happened.
 */
export async function recordCreditEntry(
  db: SQLiteDatabase,
  customerId: number,
  type: CreditEntry['type'],
  amount: number,
  notes: string | null = null,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    `INSERT INTO credit_entries (customer_id, type, amount, notes, recorded_at)
     VALUES (?, ?, ?, ?, ?)`,
    [customerId, type, amount, notes?.trim() || null, now]
  );
  await db.runAsync('UPDATE customers SET updated_at = ? WHERE id = ?', [now, customerId]);
}

/**
 * Hide a customer without deleting their history.
 *
 * Their entries stay in the ledger, so past totals never silently change.
 */
export async function deactivateCustomer(
  db: SQLiteDatabase,
  customerId: number,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    'UPDATE customers SET is_active = 0, updated_at = ? WHERE id = ?',
    [now, customerId]
  );
}

// ============================================
// EXPENSES
// ============================================

interface ExpenseRow {
  id: number;
  category: ExpenseCategory;
  amount: number;
  notes: string | null;
  recorded_at: number;
}

/**
 * Load expenses, newest first.
 *
 * Pass `since` to bound the scan. Unlike credit, there is no carry-over to
 * worry about: an expense belongs to the period it was paid in and nothing
 * before that window affects it.
 */
export async function loadExpenses(
  db: SQLiteDatabase,
  since?: number
): Promise<Expense[]> {
  const rows = since != null
    ? await db.getAllAsync<ExpenseRow>(
        `SELECT id, category, amount, notes, recorded_at FROM expenses
         WHERE recorded_at >= ? ORDER BY recorded_at DESC`,
        [since]
      )
    : await db.getAllAsync<ExpenseRow>(
        `SELECT id, category, amount, notes, recorded_at FROM expenses
         ORDER BY recorded_at DESC`
      );

  return rows.map(r => ({
    id: r.id,
    category: r.category,
    amount: r.amount,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  }));
}

/**
 * Record a running cost.
 *
 * Deliberately has no way to record a stock purchase -- those go through
 * recordStockIn, because they are already the cost side of gross profit.
 */
export async function recordExpense(
  db: SQLiteDatabase,
  category: ExpenseCategory,
  amount: number,
  notes: string | null = null,
  now: number = Date.now()
): Promise<number> {
  const result = await db.runAsync(
    `INSERT INTO expenses (category, amount, notes, recorded_at) VALUES (?, ?, ?, ?)`,
    [category, amount, notes?.trim() || null, now]
  );
  return result.lastInsertRowId;
}

/**
 * Remove an expense outright.
 *
 * Unlike the credit ledger, this is a real delete. A credit entry is a claim
 * against another person, so its history matters and corrections are made by
 * adding an opposite entry. An expense is just the owner's own record of what
 * they paid; a typo there is noise, and leaving a reversal pair in the list
 * would make the screen harder to read than the mistake it fixes.
 */
export async function deleteExpense(db: SQLiteDatabase, expenseId: number): Promise<void> {
  await db.runAsync('DELETE FROM expenses WHERE id = ?', [expenseId]);
}

// ============================================
// CASH-UP
// ============================================

export interface CashUp {
  id: number;
  counted_amount: number;
  expected_amount: number;
  difference: number;
  taken_out: number;
  /** True for the very first cash-up, which sets a baseline instead of reconciling. */
  is_opening: boolean;
  notes?: string;
  recorded_at: number;
}

interface CashUpRow {
  id: number;
  counted_amount: number;
  expected_amount: number;
  difference: number;
  taken_out: number;
  is_opening: number;
  notes: string | null;
  recorded_at: number;
}

function toCashUp(r: CashUpRow): CashUp {
  return {
    id: r.id,
    counted_amount: r.counted_amount,
    expected_amount: r.expected_amount,
    difference: r.difference,
    taken_out: r.taken_out,
    is_opening: r.is_opening === 1,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  };
}

export async function loadCashUps(db: SQLiteDatabase, limit = 30): Promise<CashUp[]> {
  const rows = await db.getAllAsync<CashUpRow>(
    `SELECT id, counted_amount, expected_amount, difference, taken_out, is_opening, notes, recorded_at
     FROM cash_ups ORDER BY recorded_at DESC LIMIT ?`,
    [limit]
  );
  return rows.map(toCashUp);
}

/**
 * The cash-up that sets the baseline for the next one.
 *
 * Ordered by recorded_at, then id: two cash-ups in the same millisecond is
 * absurd in real use but trivial in tests, and an ambiguous "last" would make
 * the opening balance nondeterministic.
 */
export async function getLastCashUp(db: SQLiteDatabase): Promise<CashUp | null> {
  const row = await db.getFirstAsync<CashUpRow>(
    `SELECT id, counted_amount, expected_amount, difference, taken_out, is_opening, notes, recorded_at
     FROM cash_ups ORDER BY recorded_at DESC, id DESC LIMIT 1`
  );
  return row ? toCashUp(row) : null;
}

/**
 * Record a cash-up.
 *
 * expected and difference are written as given, not recalculated later. The
 * owner reconciled against the number they were shown; see the note on
 * cash_ups in schema.ts.
 */
export async function recordCashUp(
  db: SQLiteDatabase,
  result: Pick<CashUpResult, 'counted' | 'expected' | 'difference'>,
  options: { takenOut?: number; isOpening?: boolean; notes?: string | null } = {},
  now: number = Date.now()
): Promise<number> {
  const insert = await db.runAsync(
    `INSERT INTO cash_ups (counted_amount, expected_amount, difference, taken_out, is_opening, notes, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      result.counted,
      result.expected,
      result.difference,
      options.takenOut ?? 0,
      options.isOpening ? 1 : 0,
      options.notes?.trim() || null,
      now,
    ]
  );
  return insert.lastInsertRowId;
}

/**
 * Cash left in the till after a cash-up, which is where the next one starts.
 * Returns null when there is no baseline yet.
 */
export function openingBalanceFrom(last: CashUp | null): number | null {
  if (last == null) return null;
  return Math.round((last.counted_amount - last.taken_out) * 100) / 100;
}

/**
 * Total paid to suppliers in a window -- cash out of the till.
 *
 * Read straight from total_cost rather than via the profit engine: this is what
 * the owner actually handed over, including any part of a delivery not yet
 * priced per unit.
 */
export async function stockPurchaseTotal(
  db: SQLiteDatabase,
  start: number,
  end: number
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(total_cost) as total FROM stock_movements
     WHERE type = 'STOCK_IN' AND recorded_at >= ? AND recorded_at <= ?`,
    [start, end]
  );
  return row?.total ?? 0;
}
