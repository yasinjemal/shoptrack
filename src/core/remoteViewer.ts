import {
  calculatePeriodSummary,
  type Product,
  type StockMovement,
} from './calculations';
import {
  calculateCreditSummary,
  type CreditEntry,
  type Customer,
} from './credit';
import {
  calculateExpenseSummary,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
} from './expenses';
import {
  calculateSalesHistory,
  type MonthlySales,
  type SalesEntry,
} from './sales';
import { CURRENCIES, DEFAULT_CURRENCY, type CurrencyCode } from './currency';
import { normaliseBackup } from './db';

const MAX_VIEWER_TEXT = 240;

export interface RemoteViewerProduct {
  id: number;
  name: string;
  unitLabel: string;
  currentQuantity: number;
  buyPrice: number | null;
  sellPrice: number | null;
}

export interface RemoteViewerCustomer {
  id: number;
  name: string;
  phone: string | null;
  balance: number;
  lastActivityAt: number | null;
}

export interface RemoteViewerExpense {
  id: number;
  category: ExpenseCategory;
  amount: number;
  notes: string | null;
  recordedAt: number;
}

export interface RemoteViewerLatestCount {
  completedAt: number;
  /** Null means this was the first baseline count, so no profit exists yet. */
  profit: number | null;
  revenue: number | null;
  unitsSold: number | null;
}

export interface RemoteViewerCashUp {
  countedAmount: number;
  expectedAmount: number;
  difference: number;
  isOpening: boolean;
  recordedAt: number;
}

/**
 * A deliberately small, read-only projection of a decrypted backup.
 *
 * It never contains settings rows (which include owner/staff PINs), recovery
 * material, or embedded photo bytes. A viewer screen accepts only this model,
 * never a database handle or restore callback, making an accidental write from
 * the remote view structurally impossible.
 */
export interface RemoteShopSnapshot {
  backupCreatedAt: number | null;
  shopName: string | null;
  currencyCode: CurrencyCode;
  products: RemoteViewerProduct[];
  stockSellingValue: number;
  customers: RemoteViewerCustomer[];
  totalOutstanding: number;
  expenses: RemoteViewerExpense[];
  totalExpenses: number;
  salesMonths: MonthlySales[];
  totalSales: number;
  salesBookProfit: number;
  latestCount: RemoteViewerLatestCount | null;
  latestCashUp: RemoteViewerCashUp | null;
}

type Row = Record<string, unknown>;

interface ViewerMovement extends StockMovement {
  sessionId: number | null;
}

interface ViewerCountSession {
  id: number;
  completedAt: number;
}

