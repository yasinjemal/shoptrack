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
import { PAYMENT_METHODS, type CreditEntry, type Customer, type PaymentMethod } from './credit';
import type { Expense, ExpenseCategory } from './expenses';
import type { CashUpResult } from './cashup';
import type { SalesEntry, SalesPeriod } from './sales';
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
  barcode?: string | null;
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
    barcode?: string | null;
    buyPrice?: number | null;
    sellPrice?: number | null;
    quantity?: number;
  },
  now: number = Date.now()
): Promise<number> {
  const name = details.name.trim();
  if (!name) throw new Error('Product name is required.');
  const barcode = details.barcode?.trim() || null;
  const quantity = details.quantity ?? 0;
  requireNonNegativeInteger(quantity, 'Current stock');
  requireOptionalNonNegativeNumber(details.buyPrice, 'Buy price');
  requireOptionalNonNegativeNumber(details.sellPrice, 'Sell price');

  let productId = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync(
      `INSERT INTO products (name, barcode, buy_price, sell_price, current_qty, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [name, barcode, details.buyPrice ?? null, details.sellPrice ?? null, quantity, now, now]
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
  details: { name: string; barcode?: string | null; buyPrice?: number | null; sellPrice?: number | null },
  now: number = Date.now()
): Promise<void> {
  const name = details.name.trim();
  if (!name) throw new Error('Product name is required.');
  requireOptionalNonNegativeNumber(details.buyPrice, 'Buy price');
  requireOptionalNonNegativeNumber(details.sellPrice, 'Sell price');
  const barcode = details.barcode?.trim() || null;
  await db.runAsync(
    'UPDATE products SET name = ?, barcode = ?, buy_price = ?, sell_price = ?, updated_at = ? WHERE id = ?',
    [name, barcode, details.buyPrice ?? null, details.sellPrice ?? null, now, productId]
  );
}

export async function findProductByBarcode(
  db: SQLiteDatabase,
  barcode: string
): Promise<AppProduct | null> {
  const clean = barcode.trim();
  if (!clean) return null;
  return db.getFirstAsync<AppProduct>(
    'SELECT * FROM products WHERE is_active = 1 AND barcode = ? LIMIT 1',
    [clean]
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

export interface RecentProductCount {
  product_id: number;
  quantity: number;
  recorded_at: number;
}

/** One indexed query for the latest N counts of every product (no N+1 scan). */
export async function loadRecentProductCounts(
  db: SQLiteDatabase,
  perProduct = 3
): Promise<Map<number, RecentProductCount[]>> {
  if (!Number.isInteger(perProduct) || perProduct < 1 || perProduct > 20) {
    throw new Error('Recent count page size must be between 1 and 20.');
  }
  const rows = await db.getAllAsync<RecentProductCount>(
    `SELECT product_id, quantity, recorded_at FROM (
       SELECT product_id, quantity, recorded_at,
              ROW_NUMBER() OVER (PARTITION BY product_id ORDER BY recorded_at DESC, id DESC) AS rank
       FROM stock_movements WHERE type = 'COUNT'
     ) WHERE rank <= ? ORDER BY product_id, recorded_at DESC`,
    [perProduct]
  );
  const byProduct = new Map<number, RecentProductCount[]>();
  for (const row of rows) {
    const counts = byProduct.get(row.product_id) ?? [];
    counts.push(row);
    byProduct.set(row.product_id, counts);
  }
  return byProduct;
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
  now: number = Date.now(),
  options: { recordedBy?: number | null } = {}
): Promise<SavedCountSession> {
  if (entries.length === 0) throw new Error('Count at least one product.');
  entries.forEach(entry => requireNonNegativeInteger(entry.quantity, 'Count'));

  let sessionId = 0;
  await db.withTransactionAsync(async () => {
    const session = await db.runAsync(
      `INSERT INTO count_sessions
         (started_at, completed_at, products_counted, total_products, recorded_by)
       VALUES (?, ?, ?, ?, ?)`,
      [now, now, entries.length, totalProducts, options.recordedBy ?? null]
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
  payment_method: string | null;
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
    `SELECT id, customer_id, type, amount, notes, payment_method, due_at, recorded_at
     FROM credit_entries ORDER BY recorded_at`
  );
  return rows.map(r => ({
    id: r.id,
    customer_id: r.customer_id,
    type: r.type,
    amount: r.amount,
    notes: r.notes ?? undefined,
    payment_method: (r.payment_method as PaymentMethod | null) ?? undefined,
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
  now: number = Date.now(),
  paymentMethod: PaymentMethod | null = null
): Promise<void> {
  await db.withTransactionAsync(() =>
    writeCreditEntry(db, customerId, type, amount, notes, dueAt, now, paymentMethod)
  );
}

async function writeCreditEntry(
  db: SQLiteDatabase,
  customerId: number,
  type: CreditEntry['type'],
  amount: number,
  notes: string | null,
  dueAt: number | null,
  now: number,
  paymentMethod: PaymentMethod | null = null
): Promise<void> {
  requirePositiveNumber(amount, 'Credit amount');
  if (paymentMethod != null && !PAYMENT_METHODS.includes(paymentMethod)) {
    throw new Error(`Unknown payment method: ${paymentMethod}`);
  }
  await db.runAsync(
    `INSERT INTO credit_entries (customer_id, type, amount, notes, payment_method, due_at, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    // A due date only means something on a debt: a payment is not promised, it
    // has happened. A payment method runs the other way: only money that
    // arrived has a way it arrived.
    [
      customerId, type, amount, notes?.trim() || null,
      type === 'PAYMENT' ? paymentMethod : null,
      type === 'CREDIT' ? dueAt : null,
      now,
    ]
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
  /** Takings that arrived digitally (mobile money / card). Undefined = unrecorded. */
  digital_takings?: number;
  /** Who ran this cash-up (staff mode). Undefined = nobody in particular. */
  recorded_by?: number;
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
  digital_takings: number | null;
  recorded_by: number | null;
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
    digital_takings: r.digital_takings ?? undefined,
    recorded_by: r.recorded_by ?? undefined,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  };
}

export async function loadCashUps(db: SQLiteDatabase, limit = 30): Promise<CashUp[]> {
  const rows = await db.getAllAsync<CashUpRow>(
    `SELECT id, counted_amount, expected_amount, difference, taken_out, is_opening,
            digital_takings, recorded_by, notes, recorded_at
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
    `SELECT id, counted_amount, expected_amount, difference, taken_out, is_opening,
            digital_takings, recorded_by, notes, recorded_at
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
  options: {
    takenOut?: number;
    isOpening?: boolean;
    notes?: string | null;
    /** Takings that arrived digitally (mobile money / card). Recording only. */
    digitalTakings?: number | null;
    /** Who ran this cash-up (staff mode). */
    recordedBy?: number | null;
  } = {},
  now: number = Date.now()
): Promise<number> {
  if (options.digitalTakings != null && options.digitalTakings < 0) {
    throw new Error('Digital takings cannot be negative.');
  }
  const insert = await db.runAsync(
    `INSERT INTO cash_ups (counted_amount, expected_amount, difference, taken_out, is_opening,
                           digital_takings, recorded_by, notes, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      result.counted,
      result.expected,
      result.difference,
      options.takenOut ?? 0,
      options.isOpening ? 1 : 0,
      options.digitalTakings ?? null,
      options.recordedBy ?? null,
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
// ============================================
// SALES BOOK
// ============================================

interface SalesEntryRow {
  id: number;
  period: SalesPeriod;
  period_key: string;
  amount: number;
  margin_pct: number;
  notes: string | null;
  recorded_at: number;
}

/**
 * The whole book.
 *
 * Deliberately unbounded: the point of this feature is the owner's history,
 * and a shop with three years of monthly totals has 36 rows. Even five years of
 * daily entries is under 2,000 -- nothing worth paginating on a phone.
 */
export async function loadSalesEntries(db: SQLiteDatabase): Promise<SalesEntry[]> {
  const rows = await db.getAllAsync<SalesEntryRow>(
    `SELECT id, period, period_key, amount, margin_pct, notes, recorded_at
     FROM sales_entries ORDER BY period_key DESC`
  );
  return rows.map(r => ({
    id: r.id,
    period: r.period,
    period_key: r.period_key,
    amount: r.amount,
    margin_pct: r.margin_pct,
    notes: r.notes ?? undefined,
    recorded_at: r.recorded_at,
  }));
}

/**
 * Record takings for a day or a month.
 *
 * Upserts on (period, period_key): re-entering Tuesday replaces Tuesday rather
 * than adding a second Tuesday. An owner correcting a typo means "it was
 * actually this much", not "I took this much again" -- and the UNIQUE
 * constraint would reject the insert anyway.
 *
 * This is the opposite of the credit ledger, which is append-only. A debt is a
 * claim whose history matters; a day's takings is a single fact that was either
 * typed right or typed wrong.
 */
export async function recordSales(
  db: SQLiteDatabase,
  period: SalesPeriod,
  periodKey: string,
  amount: number,
  marginPct: number,
  notes: string | null = null,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sales_entries (period, period_key, amount, margin_pct, notes, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (period, period_key) DO UPDATE SET
       amount = excluded.amount,
       margin_pct = excluded.margin_pct,
       notes = excluded.notes,
       recorded_at = excluded.recorded_at`,
    [period, periodKey, amount, marginPct, notes?.trim() || null, now]
  );
}

/**
 * Save a whole month's worth of days at once.
 *
 * One transaction: filling in January from a paper book is a single act, and
 * half a month landing because the phone died mid-write is worse than none.
 *
 * A day the owner left blank is skipped entirely rather than stored as zero --
 * "I didn't fill that in" and "we took nothing that day" are different facts,
 * and only the second one is worth recording. To record a closed day, enter 0.
 *
 * Also clears any whole-month total for the month being detailed, since the two
 * would then describe the same trading.
 */
export async function recordSalesDays(
  db: SQLiteDatabase,
  monthKey: string,
  days: { dayKey: string; amount: number }[],
  marginPct: number,
  now: number = Date.now()
): Promise<void> {
  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `DELETE FROM sales_entries WHERE period = 'MONTH' AND period_key = ?`,
      [monthKey]
    );

    for (const day of days) {
      await db.runAsync(
        `INSERT INTO sales_entries (period, period_key, amount, margin_pct, notes, recorded_at)
         VALUES ('DAY', ?, ?, ?, NULL, ?)
         ON CONFLICT (period, period_key) DO UPDATE SET
           amount = excluded.amount,
           margin_pct = excluded.margin_pct,
           recorded_at = excluded.recorded_at`,
        [day.dayKey, day.amount, marginPct, now]
      );
    }
  });
}

