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

const TABLES = [
  'products',
  'stock_movements',
  'count_sessions',
  'customers',
  'credit_entries',
  'expenses',
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
  console.log('TEST: a stale database is rebuilt');
  console.log('========================================');

  // Simulate a device still holding an older schema version.
  const staleRaw = new DatabaseSync(':memory:');
  await initDatabase(adapt(staleRaw));
  staleRaw.exec(`INSERT INTO products (name, current_qty, created_at, updated_at) VALUES ('Old', 5, 1, 1)`);
  staleRaw.exec(`PRAGMA user_version = ${SCHEMA_VERSION - 1}`);

  await initDatabase(adapt(staleRaw));

  const afterReset = staleRaw.prepare('SELECT COUNT(*) as c FROM products').get() as { c: number };
  equal(afterReset.c, 0, 'stale database is dropped and rebuilt empty');

  const resetVersion = staleRaw.prepare('PRAGMA user_version').get() as { user_version: number };
  equal(resetVersion.user_version, SCHEMA_VERSION, 'rebuilt database is stamped current');

  for (const table of TABLES) {
    check(describe(staleRaw, table) === describe(freshRaw, table), `${table} rebuilt to the current shape`);
  }

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
