/**
 * ============================================
 * SHOPTRACK SCHEMA
 * ============================================
 *
 * Source of truth for the database shape. Lives apart from App.tsx so it can
 * be exercised in plain node against real SQLite (see schema.test.ts).
 *
 * Timestamps are INTEGER unix milliseconds everywhere. Do not reintroduce
 * CURRENT_TIMESTAMP: it writes TEXT, which sorts wrong against ISO strings and
 * lands as TEXT in an INTEGER column without complaint.
 */

/**
 * The slice of expo-sqlite's SQLiteDatabase that schema setup needs.
 * SQLiteDatabase satisfies this structurally, and so can a test double.
 */
export interface MigrationDb {
  execAsync(sql: string): Promise<void>;
  getAllAsync<T>(sql: string): Promise<T[]>;
  getFirstAsync<T>(sql: string): Promise<T | null>;
  withTransactionAsync(fn: () => Promise<void>): Promise<void>;
}

/**
 * Bump this whenever the table shape changes. Every bump after the first pilot
 * build must add a migration below; shop data is never reset to change shape.
 */
export const SCHEMA_VERSION = 5;

const CREATE_PRODUCTS = `
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    unit_label TEXT DEFAULT 'units',
    buy_price REAL,
    sell_price REAL,
    current_qty INTEGER NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER DEFAULT 5,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0
  );
`;

const CREATE_MOVEMENTS = `
  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('STOCK_IN', 'COUNT')),
    quantity INTEGER NOT NULL,
    buy_price_at_time REAL,
    sell_price_at_time REAL,
    total_cost REAL,
    notes TEXT,
    session_id INTEGER,
    recorded_at INTEGER NOT NULL,
    FOREIGN KEY (product_id) REFERENCES products(id)
  );
`;

const CREATE_SESSIONS = `
  CREATE TABLE IF NOT EXISTS count_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at INTEGER NOT NULL,
    completed_at INTEGER,
    products_counted INTEGER DEFAULT 0,
    total_products INTEGER DEFAULT 0,
    notes TEXT
  );
`;

/**
 * People who buy on credit -- the shop's book / izikweletu.
 *
 * Phone is optional: many regulars are known only by name, and demanding a
 * number would stop the owner recording the debt at all.
 */
const CREATE_CUSTOMERS = `
  CREATE TABLE IF NOT EXISTS customers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    phone       TEXT,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT 0,
    updated_at  INTEGER NOT NULL DEFAULT 0
  );
`;

/**
 * Every credit given and every payment received, append-only.
 *
 * Balances are never stored -- they are summed from these rows. A stored
 * balance and a ledger that disagree is a bug you cannot untangle later; a
 * ledger alone always reconciles.
 *
 * amount is always positive. `type` gives it direction:
 *   CREDIT  = customer took goods, owes more
 *   PAYMENT = customer paid, owes less
 *
 * due_at is when the customer SAID they would pay, on a CREDIT entry. Null
 * means they did not say, which is common and must stay allowed -- demanding a
 * date would stop the owner recording the debt at all. It is a promise, not a
 * schedule: nothing enforces it, it only lets the app say "this one is late".
 */
const CREATE_CREDIT_ENTRIES = `
  CREATE TABLE IF NOT EXISTS credit_entries (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_id  INTEGER NOT NULL,
    type         TEXT NOT NULL CHECK (type IN ('CREDIT', 'PAYMENT')),
    amount       REAL NOT NULL CHECK (amount > 0),
    notes        TEXT,
    due_at       INTEGER,
    recorded_at  INTEGER NOT NULL,
    FOREIGN KEY (customer_id) REFERENCES customers(id)
  );
`;

/**
 * Running costs: rent, electricity, transport, wages, airtime.
 *
 * ⚠️  STOCK PURCHASES DO NOT BELONG HERE.
 *
 * Buying stock is already the cost side of profit -- calculations.ts values
 * every unit sold at its buy_price. Recording a delivery as an expense too
 * would charge the owner for the same stock twice and turn a healthy shop
 * into a fake loss. Deliveries go through Stock In (stock_movements).
 *
 * The category CHECK is the guard: there is deliberately no 'STOCK' option.
 */
const CREATE_EXPENSES = `
  CREATE TABLE IF NOT EXISTS expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    category     TEXT NOT NULL CHECK (category IN
                   ('RENT', 'ELECTRICITY', 'TRANSPORT', 'WAGES', 'AIRTIME', 'OTHER')),
    amount       REAL NOT NULL CHECK (amount > 0),
    notes        TEXT,
    recorded_at  INTEGER NOT NULL
  );
`;