/**
 * Remove every day recorded for a month. Used when the owner decides a month is
 * better described by one total than by the days they part-filled.
 */
export async function clearMonthDays(db: SQLiteDatabase, monthKey: string): Promise<void> {
  await db.runAsync(
    `DELETE FROM sales_entries WHERE period = 'DAY' AND period_key LIKE ?`,
    [`${monthKey}-%`]
  );
}

export async function deleteSalesEntry(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM sales_entries WHERE id = ?', [id]);
}

/**
 * Clear a month's summary once the owner starts recording its days, so the two
 * cannot describe the same trading at once.
 */
export async function clearMonthSummary(db: SQLiteDatabase, monthKey: string): Promise<void> {
  await db.runAsync(
    `DELETE FROM sales_entries WHERE period = 'MONTH' AND period_key = ?`,
    [monthKey]
  );
}

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
// SETTINGS
// ============================================

/**
 * Shop-level preferences that must travel inside backups (currency today,
 * country pack tomorrow). Phone-level preferences (language) stay in
 * AsyncStorage -- see the note on the settings table in schema.ts.
 */
export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [key]
  );
  return row?.value ?? null;
}

export async function setSetting(
  db: SQLiteDatabase,
  key: string,
  value: string,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
    [key, value, now]
  );
}

/** Every owner-created event timestamp, used only for the local habit metric. */
export async function loadActivityTimestamps(db: SQLiteDatabase): Promise<number[]> {
  const rows = await db.getAllAsync<{ at: number }>(`
    SELECT recorded_at AS at FROM stock_movements
    UNION ALL SELECT recorded_at AS at FROM credit_entries
    UNION ALL SELECT recorded_at AS at FROM expenses
    UNION ALL SELECT recorded_at AS at FROM cash_ups
    UNION ALL SELECT recorded_at AS at FROM sales_entries
    UNION ALL SELECT completed_at AS at FROM count_sessions WHERE completed_at IS NOT NULL
  `);
  return rows.map(row => row.at);
}

