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
import { SCHEMA_VERSION } from './schema';

function requireNonNegativeInteger(value: number, label: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a whole number of zero or more.`);
  }
}

function requirePositiveNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be greater than zero.`);
  }
}

function requireOptionalNonNegativeNumber(value: number | null | undefined, label: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`${label} cannot be negative.`);
  }
}

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

/** Add a product and its optional opening count as one indivisible write. */
export async function addProduct(
  db: SQLiteDatabase,
  details: {
    name: string;
    buyPrice?: number | null;
    sellPrice?: number | null;
    quantity?: number;
  },
  now: number = Date.now()
): Promise<number> {
  const name = details.name.trim();
  if (!name) throw new Error('Product name is required.');
  const quantity = details.quantity ?? 0;
  requireNonNegativeInteger(quantity, 'Current stock');
  requireOptionalNonNegativeNumber(details.buyPrice, 'Buy price');
  requireOptionalNonNegativeNumber(details.sellPrice, 'Sell price');

  let productId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products (name, buy_price, sell_price, current_qty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, details.buyPrice ?? null, details.sellPrice ?? null, quantity, now, now]
    );
    productId = result.lastInsertRowId;

    if (quantity > 0) {
      await db.runAsync(
        `INSERT INTO stock_movements (product_id, type, quantity, sell_price_at_time, recorded_at)
         VALUES (?, 'COUNT', ?, ?, ?)`,
        [productId, quantity, details.sellPrice ?? null, now]
      );
    }
  });
  return productId;
}

export async function updateProduct(
  db: SQLiteDatabase,
  productId: number,
  details: { name: string; buyPrice?: number | null; sellPrice?: number | null },
  now: number = Date.now()
): Promise<void> {
  const name = details.name.trim();
  if (!name) throw new Error('Product name is required.');
  requireOptionalNonNegativeNumber(details.buyPrice, 'Buy price');
  requireOptionalNonNegativeNumber(details.sellPrice, 'Sell price');
  await db.runAsync(
    'UPDATE products SET name = ?, buy_price = ?, sell_price = ?, updated_at = ? WHERE id = ?',
    [name, details.buyPrice ?? null, details.sellPrice ?? null, now, productId]
  );
}