/**
 * End-of-day till counts. The shop's cash-up.
 *
 * expected_amount and difference are SNAPSHOTS, stored rather than recomputed.
 *
 * This looks like denormalisation and is deliberate. Everything feeding the
 * expected figure keeps moving: a backdated expense, a late stock-in, a
 * corrected count all change what "expected" would be if recalculated next
 * week. The owner counted their till against a number the app showed them at
 * that moment, and that is the number the record has to preserve. Recomputing
 * would silently rewrite history and turn a balanced cash-up into a shortfall
 * nobody can explain.
 *
 * Contrast credit_entries, where balances are summed and never stored: there
 * the ledger IS the truth. Here the reconciliation is an event that happened.
 */
const CREATE_CASH_UPS = `
  CREATE TABLE IF NOT EXISTS cash_ups (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    counted_amount   REAL NOT NULL CHECK (counted_amount >= 0),
    expected_amount  REAL NOT NULL,
    difference       REAL NOT NULL,
    taken_out        REAL NOT NULL DEFAULT 0 CHECK (taken_out >= 0),
    is_opening       INTEGER NOT NULL DEFAULT 0,
    notes            TEXT,
    recorded_at      INTEGER NOT NULL
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_products_active ON products(is_active);
  CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
  CREATE INDEX IF NOT EXISTS idx_movements_type ON stock_movements(type);
  CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_sessions_date ON count_sessions(started_at);
  CREATE INDEX IF NOT EXISTS idx_customers_active ON customers(is_active);
  CREATE INDEX IF NOT EXISTS idx_credit_customer ON credit_entries(customer_id);
  CREATE INDEX IF NOT EXISTS idx_credit_date ON credit_entries(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(recorded_at);
  CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category);
  CREATE INDEX IF NOT EXISTS idx_cash_ups_date ON cash_ups(recorded_at);
`;


/**
 * Upgrade a database created by an earlier committed ShopTrack schema.
 *
 * Versions 2→3 and 3→4 only added tables. Version 4→5 added the nullable
 * due_at column. They are intentionally small, additive migrations: all rows
 * remain in place and a partially completed v4→5 step can safely resume.
 */
async function migrateDatabase(db: MigrationDb, fromVersion: number): Promise<void> {
  let version = fromVersion;

  if (version < 2 || version > SCHEMA_VERSION) {
    throw new Error(
      `Database is at unsupported schema v${version}; app expects v${SCHEMA_VERSION}. ` +
      `ShopTrack refused to alter or erase it. Restore a compatible backup or upgrade through a supported build.`
    );
  }

  if (version === 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(CREATE_EXPENSES);
      await db.execAsync('PRAGMA user_version = 3;');
    });
    version = 3;
  }

  if (version === 3) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(CREATE_CASH_UPS);
      await db.execAsync('PRAGMA user_version = 4;');
    });
    version = 4;
  }

  if (version === 4) {
    await db.withTransactionAsync(async () => {
      const columns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(credit_entries)');
      if (!columns.some(column => column.name === 'due_at')) {
        await db.execAsync('ALTER TABLE credit_entries ADD COLUMN due_at INTEGER;');
      }
      await db.execAsync('PRAGMA user_version = 5;');
    });
    version = 5;
  }

  if (version !== SCHEMA_VERSION) {
    throw new Error(`No migration path from schema v${fromVersion} to v${SCHEMA_VERSION}.`);
  }
}

/**
 * Create a fresh database or migrate a supported existing one without data
 * loss. An unknown schema fails closed: showing an error is safer than silently
 * replacing a shop's books.
 */
export async function initDatabase(db: MigrationDb) {
  // SQLite disables foreign keys per connection by default. Turn them on
  // before any transaction so restores and normal writes cannot create orphans.
  await db.execAsync('PRAGMA foreign_keys = ON;');
  const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  const current = version?.user_version ?? 0;

  // A brand new database reports version 0 with no tables; that is not a
  // stale schema, so only reset when something is actually there.
  const existing = await db.getAllAsync<{ name: string }>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'products'`
  );
  const isFresh = existing.length === 0;

  if (!isFresh && current !== SCHEMA_VERSION) {
    await migrateDatabase(db, current);
  }

  await db.execAsync(CREATE_PRODUCTS);
  await db.execAsync(CREATE_MOVEMENTS);
  await db.execAsync(CREATE_SESSIONS);
  await db.execAsync(CREATE_CUSTOMERS);
  await db.execAsync(CREATE_CREDIT_ENTRIES);
  await db.execAsync(CREATE_EXPENSES);
  await db.execAsync(CREATE_CASH_UPS);
  await db.execAsync(CREATE_INDEXES);
  await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
}