// ============================================
// STAFF MODE
// ============================================

export interface StaffMember {
  id: number;
  name: string;
  /** Attributes actions; does not secure them. See schema.ts. */
  pin: string;
  is_active: boolean;
  created_at: number;
}

interface StaffRow {
  id: number;
  name: string;
  pin: string;
  is_active: number;
  created_at: number;
}

export async function loadStaffMembers(db: SQLiteDatabase): Promise<StaffMember[]> {
  const rows = await db.getAllAsync<StaffRow>(
    'SELECT id, name, pin, is_active, created_at FROM staff_members WHERE is_active = 1 ORDER BY name'
  );
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    pin: r.pin,
    is_active: r.is_active === 1,
    created_at: r.created_at,
  }));
}

export async function addStaffMember(
  db: SQLiteDatabase,
  name: string,
  pin: string,
  now: number = Date.now()
): Promise<number> {
  if (!name.trim()) throw new Error('Staff name is required.');
  if (!/^\d{4}$/.test(pin)) throw new Error('PIN must be exactly 4 digits.');
  const result = await db.runAsync(
    'INSERT INTO staff_members (name, pin, is_active, created_at, updated_at) VALUES (?, ?, 1, ?, ?)',
    [name.trim(), pin, now, now]
  );
  return result.lastInsertRowId;
}