function asRow(value: unknown, label: string): Row {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }
  return value as Row;
}

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a number.`);
  }
  return value;
}

function integer(value: unknown, label: string): number {
  const number = finite(value, label);
  if (!Number.isInteger(number)) throw new Error(`${label} must be a whole number.`);
  return number;
}

function optionalFinite(value: unknown, label: string): number | null {
  return value == null ? null : finite(value, label);
}

function optionalInteger(value: unknown, label: string): number | null {
  return value == null ? null : integer(value, label);
}

function text(value: unknown, label: string, fallback?: string): string {
  if (value == null && fallback != null) return fallback;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  const clean = value.trim();
  if (!clean && fallback != null) return fallback;
  if (!clean) throw new Error(`${label} cannot be empty.`);
  return clean.slice(0, MAX_VIEWER_TEXT);
}

function optionalText(value: unknown, label: string): string | null {
  if (value == null) return null;
  if (typeof value !== 'string') throw new Error(`${label} must be text.`);
  return value.trim().slice(0, MAX_VIEWER_TEXT) || null;
}

function active(value: unknown, label: string): boolean {
  if (value === 1 || value === true || value == null) return true;
  if (value === 0 || value === false) return false;
  throw new Error(`${label} is invalid.`);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function readCurrency(settings: unknown[]): CurrencyCode {
  const setting = settings
    .map((value, index) => asRow(value, `Setting ${index + 1}`))
    .find(row => row.key === 'currency_code');
  const code = setting?.value;
  return typeof code === 'string' && code in CURRENCIES
    ? code as CurrencyCode
    : DEFAULT_CURRENCY.code as CurrencyCode;
}

function readShopName(settings: unknown[]): string | null {
  const setting = settings
    .map((value, index) => asRow(value, `Setting ${index + 1}`))
    .find(row => row.key === 'shop_name');
  return optionalText(setting?.value, 'Shop name');
}

function readProducts(values: unknown[]): { viewer: RemoteViewerProduct[]; core: Product[] } {
  const viewer: RemoteViewerProduct[] = [];
  const core: Product[] = [];

  values.forEach((value, index) => {
    const row = asRow(value, `Product ${index + 1}`);
    if (!active(row.is_active, `Product ${index + 1} activity`)) return;
    const id = integer(row.id, `Product ${index + 1} id`);
    const name = text(row.name, `Product ${index + 1} name`);
    const unitLabel = text(row.unit_label, `Product ${index + 1} unit`, 'each');
    const currentQuantity = finite(row.current_qty, `Product ${index + 1} quantity`);
    const buyPrice = optionalFinite(row.buy_price, `Product ${index + 1} buy price`);
    const sellPrice = optionalFinite(row.sell_price, `Product ${index + 1} sell price`);

    viewer.push({ id, name, unitLabel, currentQuantity, buyPrice, sellPrice });
    core.push({
      id,
      name,
      unit_label: unitLabel,
      current_qty: currentQuantity,
      buy_price: buyPrice ?? 0,
      sell_price: sellPrice ?? 0,
      is_active: true,
    });
  });

  viewer.sort((a, b) => a.name.localeCompare(b.name));
  return { viewer, core };
}

function readMovements(values: unknown[]): ViewerMovement[] {
  return values.map((value, index) => {
    const row = asRow(value, `Stock movement ${index + 1}`);
    if (row.type !== 'STOCK_IN' && row.type !== 'COUNT') {
      throw new Error(`Stock movement ${index + 1} type is invalid.`);
    }
    return {
      id: integer(row.id, `Stock movement ${index + 1} id`),
      product_id: integer(row.product_id, `Stock movement ${index + 1} product`),
      type: row.type,
      quantity: finite(row.quantity, `Stock movement ${index + 1} quantity`),
      buy_price_at_time: optionalFinite(
        row.buy_price_at_time,
        `Stock movement ${index + 1} buy price`
      ) ?? undefined,
      sell_price_at_time: optionalFinite(
        row.sell_price_at_time,
        `Stock movement ${index + 1} sell price`
      ) ?? undefined,
      recorded_at: finite(row.recorded_at, `Stock movement ${index + 1} date`),
      sessionId: optionalInteger(row.session_id, `Stock movement ${index + 1} session`),
    };
  });
}

function readCountSessions(values: unknown[]): ViewerCountSession[] {
  const sessions: ViewerCountSession[] = [];
  values.forEach((value, index) => {
    const row = asRow(value, `Count session ${index + 1}`);
    if (row.completed_at == null) return;
    sessions.push({
      id: integer(row.id, `Count session ${index + 1} id`),
      completedAt: finite(row.completed_at, `Count session ${index + 1} date`),
    });
  });
  return sessions.sort((a, b) => b.completedAt - a.completedAt || b.id - a.id);
}

function latestCountSummary(
  products: Product[],
  movements: ViewerMovement[],
  sessions: ViewerCountSession[]
): RemoteViewerLatestCount | null {
  const latest = sessions[0];
  if (!latest) return null;

  const productIds = new Set(
    movements
      .filter(movement => movement.type === 'COUNT' && movement.sessionId === latest.id)
      .map(movement => movement.product_id)
  );
  const hasPriorBaseline = movements.some(
    movement => movement.type === 'COUNT'
      && movement.recorded_at < latest.completedAt
      && productIds.has(movement.product_id)
  );
  if (!hasPriorBaseline || productIds.size === 0) {
    return { completedAt: latest.completedAt, profit: null, revenue: null, unitsSold: null };
  }

  const previousCountAt = movements
    .filter(movement => movement.type === 'COUNT'
      && movement.recorded_at < latest.completedAt
      && productIds.has(movement.product_id))
    .reduce((mostRecent, movement) => Math.max(mostRecent, movement.recorded_at), 0);
  const countedProducts = products.filter(product => productIds.has(product.id));
  const summary = calculatePeriodSummary(
    countedProducts,
    movements,
    previousCountAt + 1,
    latest.completedAt
  );
  return {
    completedAt: latest.completedAt,
    profit: round2(summary.total_estimated_profit),
    revenue: round2(summary.total_estimated_revenue),
    unitsSold: summary.total_units_sold,
  };
}

function readCredit(values: unknown[], customerIds: ReadonlySet<number>): CreditEntry[] {
  const entries: CreditEntry[] = [];
  values.forEach((value, index) => {
    const row = asRow(value, `Credit entry ${index + 1}`);
    if (row.type !== 'CREDIT' && row.type !== 'PAYMENT') {
      throw new Error(`Credit entry ${index + 1} type is invalid.`);
    }
    const customerId = integer(row.customer_id, `Credit entry ${index + 1} customer`);
    // Inactive paid-up customers stay out of the viewer, matching the live
    // credit screen; their historical rows do not affect active balances.
    if (!customerIds.has(customerId)) return;
    const paymentMethod = row.payment_method;
    if (paymentMethod != null
      && paymentMethod !== 'CASH'
      && paymentMethod !== 'MOBILE_MONEY'
      && paymentMethod !== 'BANK'
      && paymentMethod !== 'OTHER') {
      throw new Error(`Credit entry ${index + 1} payment method is invalid.`);
    }
    entries.push({
      id: integer(row.id, `Credit entry ${index + 1} id`),
      customer_id: customerId,
      type: row.type,
      amount: finite(row.amount, `Credit entry ${index + 1} amount`),
      notes: optionalText(row.notes, `Credit entry ${index + 1} notes`) ?? undefined,
      payment_method: paymentMethod ?? undefined,
      due_at: optionalFinite(row.due_at, `Credit entry ${index + 1} due date`) ?? undefined,
      recorded_at: finite(row.recorded_at, `Credit entry ${index + 1} date`),
    });
  });
  return entries;
}

interface ViewerCustomerBase {
  id: number;
  name: string;
  phone: string | null;
}

function readCustomers(values: unknown[]): { viewerBase: ViewerCustomerBase[]; ids: Set<number> } {
  const viewerBase: ViewerCustomerBase[] = [];
  values.forEach((value, index) => {
    const row = asRow(value, `Customer ${index + 1}`);
    if (!active(row.is_active, `Customer ${index + 1} activity`)) return;
    viewerBase.push({
      id: integer(row.id, `Customer ${index + 1} id`),
      name: text(row.name, `Customer ${index + 1} name`),
      phone: optionalText(row.phone, `Customer ${index + 1} phone`),
    });
  });
  return { viewerBase, ids: new Set(viewerBase.map(customer => customer.id)) };
}

function readExpenses(values: unknown[]): { core: Expense[]; viewer: RemoteViewerExpense[] } {
  const allowed = new Set<string>(EXPENSE_CATEGORIES);
  const core = values.map((value, index) => {
    const row = asRow(value, `Expense ${index + 1}`);
    if (typeof row.category !== 'string' || !allowed.has(row.category)) {
      throw new Error(`Expense ${index + 1} category is invalid.`);
    }
    return {
      id: integer(row.id, `Expense ${index + 1} id`),
      category: row.category as ExpenseCategory,
      amount: finite(row.amount, `Expense ${index + 1} amount`),
      notes: optionalText(row.notes, `Expense ${index + 1} notes`) ?? undefined,
      recorded_at: finite(row.recorded_at, `Expense ${index + 1} date`),
    } satisfies Expense;
  });
  const viewer = core
    .map(expense => ({
      id: expense.id,
      category: expense.category,
      amount: expense.amount,
      notes: expense.notes ?? null,
      recordedAt: expense.recorded_at,
    }))
    .sort((a, b) => b.recordedAt - a.recordedAt || b.id - a.id);
  return { core, viewer };
}

function readSales(values: unknown[]): SalesEntry[] {
  return values.map((value, index) => {
    const row = asRow(value, `Sales entry ${index + 1}`);
    if (row.period !== 'DAY' && row.period !== 'MONTH') {
      throw new Error(`Sales entry ${index + 1} period is invalid.`);
    }
    return {
      id: integer(row.id, `Sales entry ${index + 1} id`),
      period: row.period,
      period_key: text(row.period_key, `Sales entry ${index + 1} period key`),
      amount: finite(row.amount, `Sales entry ${index + 1} amount`),
      margin_pct: finite(row.margin_pct, `Sales entry ${index + 1} margin`),
      notes: optionalText(row.notes, `Sales entry ${index + 1} notes`) ?? undefined,
      recorded_at: finite(row.recorded_at, `Sales entry ${index + 1} date`),
    };
  });
}

function readLatestCashUp(values: unknown[]): RemoteViewerCashUp | null {
  if (values.length === 0) return null;
  const rows = values.map((value, index) => {
    const row = asRow(value, `Cash-up ${index + 1}`);
    const isOpening = row.is_opening === 1 || row.is_opening === true
      ? true
      : row.is_opening === 0 || row.is_opening === false
        ? false
        : (() => { throw new Error(`Cash-up ${index + 1} opening flag is invalid.`); })();
    return {
      id: integer(row.id, `Cash-up ${index + 1} id`),
      countedAmount: finite(row.counted_amount, `Cash-up ${index + 1} counted amount`),
      expectedAmount: finite(row.expected_amount, `Cash-up ${index + 1} expected amount`),
      difference: finite(row.difference, `Cash-up ${index + 1} difference`),
      isOpening,
      recordedAt: finite(row.recorded_at, `Cash-up ${index + 1} date`),
    };
  });
  rows.sort((a, b) => b.recordedAt - a.recordedAt || b.id - a.id);
  const { id: _id, ...latest } = rows[0];
  return latest;
}

/** Build a read-only owner view without touching the live SQLite database. */
export function buildRemoteShopSnapshot(value: unknown, now: number = Date.now()): RemoteShopSnapshot {
  const backup = normaliseBackup(value);
  const { viewer: products, core: coreProducts } = readProducts(backup.data.products);
  const movements = readMovements(backup.data.stock_movements);
  const countSessions = readCountSessions(backup.data.count_sessions);
  const { viewerBase: customerRows, ids: customerIds } = readCustomers(backup.data.customers);
  const creditEntries = readCredit(backup.data.credit_entries, customerIds);
  const credit = calculateCreditSummary(
    customerRows.map(({ id, name }) => ({ id, name } satisfies Customer)),
    creditEntries,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER,
    now
  );
  const customers = credit.everyone.map(balance => ({
    id: balance.customer_id,
    name: balance.customer_name,
    phone: customerRows.find(customer => customer.id === balance.customer_id)?.phone ?? null,
    balance: balance.balance,
    lastActivityAt: balance.last_activity_at,
  }));
  const { core: expenseRows, viewer: expenses } = readExpenses(backup.data.expenses);
  const expenseSummary = calculateExpenseSummary(
    expenseRows,
    Number.MIN_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER
  );
  const sales = calculateSalesHistory(readSales(backup.data.sales_entries));
  const parsedCreatedAt = Date.parse(backup.created_at);

  return {
    backupCreatedAt: Number.isFinite(parsedCreatedAt) && parsedCreatedAt > 0 ? parsedCreatedAt : null,
    shopName: readShopName(backup.data.settings),
    currencyCode: readCurrency(backup.data.settings),
    products,
    stockSellingValue: round2(products.reduce(
      (sum, product) => sum + product.currentQuantity * (product.sellPrice ?? 0),
      0
    )),
    customers,
    totalOutstanding: credit.total_outstanding,
    expenses,
    totalExpenses: expenseSummary.total,
    salesMonths: sales.months,
    totalSales: sales.total_sales,
    salesBookProfit: sales.total_profit,
    latestCount: latestCountSummary(coreProducts, movements, countSessions),
    latestCashUp: readLatestCashUp(backup.data.cash_ups),
  };
}
