/**
 * ============================================
 * SHOPTRACK SCHEMA TESTS
 * ============================================
 *
 * Runs the real schema setup against real SQLite, in plain node.
 *
 * Run with: npm run test:migration
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { initDatabase, SCHEMA_VERSION, type MigrationDb } from './schema';

const REPO_ROOT = join(__dirname, '..', '..');

let failures = 0;

function check(condition: boolean, label: string) {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`);
  }
}

/**
 * Adapt node:sqlite to the async interface expo-sqlite exposes.
 */
function adapt(db: DatabaseSync): MigrationDb {
  return {
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async getAllAsync<T>(sql: string): Promise<T[]> {
      return db.prepare(sql).all() as T[];
    },
    async getFirstAsync<T>(sql: string): Promise<T | null> {
      return (db.prepare(sql).get() as T) ?? null;
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

type ColumnInfo = { name: string; type: string; notnull: number; dflt_value: unknown };

function describe(d: DatabaseSync, table: string) {
  return (d.prepare(`PRAGMA table_info(${table})`).all() as ColumnInfo[])
    .map(c => `${c.name}:${c.type}:notnull=${c.notnull}:default=${c.dflt_value ?? 'none'}`)
    .sort()
    .join('\n');
}

/**
 * Reconstruct an older schema from database/schema.sql by stripping what did
 * not exist yet.
 *
 * Migrations are the one thing here that can destroy a shop's books, and they
 * only ever run against a database built by an EARLIER build. Testing them
 * against the current schema tests nothing: the tables the migration is meant
 * to add are already there.
 */
function historicalSchema(
  omit: { withoutDueAt?: boolean; withoutSalesEntries?: boolean }
): string {
  let sql = readFileSync(join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

  // Everything after v6 is stripped unconditionally: every historical era
  // these tests reconstruct predates the settings table (v7), the mobile-money
  // columns (v8), and staff mode (v9).
  sql = sql
    .replace(/CREATE TABLE settings[\s\S]*?\);\r?\n/m, '')
    .replace(/CREATE TABLE staff_members[\s\S]*?\);\r?\n/m, '')
    .replace(/^CREATE INDEX idx_staff_active[^\n]*\r?\n/m, '')
    .replace(/^CREATE UNIQUE INDEX idx_products_barcode[^\n]*\r?\n/m, '')
    .replace(/^\s*barcode\s+TEXT,[^\n]*\r?\n/m, '')
    .replace(/^\s*payment_method\s+TEXT,[^\n]*\r?\n/m, '')
    .replace(/^\s*digital_takings\s+REAL,[^\n]*\r?\n/m, '')
    .replace(/^\s*recorded_by\s+INTEGER REFERENCES staff_members\(id\),[^\n]*\r?\n/gm, '');

  if (omit.withoutDueAt) {
    sql = sql.replace(/^\s*due_at\s+INTEGER,\r?\n/m, '');
  }
  if (omit.withoutSalesEntries) {
    sql = sql
      .replace(/CREATE TABLE sales_entries[\s\S]*?\);\r?\n/m, '')
      .replace(/^CREATE INDEX idx_sales_period[^\n]*\r?\n/m, '');
  }
  return sql;
}

const TABLES = [
  'products',
  'stock_movements',
  'count_sessions',
  'customers',
  'credit_entries',
  'expenses',
  'cash_ups',
  'sales_entries',
  'settings',
  'staff_members',
];

async function run() {
  console.log('========================================');
  console.log('TEST: fresh install builds the schema');
  console.log('========================================');

  const freshRaw = new DatabaseSync(':memory:');
  await initDatabase(adapt(freshRaw));

  const cols = (freshRaw.prepare('PRAGMA table_info(stock_movements)').all() as ColumnInfo[])
    .map(c => c.name);
  check(cols.includes('type'), 'stock_movements.type exists');
  check(cols.includes('buy_price_at_time'), 'buy_price_at_time exists');
  check(cols.includes('sell_price_at_time'), 'sell_price_at_time exists');
  check(!cols.includes('movement_type'), 'no legacy movement_type column');
  const productCols = (freshRaw.prepare('PRAGMA table_info(products)').all() as ColumnInfo[])
    .map(c => c.name);
  check(productCols.includes('barcode'), 'products.barcode exists');

  freshRaw.exec(`INSERT INTO products (name, barcode) VALUES ('One', '600100000001')`);
  let duplicateBarcodeRejected = false;
  try { freshRaw.exec(`INSERT INTO products (name, barcode) VALUES ('Two', '600100000001')`); }
  catch { duplicateBarcodeRejected = true; }
  check(duplicateBarcodeRejected, 'one barcode cannot identify two products');
  freshRaw.exec('DELETE FROM products');
  const indexes = (freshRaw.prepare(
    `SELECT name FROM sqlite_master WHERE type = 'index'`
  ).all() as Array<{ name: string }>).map(row => row.name);
  check(indexes.includes('idx_movements_product_type_date'), 'movement history has a composite product/type/date index');
  check(indexes.includes('idx_credit_customer_date'), 'credit history has a composite customer/date index');

  const version = freshRaw.prepare('PRAGMA user_version').get() as { user_version: number };
  equal(version.user_version, SCHEMA_VERSION, `user_version stamped to ${SCHEMA_VERSION}`);

  // The CHECK constraint should reject anything that is not a known type.
  let rejected = false;
  try {
    freshRaw.exec(
      `INSERT INTO stock_movements (product_id, type, quantity, recorded_at) VALUES (1, 'NONSENSE', 1, 0)`
    );
  } catch {
    rejected = true;
  }
  check(rejected, 'CHECK constraint rejects an unknown movement type');

  // The credit ledger only records positive amounts; direction comes from
  // `type`. A negative amount would silently invert a debt.
  freshRaw.exec(`INSERT INTO customers (id, name, created_at, updated_at) VALUES (1, 'Thandi', 0, 0)`);

  let negativeRejected = false;
  try {
    freshRaw.exec(
      `INSERT INTO credit_entries (customer_id, type, amount, recorded_at) VALUES (1, 'CREDIT', -50, 0)`
    );
  } catch {
    negativeRejected = true;
  }
  check(negativeRejected, 'CHECK constraint rejects a negative credit amount');

  let badTypeRejected = false;
  try {
    freshRaw.exec(
      `INSERT INTO credit_entries (customer_id, type, amount, recorded_at) VALUES (1, 'REFUND', 50, 0)`
    );
  } catch {
    badTypeRejected = true;
  }
  check(badTypeRejected, 'CHECK constraint rejects an unknown credit entry type');

  freshRaw.exec('DELETE FROM customers');

  // Buying stock is already the cost side of gross profit. If a 'STOCK'
  // expense category ever became insertable, every delivery would be charged
  // twice and a healthy shop would report a loss. The CHECK is the guard.
  let stockCategoryRejected = false;
  try {
    freshRaw.exec(
      `INSERT INTO expenses (category, amount, recorded_at) VALUES ('STOCK', 500, 0)`
    );
  } catch {
    stockCategoryRejected = true;
  }
  check(stockCategoryRejected, 'CHECK constraint rejects a STOCK expense category');

  let negativeExpenseRejected = false;
  try {
    freshRaw.exec(
      `INSERT INTO expenses (category, amount, recorded_at) VALUES ('RENT', -100, 0)`
    );
  } catch {
    negativeExpenseRejected = true;
  }
  check(negativeExpenseRejected, 'CHECK constraint rejects a negative expense');

  freshRaw.exec(`INSERT INTO expenses (category, amount, recorded_at) VALUES ('RENT', 1500, 0)`);
  const goodExpense = freshRaw.prepare('SELECT COUNT(*) as c FROM expenses').get() as { c: number };
  equal(goodExpense.c, 1, 'a valid expense is accepted');
  freshRaw.exec('DELETE FROM expenses');

  console.log('');
  console.log('========================================');
  console.log('TEST: re-opening an up-to-date database keeps data');
  console.log('========================================');

  // The common case: app restarts, schema is current, nothing should be lost.
  freshRaw.exec(`INSERT INTO products (name, current_qty, created_at, updated_at) VALUES ('Bread', 10, 1, 1)`);
  await initDatabase(adapt(freshRaw));

  const kept = freshRaw.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  equal(kept.c, 1, 'products survive a normal reopen');

  console.log('');
  console.log('========================================');
  console.log('TEST: a v4 database is migrated without losing data');
  console.log('========================================');

  // Build the exact previous schema: every table as it stood at v4, without the
  // v5 due_at column and without the v6 sales_entries table. Stronger than only
  // changing PRAGMA user_version -- and it has to strip forward-dated tables
  // too, or a broken migration step would pass because schema.sql had already
  // created what the step was supposed to add.
  const staleRaw = new DatabaseSync(':memory:');
  const v4Sql = historicalSchema({ withoutDueAt: true, withoutSalesEntries: true });
  staleRaw.exec(v4Sql);
  staleRaw.exec('PRAGMA user_version = 4;');
  staleRaw.exec(`
    INSERT INTO products (id, name, current_qty, created_at, updated_at) VALUES (99, 'Old', 5, 1, 1);
    INSERT INTO customers (id, name, created_at, updated_at) VALUES (1, 'Thandi', 1, 1);
    INSERT INTO credit_entries (id, customer_id, type, amount, recorded_at) VALUES (1, 1, 'CREDIT', 25, 2);
    INSERT INTO expenses (id, category, amount, recorded_at) VALUES (1, 'RENT', 100, 2);
    INSERT INTO cash_ups (id, counted_amount, expected_amount, difference, recorded_at) VALUES (1, 50, 50, 0, 2);
  `);

  await initDatabase(adapt(staleRaw));

  const keptProduct = staleRaw.prepare("SELECT COUNT(*) as c FROM products WHERE id = 99 AND name = 'Old'").get() as { c: number };
  const keptCredit = staleRaw.prepare('SELECT COUNT(*) as c FROM credit_entries').get() as { c: number };
  const keptExpense = staleRaw.prepare('SELECT COUNT(*) as c FROM expenses').get() as { c: number };
  const keptCashUp = staleRaw.prepare('SELECT COUNT(*) as c FROM cash_ups').get() as { c: number };
  equal(keptProduct.c, 1, 'products survive the migration');
  equal(keptCredit.c, 1, 'credit entries survive the migration');
  equal(keptExpense.c, 1, 'expenses survive the migration');
  equal(keptCashUp.c, 1, 'cash-ups survive the migration');

  const resetVersion = staleRaw.prepare('PRAGMA user_version').get() as { user_version: number };
  equal(resetVersion.user_version, SCHEMA_VERSION, 'migrated database is stamped current');

  for (const table of TABLES) {
    check(describe(staleRaw, table) === describe(freshRaw, table), `${table} has the current shape`);
  }

  await initDatabase(adapt(staleRaw));
  equal(
    (staleRaw.prepare('SELECT COUNT(*) as c FROM products WHERE id = 99').get() as { c: number }).c,
    1,
    'running setup again is idempotent'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: a v5 database gains the sales book without losing data');
  console.log('========================================');

  // The upgrade that actually runs on a phone already carrying the pilot build.
  // v5 had everything except sales_entries.
  //
  // Note what this does and does not prove. For an ADDITIVE table, the
  // `CREATE TABLE IF NOT EXISTS` block at the end of initDatabase is what
  // actually creates it -- the matching step in migrateDatabase is belt-and-
  // braces, and deleting that step alone changes nothing. Verified by deleting
  // it and watching these checks still pass.
  //
  // So these assert the OUTCOME an owner cares about (a v5 database ends up at
  // v6, with a working sales book and every row intact) rather than which line
  // did the work. The v4->v5 ALTER is the only step that must be a step, because
  // adding a column cannot be expressed as CREATE IF NOT EXISTS -- and that one
  // does fail if removed.
  const v5Raw = new DatabaseSync(':memory:');
  v5Raw.exec(historicalSchema({ withoutSalesEntries: true }));
  v5Raw.exec('PRAGMA user_version = 5;');
  v5Raw.exec(`
    INSERT INTO products (id, name, current_qty, created_at, updated_at) VALUES (7, 'Bread', 5, 1, 1);
    INSERT INTO customers (id, name, created_at, updated_at) VALUES (1, 'Thandi', 1, 1);
    INSERT INTO credit_entries (id, customer_id, type, amount, due_at, recorded_at) VALUES (1, 1, 'CREDIT', 90, 500, 2);
  `);

  const hadSales = (v5Raw.prepare(
    `SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='sales_entries'`
  ).get() as { c: number }).c;
  equal(hadSales, 0, 'a v5 database genuinely has no sales book yet');

  await initDatabase(adapt(v5Raw));

  const gainedSales = (v5Raw.prepare(
    `SELECT COUNT(*) as c FROM sqlite_master WHERE type='table' AND name='sales_entries'`
  ).get() as { c: number }).c;
  equal(gainedSales, 1, 'a v5 database ends up with the sales book');

  equal(
    (v5Raw.prepare("SELECT COUNT(*) as c FROM products WHERE id = 7").get() as { c: number }).c,
    1,
    'products survive v5 -> v6'
  );
  equal(
    (v5Raw.prepare('SELECT due_at FROM credit_entries WHERE id = 1').get() as { due_at: number }).due_at,
    500,
    'a promised due date survives v5 -> v6'
  );
  equal(
    (v5Raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    SCHEMA_VERSION,
    'the migrated database is stamped current'
  );
  check(
    describe(v5Raw, 'sales_entries') === describe(freshRaw, 'sales_entries'),
    'the migrated sales book matches a fresh one exactly'
  );

  // The upsert the sales book relies on needs its UNIQUE constraint to have
  // survived the migration, not just the columns.
  v5Raw.exec(`INSERT INTO sales_entries (period, period_key, amount, margin_pct, recorded_at) VALUES ('MONTH', '2026-01', 48000, 25, 1)`);
  let duplicateRejected = false;
  try {
    v5Raw.exec(`INSERT INTO sales_entries (period, period_key, amount, margin_pct, recorded_at) VALUES ('MONTH', '2026-01', 999, 25, 1)`);
  } catch {
    duplicateRejected = true;
  }
  check(duplicateRejected, 'the migrated sales book still rejects a duplicate month');

  console.log('');
  console.log('========================================');
  console.log('TEST: a v6 pilot-era database gains settings, money columns and staff');
  console.log('========================================');

  // The upgrade that runs on a phone carrying the sales-book build: v6 had
  // every table except settings and staff_members, and none of the v8/v9
  // columns.
  const v6Raw = new DatabaseSync(':memory:');
  v6Raw.exec(historicalSchema({}));
  v6Raw.exec('PRAGMA user_version = 6;');
  v6Raw.exec(`
    INSERT INTO products (id, name, current_qty, created_at, updated_at) VALUES (99, 'Bread', 5, 1, 1);
    INSERT INTO customers (id, name, created_at, updated_at) VALUES (1, 'Thandi', 1, 1);
    INSERT INTO credit_entries (id, customer_id, type, amount, recorded_at) VALUES (1, 1, 'PAYMENT', 40, 2);
    INSERT INTO cash_ups (id, counted_amount, expected_amount, difference, recorded_at) VALUES (1, 50, 50, 0, 2);
    INSERT INTO count_sessions (id, started_at, completed_at) VALUES (1, 1, 2);
    INSERT INTO sales_entries (period, period_key, amount, margin_pct, recorded_at) VALUES ('MONTH', '2026-01', 48000, 25, 1);
  `);

  await initDatabase(adapt(v6Raw));

  equal(
    (v6Raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    SCHEMA_VERSION,
    'a v6 database reaches the current version'
  );
  for (const table of TABLES) {
    check(describe(v6Raw, table) === describe(freshRaw, table), `v6 -> current: ${table} has the current shape`);
  }
  equal(
    (v6Raw.prepare('SELECT amount as value FROM credit_entries WHERE id = 1').get() as { value: number }).value,
    40,
    'v6 credit data survives'
  );
  equal(
    (v6Raw.prepare('SELECT payment_method as value FROM credit_entries WHERE id = 1').get() as { value: unknown }).value,
    null,
    'pre-v8 payments read as unrecorded method, not a guess'
  );
  equal(
    (v6Raw.prepare('SELECT digital_takings as value FROM cash_ups WHERE id = 1').get() as { value: unknown }).value,
    null,
    'pre-v8 cash-ups read as unrecorded digital takings'
  );
  equal(
    (v6Raw.prepare('SELECT recorded_by as value FROM count_sessions WHERE id = 1').get() as { value: unknown }).value,
    null,
    'pre-v9 counts belong to nobody in particular'
  );
  equal(
    (v6Raw.prepare("SELECT COUNT(*) as c FROM sales_entries WHERE period_key = '2026-01'").get() as { c: number }).c,
    1,
    'v6 sales book survives'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: a v2 database follows every migration step');
  console.log('========================================');

  const v2Raw = new DatabaseSync(':memory:');
  v2Raw.exec(v4Sql);
  v2Raw.exec(`
    DROP TABLE cash_ups;
    DROP TABLE expenses;
    PRAGMA user_version = 2;
    INSERT INTO products (id, name, current_qty, created_at, updated_at)
      VALUES (99, 'Migration marker', 7, 1, 1);
    INSERT INTO customers (id, name, created_at, updated_at)
      VALUES (99, 'Legacy customer', 1, 1);
    INSERT INTO credit_entries (id, customer_id, type, amount, recorded_at)
      VALUES (99, 99, 'CREDIT', 30, 2);
  `);
  await initDatabase(adapt(v2Raw));
  equal(
    (v2Raw.prepare('PRAGMA user_version').get() as { user_version: number }).user_version,
    SCHEMA_VERSION,
    'v2 reaches the current version'
  );
  equal(
    (v2Raw.prepare('SELECT current_qty as value FROM products WHERE id = 99').get() as { value: number }).value,
    7,
    'v2 product data survives every step'
  );
  equal(
    (v2Raw.prepare('SELECT amount as value FROM credit_entries WHERE id = 99').get() as { value: number }).value,
    30,
    'v2 credit data survives every step'
  );
  check(describe(v2Raw, 'expenses') === describe(freshRaw, 'expenses'), 'v2→3 creates expenses');
  check(describe(v2Raw, 'cash_ups') === describe(freshRaw, 'cash_ups'), 'v3→4 creates cash-ups');
  check(describe(v2Raw, 'credit_entries') === describe(freshRaw, 'credit_entries'), 'v4→5 adds due_at');

  console.log('');
  console.log('========================================');
  console.log('TEST: an unknown legacy schema fails closed');
  console.log('========================================');

  const unknownRaw = new DatabaseSync(':memory:');
  unknownRaw.exec(`
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    INSERT INTO products VALUES (1, 'Do not erase');
    PRAGMA user_version = 1;
  `);
  let unknownRejected = false;
  try {
    await initDatabase(adapt(unknownRaw));
  } catch {
    unknownRejected = true;
  }
  check(unknownRejected, 'unsupported schema is rejected');
  equal(
    (unknownRaw.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number }).c,
    1,
    'unsupported schema data is not erased'
  );

  console.log('');
  console.log('========================================');
  console.log('TEST: database/schema.sql has not drifted');
  console.log('========================================');

  // database/schema.sql is documentation, and documentation that quietly
  // disagrees with the code is worse than none. Compare them for real.
  const refRaw = new DatabaseSync(':memory:');
  refRaw.exec(readFileSync(join(REPO_ROOT, 'database', 'schema.sql'), 'utf8'));

  for (const table of TABLES) {
    const reference = describe(refRaw, table);
    const shipping = describe(freshRaw, table);
    if (reference !== shipping) {
      failures++;
      console.error(
        `  FAIL ${table} drifted from database/schema.sql\n` +
        `--- database/schema.sql\n${reference}\n--- src/core/schema.ts\n${shipping}`
      );
    } else {
      console.log(`  ok   ${table} matches database/schema.sql`);
    }
  }

  console.log('');
  if (failures > 0) {
    console.error(`FAILED: ${failures} check(s) did not hold`);
    process.exit(1);
  }
  console.log('PASSED: all schema checks held');
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