/** Hide a staff member. Their recorded_by history survives, like customers. */
export async function deactivateStaffMember(
  db: SQLiteDatabase,
  staffId: number,
  now: number = Date.now()
): Promise<void> {
  await db.runAsync(
    'UPDATE staff_members SET is_active = 0, updated_at = ? WHERE id = ?',
    [now, staffId]
  );
}

/** The staff member matching a typed PIN, or null. Attribution, not security. */
export async function findStaffByPin(
  db: SQLiteDatabase,
  pin: string
): Promise<StaffMember | null> {
  const members = await loadStaffMembers(db);
  return members.find(m => m.pin === pin) ?? null;
}

// ============================================
// COMPLETE, VERSIONED BACKUP AND RESTORE
// ============================================

/**
 * Backup versions deliberately advance independently from the SQLite schema:
 *   1 - the original seven-table backup
 *   2 - sales book
 *   3 - settings/currency
 *   4 - payment methods and digital takings
 *   5 - staff and recorded_by attribution
 *   6 - optional product barcodes
 *
 * Keeping these steps explicit matters when an old phone is restored straight
 * onto a current install. Missing nullable fields must become null; values from
 * a newer in-memory object must never leak into an older declared format.
 */
export const BACKUP_FORMAT_VERSION = 6;

export interface ShopTrackBackupData {
  products: any[];
  stock_movements: any[];
  count_sessions: any[];
  customers: any[];
  credit_entries: any[];
  expenses: any[];
  cash_ups: any[];
  sales_entries: any[];
  settings: any[];
  staff_members: any[];
}

export interface ShopTrackBackup {
  shoptrack_backup: true;
  backup_format_version: typeof BACKUP_FORMAT_VERSION;
  schema_version: number;
  created_at: string;
  data: ShopTrackBackupData;
}