export async function deactivateProduct(
  db: SQLiteDatabase,
  productId: number,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    'UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?',
    [now, productId]
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
async function writeCount(
  db: SQLiteDatabase,
  product: AppProduct,
  quantity: number,
  sessionId: number,
  now: number = Date.now()
): Promise<void> {
  requireNonNegativeInteger(quantity, 'Count');
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

export async function recordCount(
  db: SQLiteDatabase,
  product: AppProduct,
  quantity: number,
  sessionId: number,
  now: number = Date.now()
): Promise<void> {
  await db.withTransactionAsync(() => writeCount(db, product, quantity, sessionId, now));
}

export interface CountEntryInput {
  product: AppProduct;
  quantity: number;
}

export interface SavedCountSession {
  sessionId: number;
  completedAt: number;
}

/** Save the session, every movement, and every current quantity atomically. */
export async function saveCountSession(
  db: SQLiteDatabase,
  entries: CountEntryInput[],
  totalProducts: number,
  now: number = Date.now()
): Promise<SavedCountSession> {
  if (entries.length === 0) throw new Error('Count at least one product.');
  entries.forEach(entry => requireNonNegativeInteger(entry.quantity, 'Count'));

  let sessionId = 0;
  await db.withTransactionAsync(async () => {
    const session = await db.runAsync(
      `INSERT INTO count_sessions
         (started_at, completed_at, products_counted, total_products)
       VALUES (?, ?, ?, ?)`,
      [now, now, entries.length, totalProducts]
    );
    sessionId = session.lastInsertRowId;

    for (const entry of entries) {
      await writeCount(db, entry.product, entry.quantity, sessionId, now);
    }
  });

  return { sessionId, completedAt: now };
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
): Promise<number> {
  requirePositiveNumber(quantity, 'Quantity');
  if (!Number.isInteger(quantity)) throw new Error('Quantity must be a whole number.');
  requirePositiveNumber(totalCost, 'Total cost');
  const costPerUnit = totalCost / quantity;
  let movementId = 0;

  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO stock_movements
         (product_id, type, quantity, buy_price_at_time, total_cost, notes, recorded_at)
       VALUES (?, 'STOCK_IN', ?, ?, ?, ?, ?)`,
      [
        product.id,
        quantity,
        costPerUnit,
        totalCost,
        `undo_previous_buy_price:${product.buy_price == null ? 'null' : product.buy_price}`,
        now,
      ]
    );
    movementId = result.lastInsertRowId;
    await db.runAsync(
      `UPDATE products SET current_qty = current_qty + ?, buy_price = ?, updated_at = ? WHERE id = ?`,
      [quantity, costPerUnit, now, product.id]
    );
  });

  return movementId;
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
  due_at: number | null;
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
    `SELECT id, customer_id, type, amount, notes, due_at, recorded_at
     FROM credit_entries ORDER BY recorded_at`
  );
  return rows.map(r => ({
    id: r.id,
    customer_id: r.customer_id,
    type: r.type,
    amount: r.amount,
    notes: r.notes ?? undefined,
    due_at: r.due_at ?? undefined,
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
  dueAt: number | null = null,
  now: number = Date.now()
): Promise<void> {
  await db.withTransactionAsync(() =>
    writeCreditEntry(db, customerId, type, amount, notes, dueAt, now)
  );
}

async function writeCreditEntry(
  db: SQLiteDatabase,
  customerId: number,
  type: CreditEntry['type'],
  amount: number,
  notes: string | null,
  dueAt: number | null,
  now: number
): Promise<void> {
  requirePositiveNumber(amount, 'Credit amount');
  await db.runAsync(
    `INSERT INTO credit_entries (customer_id, type, amount, notes, due_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    // A due date only means something on a debt: a payment is not promised, it
    // has happened.
    [customerId, type, amount, notes?.trim() || null, type === 'CREDIT' ? dueAt : null, now]
  );
  await db.runAsync('UPDATE customers SET updated_at = ? WHERE id = ?', [now, customerId]);
}

/**
 * Add someone to the book, optionally with what they are taking right now.
 *
 * Both halves are written together because that is the real moment: a customer
 * is at the counter with bread in their hand. Adding a bare name and then
 * hunting for them to attach a debt is not a thing anyone does.
 *
 * `openingCredit` is optional -- an owner may genuinely want to add a regular
 * ahead of time -- but the screen leads with it.
 */
export async function addCustomerToBook(
  db: SQLiteDatabase,
  details: { name: string; phone?: string | null },
  openingCredit?: { amount: number; notes?: string | null; dueAt?: number | null },
  now: number = Date.now()
): Promise<number> {
  if (!details.name.trim()) throw new Error('Customer name is required.');
  if (openingCredit) requirePositiveNumber(openingCredit.amount, 'Credit amount');
  let customerId = 0;
  await db.withTransactionAsync(async () => {
    customerId = await addCustomer(db, details.name, details.phone ?? null, now);

    if (openingCredit) {
      await writeCreditEntry(
        db,
        customerId,
        'CREDIT',
        openingCredit.amount,
        openingCredit.notes ?? null,
        openingCredit.dueAt ?? null,
        now
      );
    }
  });
  return customerId;
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

// ============================================
// COUNT HISTORY, CORRECTIONS, AND HOME STATE
// ============================================

export interface CountSessionSummary {
  id: number;
  completed_at: number;
  products_counted: number;
}

export async function getLatestCountSession(
  db: SQLiteDatabase
): Promise<CountSessionSummary | null> {
  return db.getFirstAsync<CountSessionSummary>(
    `SELECT id, completed_at, products_counted
     FROM count_sessions
     WHERE completed_at IS NOT NULL
     ORDER BY completed_at DESC, id DESC LIMIT 1`
  );
}

export async function loadCountSessionProductIds(
  db: SQLiteDatabase,
  sessionId: number
): Promise<number[]> {
  const rows = await db.getAllAsync<{ product_id: number }>(
    `SELECT product_id FROM stock_movements
     WHERE type = 'COUNT' AND session_id = ? ORDER BY product_id`,
    [sessionId]
  );
  return rows.map(row => row.product_id);
}

export async function loadPreviouslyCountedProductIds(
  db: SQLiteDatabase
): Promise<number[]> {
  const rows = await db.getAllAsync<{ product_id: number }>(
    `SELECT DISTINCT product_id FROM stock_movements WHERE type = 'COUNT'`
  );
  return rows.map(row => row.product_id);
}

const COUNT_UNDO_WINDOW_MS = 60 * 60 * 1000;
const STOCK_IN_UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

async function recomputeCurrentQuantity(db: SQLiteDatabase, productId: number, now: number): Promise<void> {
  const movements = await db.getAllAsync<{ type: 'COUNT' | 'STOCK_IN'; quantity: number }>(
    `SELECT type, quantity FROM stock_movements
     WHERE product_id = ? ORDER BY recorded_at, id`,
    [productId]
  );
  let quantity = 0;
  for (const movement of movements) {
    if (movement.type === 'COUNT') quantity = movement.quantity;
    else quantity += movement.quantity;
  }
  await db.runAsync(
    'UPDATE products SET current_qty = ?, updated_at = ? WHERE id = ?',
    [quantity, now, productId]
  );
}

/** Undo only the most recent count session, and only within its one-hour window. */
export async function undoCountSession(
  db: SQLiteDatabase,
  sessionId: number,
  now: number = Date.now()
): Promise<boolean> {
  const latest = await getLatestCountSession(db);
  if (!latest || latest.id !== sessionId || now - latest.completed_at > COUNT_UNDO_WINDOW_MS) {
    return false;
  }

  const productIds = await loadCountSessionProductIds(db, sessionId);
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM stock_movements WHERE type = 'COUNT' AND session_id = ?`,
      [sessionId]
    );
    await db.runAsync('DELETE FROM count_sessions WHERE id = ?', [sessionId]);
    for (const productId of productIds) {
      await recomputeCurrentQuantity(db, productId, now);
    }
  });
  return true;
}

/** Undo a recent delivery and restore both quantity and the prior buy price. */
export async function undoStockIn(
  db: SQLiteDatabase,
  movementId: number,
  now: number = Date.now()
): Promise<boolean> {
  const movement = await db.getFirstAsync<{
    id: number;
    product_id: number;
    notes: string | null;
    recorded_at: number;
  }>(
    `SELECT id, product_id, notes, recorded_at FROM stock_movements
     WHERE id = ? AND type = 'STOCK_IN'`,
    [movementId]
  );
  if (!movement || now - movement.recorded_at > STOCK_IN_UNDO_WINDOW_MS) return false;

  const prefix = 'undo_previous_buy_price:';
  const encoded = movement.notes?.startsWith(prefix) ? movement.notes.slice(prefix.length) : undefined;
  const previousBuyPrice = encoded === 'null'
    ? null
    : encoded != null && Number.isFinite(Number(encoded))
      ? Number(encoded)
      : undefined;

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM stock_movements WHERE id = ?', [movementId]);
    await recomputeCurrentQuantity(db, movement.product_id, now);
    if (previousBuyPrice !== undefined) {
      await db.runAsync(
        'UPDATE products SET buy_price = ?, updated_at = ? WHERE id = ?',
        [previousBuyPrice, now, movement.product_id]
      );
    }
  });
  return true;
}

// ============================================
// COMPLETE, VERSIONED BACKUP AND RESTORE
// ============================================

export const BACKUP_FORMAT_VERSION = 1;

export interface ShopTrackBackupData {
  products: any[];
  stock_movements: any[];
  count_sessions: any[];
  customers: any[];
  credit_entries: any[];
  expenses: any[];
  cash_ups: any[];
}

export interface ShopTrackBackup {
  shoptrack_backup: true;
  backup_format_version: typeof BACKUP_FORMAT_VERSION;
  schema_version: number;
  created_at: string;
  data: ShopTrackBackupData;
}

export async function createBackup(db: SQLiteDatabase): Promise<ShopTrackBackup> {
  const [products, stockMovements, countSessions, customers, creditEntries, expenses, cashUps] =
    await Promise.all([
      db.getAllAsync('SELECT * FROM products ORDER BY id'),
      db.getAllAsync('SELECT * FROM stock_movements ORDER BY id'),
      db.getAllAsync('SELECT * FROM count_sessions ORDER BY id'),
      db.getAllAsync('SELECT * FROM customers ORDER BY id'),
      db.getAllAsync('SELECT * FROM credit_entries ORDER BY id'),
      db.getAllAsync('SELECT * FROM expenses ORDER BY id'),
      db.getAllAsync('SELECT * FROM cash_ups ORDER BY id'),
    ]);

  return {
    shoptrack_backup: true,
    backup_format_version: BACKUP_FORMAT_VERSION,
    schema_version: SCHEMA_VERSION,
    created_at: new Date().toISOString(),
    data: {
      products,
      stock_movements: stockMovements,
      count_sessions: countSessions,
      customers,
      credit_entries: creditEntries,
      expenses,
      cash_ups: cashUps,
    },
  };
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function rows(value: unknown, name: string): any[] {
  if (!Array.isArray(value) || !value.every(isRecord)) {
    throw new Error(`Backup table ${name} is invalid.`);
  }
  return value;
}

/** Validate current backups and upgrade the pre-pilot three-table format. */
export function normaliseBackup(value: unknown): ShopTrackBackup {
  if (!isRecord(value) || value.shoptrack_backup !== true || !isRecord(value.data)) {
    throw new Error('Not a ShopTrack backup.');
  }

  const isCurrent = value.backup_format_version === BACKUP_FORMAT_VERSION;
  const isLegacy = value.backup_format_version == null && value.version === 5;
  if (!isCurrent && !isLegacy) {
    throw new Error('This backup format is not supported.');
  }

  const data = value.data;
  return {
    shoptrack_backup: true,
    backup_format_version: BACKUP_FORMAT_VERSION,
    schema_version: typeof value.schema_version === 'number'
      ? value.schema_version
      : typeof value.version === 'number'
        ? value.version
        : SCHEMA_VERSION,
    created_at: typeof value.created_at === 'string' ? value.created_at : new Date(0).toISOString(),
    data: {
      products: rows(data.products, 'products'),
      stock_movements: rows(data.stock_movements, 'stock_movements'),
      count_sessions: rows(data.count_sessions, 'count_sessions'),
      customers: isLegacy ? [] : rows(data.customers, 'customers'),
      credit_entries: isLegacy ? [] : rows(data.credit_entries, 'credit_entries'),
      expenses: isLegacy ? [] : rows(data.expenses, 'expenses'),
      cash_ups: isLegacy ? [] : rows(data.cash_ups, 'cash_ups'),
    },
  };
}

/** Replace all seven data sets in a single transaction. */
export async function restoreBackup(db: SQLiteDatabase, value: unknown): Promise<void> {
  const backup = normaliseBackup(value);
  const data = backup.data;

  await db.withTransactionAsync(async () => {
    await db.execAsync(`
      DELETE FROM credit_entries;
      DELETE FROM cash_ups;
      DELETE FROM expenses;
      DELETE FROM stock_movements;
      DELETE FROM count_sessions;
      DELETE FROM customers;
      DELETE FROM products;
    `);

    for (const product of data.products) {
      await db.runAsync(
        `INSERT INTO products
           (id, name, unit_label, buy_price, sell_price, current_qty,
            low_stock_threshold, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id, product.name, product.unit_label ?? 'units', product.buy_price ?? null,
          product.sell_price ?? null, product.current_qty ?? 0, product.low_stock_threshold ?? 5,
          product.is_active ?? 1, product.created_at ?? 0, product.updated_at ?? 0,
        ]
      );
    }
    for (const session of data.count_sessions) {
      await db.runAsync(
        `INSERT INTO count_sessions
           (id, started_at, completed_at, products_counted, total_products, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          session.id, session.started_at, session.completed_at ?? null,
          session.products_counted ?? 0, session.total_products ?? 0, session.notes ?? null,
        ]
      );
    }
    for (const customer of data.customers) {
      await db.runAsync(
        `INSERT INTO customers (id, name, phone, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          customer.id, customer.name, customer.phone ?? null, customer.is_active ?? 1,
          customer.created_at ?? 0, customer.updated_at ?? 0,
        ]
      );
    }
    for (const movement of data.stock_movements) {
      await db.runAsync(
        `INSERT INTO stock_movements
           (id, product_id, type, quantity, buy_price_at_time, sell_price_at_time,
            total_cost, notes, session_id, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          movement.id, movement.product_id, movement.type, movement.quantity,
          movement.buy_price_at_time ?? null, movement.sell_price_at_time ?? null,
          movement.total_cost ?? null, movement.notes ?? null, movement.session_id ?? null,
          movement.recorded_at,
        ]
      );
    }
    for (const entry of data.credit_entries) {
      await db.runAsync(
        `INSERT INTO credit_entries
           (id, customer_id, type, amount, notes, due_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, entry.customer_id, entry.type, entry.amount, entry.notes ?? null,
          entry.due_at ?? null, entry.recorded_at,
        ]
      );
    }
    for (const expense of data.expenses) {
      await db.runAsync(
        `INSERT INTO expenses (id, category, amount, notes, recorded_at)
         VALUES (?, ?, ?, ?, ?)`,
        [expense.id, expense.category, expense.amount, expense.notes ?? null, expense.recorded_at]
      );
    }
    for (const cashUp of data.cash_ups) {
      await db.runAsync(
        `INSERT INTO cash_ups
           (id, counted_amount, expected_amount, difference, taken_out, is_opening, notes, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cashUp.id, cashUp.counted_amount, cashUp.expected_amount, cashUp.difference,
          cashUp.taken_out ?? 0, cashUp.is_opening ?? 0, cashUp.notes ?? null, cashUp.recorded_at,
        ]
      );
    }
  });
}