export async function createBackup(db: SQLiteDatabase): Promise<ShopTrackBackup> {
  const [products, stockMovements, countSessions, customers, creditEntries, expenses, cashUps, salesEntries, settings, staffMembers] =
    await Promise.all([
      db.getAllAsync('SELECT * FROM products ORDER BY id'),
      db.getAllAsync('SELECT * FROM stock_movements ORDER BY id'),
      db.getAllAsync('SELECT * FROM count_sessions ORDER BY id'),
      db.getAllAsync('SELECT * FROM customers ORDER BY id'),
      db.getAllAsync('SELECT * FROM credit_entries ORDER BY id'),
      db.getAllAsync('SELECT * FROM expenses ORDER BY id'),
      db.getAllAsync('SELECT * FROM cash_ups ORDER BY id'),
      db.getAllAsync('SELECT * FROM sales_entries ORDER BY id'),
      db.getAllAsync('SELECT * FROM settings ORDER BY key'),
      db.getAllAsync('SELECT * FROM staff_members ORDER BY id'),
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
      sales_entries: salesEntries,
      settings,
      staff_members: staffMembers,
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

/**
 * Validate current backups and upgrade every older format. A backup's declared
 * format is authoritative: a format-1 object that happens to contain a newer
 * recorded_by property is still treated as pre-staff data. This also prevents
 * dangling foreign keys when test tools or hand-edited backups mix shapes.
 */
export function normaliseBackup(value: unknown): ShopTrackBackup {
  if (!isRecord(value) || value.shoptrack_backup !== true || !isRecord(value.data)) {
    throw new Error('Not a ShopTrack backup.');
  }

  const declaredFormat = value.backup_format_version;
  const isVersioned = Number.isInteger(declaredFormat) && declaredFormat >= 1 && declaredFormat <= BACKUP_FORMAT_VERSION;
  const isLegacy = value.backup_format_version == null && value.version === 5;
  if (!isVersioned && !isLegacy) {
    throw new Error('This backup format is not supported.');
  }

  const sourceFormat = isLegacy ? 0 : Number(declaredFormat);

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
      products: rows(data.products, 'products').map(product => ({
        ...product,
        barcode: sourceFormat >= 6 ? product.barcode ?? null : null,
      })),
      stock_movements: rows(data.stock_movements, 'stock_movements'),
      count_sessions: rows(data.count_sessions, 'count_sessions').map(session => ({
        ...session,
        recorded_by: sourceFormat >= 5 ? session.recorded_by ?? null : null,
      })),
      customers: isLegacy ? [] : rows(data.customers, 'customers'),
      credit_entries: isLegacy
        ? []
        : rows(data.credit_entries, 'credit_entries').map(entry => ({
            ...entry,
            payment_method: sourceFormat >= 4 ? entry.payment_method ?? null : null,
          })),
      expenses: isLegacy ? [] : rows(data.expenses, 'expenses'),
      cash_ups: isLegacy
        ? []
        : rows(data.cash_ups, 'cash_ups').map(cashUp => ({
            ...cashUp,
            digital_takings: sourceFormat >= 4 ? cashUp.digital_takings ?? null : null,
            recorded_by: sourceFormat >= 5 ? cashUp.recorded_by ?? null : null,
          })),
      sales_entries: sourceFormat >= 2 ? rows(data.sales_entries, 'sales_entries') : [],
      settings: sourceFormat >= 3 ? rows(data.settings, 'settings') : [],
      staff_members: sourceFormat >= 5 ? rows(data.staff_members, 'staff_members') : [],
    },
  };
}

/** Replace every data set in a single transaction. */
export async function restoreBackup(db: SQLiteDatabase, value: unknown): Promise<void> {
  const backup = normaliseBackup(value);
  const data = backup.data;

  await db.withTransactionAsync(async () => {
    // Children before the tables they reference: count_sessions and cash_ups
    // point at staff_members, so staff go last.
    await db.execAsync(`
      DELETE FROM credit_entries;
      DELETE FROM cash_ups;
      DELETE FROM expenses;
      DELETE FROM sales_entries;
      DELETE FROM stock_movements;
      DELETE FROM count_sessions;
      DELETE FROM customers;
      DELETE FROM products;
      DELETE FROM settings;
      DELETE FROM staff_members;
    `);

    // Staff first: restored count_sessions and cash_ups reference them.
    for (const member of data.staff_members) {
      await db.runAsync(
        `INSERT INTO staff_members (id, name, pin, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          member.id, member.name, member.pin, member.is_active ?? 1,
          member.created_at ?? 0, member.updated_at ?? 0,
        ]
      );
    }

    for (const product of data.products) {
      await db.runAsync(
        `INSERT INTO products
           (id, name, barcode, unit_label, buy_price, sell_price, current_qty,
            low_stock_threshold, is_active, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          product.id, product.name, product.barcode ?? null, product.unit_label ?? 'units', product.buy_price ?? null,
          product.sell_price ?? null, product.current_qty ?? 0, product.low_stock_threshold ?? 5,
          product.is_active ?? 1, product.created_at ?? 0, product.updated_at ?? 0,
        ]
      );
    }
    for (const session of data.count_sessions) {
      await db.runAsync(
        `INSERT INTO count_sessions
           (id, started_at, completed_at, products_counted, total_products, recorded_by, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          session.id, session.started_at, session.completed_at ?? null,
          session.products_counted ?? 0, session.total_products ?? 0,
          session.recorded_by ?? null, session.notes ?? null,
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
           (id, customer_id, type, amount, notes, payment_method, due_at, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, entry.customer_id, entry.type, entry.amount, entry.notes ?? null,
          entry.payment_method ?? null, entry.due_at ?? null, entry.recorded_at,
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
    for (const entry of data.sales_entries) {
      await db.runAsync(
        `INSERT INTO sales_entries (id, period, period_key, amount, margin_pct, notes, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          entry.id, entry.period, entry.period_key, entry.amount, entry.margin_pct,
          entry.notes ?? null, entry.recorded_at,
        ]
      );
    }
    for (const cashUp of data.cash_ups) {
      await db.runAsync(
        `INSERT INTO cash_ups
           (id, counted_amount, expected_amount, difference, taken_out, is_opening,
            digital_takings, recorded_by, notes, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cashUp.id, cashUp.counted_amount, cashUp.expected_amount, cashUp.difference,
          cashUp.taken_out ?? 0, cashUp.is_opening ?? 0,
          cashUp.digital_takings ?? null, cashUp.recorded_by ?? null,
          cashUp.notes ?? null, cashUp.recorded_at,
        ]
      );
    }
    for (const setting of data.settings) {
      await db.runAsync(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)',
        [setting.key, setting.value, setting.updated_at ?? 0]
      );
    }
  });
}
