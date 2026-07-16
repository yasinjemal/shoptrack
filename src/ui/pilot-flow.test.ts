/**
 * Critical screen-contract checks.
 *
 * These do not replace a phone walkthrough. They pin the screen wiring that
 * previously regressed while engine tests stayed green: the Review step,
 * first-count copy, Home entry point, scrollable summary, full backup adapter,
 * and bilingual core loop.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const app = readFileSync(join(root, 'App.tsx'), 'utf8');
const styles = readFileSync(join(root, 'src', 'ui', 'styles.ts'), 'utf8');

let failures = 0;

function check(condition: boolean, label: string) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

console.log('========================================');
console.log('TEST: pilot screen contracts');
console.log('========================================');

check(
  app.includes("useState<'counting' | 'review' | 'results'>('counting')"),
  'count flow includes a Review step before Results'
);
check(app.includes("onPress={() => setStep('review')}"), 'count button opens Review instead of writing');
check(app.includes('saveCountSession(db, countedEntries'), 'Review saves through the atomic adapter');
check(app.includes('undoCountSession(db, savedSessionId)'), 'saved count offers Undo');
check(app.includes('COUNT_FIRST_VALUE'), 'first-count Review avoids a fake 0 → quantity delta');
check(app.includes('isFirstCount ? null : profit'), 'first baseline never becomes a Home profit card');
check(app.includes("onPress={() => setScreen('count')}"), 'Home exposes the core Count Stock action');
check(app.includes('READY_TO_TRACK'), 'product setup ends with a clear ready-to-count state');
check(
  app.includes('products.length > 0 && <View style={styles.actionsContainer}'),
  'first-use Home hides the full action grid until a product exists'
);
check(app.includes('<ScrollView style={styles.weeklyScroll}>'), 'Weekly Summary scrolls on small phones');
// Was pinned to the literal '#777777'. That landed at 4.48:1 -- right instinct,
// 0.02 short of WCAG AA. It now uses color.inkMuted (4.97:1), whose contrast is
// enforced by theme.test.ts rather than by a hex spelled out here.
check(
  /profitExplainer:\s*\{[^}]*color:\s*color\.inkMuted/s.test(styles),
  'profit explanation has visible contrast on its white card'
);

// The whole point of the token layer: a raw hex is a colour nobody has checked
// for contrast, and this app is read in direct sunlight.
//
// Matches ANY hex literal rather than a list of properties -- the first version
// of this check listed properties and missed borderLeftColor, which is exactly
// how #4CAF50 survived the migration.
// The database is opened once per JS context, through openDatabase(), which
// caches the promise on globalThis.
//
// On web the OPFS access handle is exclusive and nothing ever closes it, so a
// second open fails with SQLITE_CANTOPEN ("code 14: unable to open database
// file") and the app cannot read its own data until browser storage is cleared.
// It shipped: opening lived in a useEffect against a plain module variable, so
// every remount -- including every Metro fast-refresh -- opened it again.
//
// Native does not care, so this only ever breaks on web.
check(
  (app.match(/openDatabaseAsync\(/g) ?? []).length === 1,
  'the database is opened from exactly one place'
);
check(
  /const g = globalThis as DbGlobal/.test(app),
  'the open is cached on globalThis, so fast-refresh cannot open a second handle'
);
check(
  /delete g\[DB_SLOT\]/.test(app),
  'a failed open is not cached, so Try again is a real retry'
);

for (const [name, file] of [
  ['shared', join(root, 'src', 'ui', 'styles.ts')],
  ['credit', join(root, 'src', 'ui', 'credit', 'styles.ts')],
  ['expenses', join(root, 'src', 'ui', 'expenses', 'styles.ts')],
  ['cash-up', join(root, 'src', 'ui', 'cashup', 'styles.ts')],
] as const) {
  check(
    !/'#[0-9A-Fa-f]{3,8}'/.test(readFileSync(file, 'utf8')),
    `${name} styles carry no unverified hard-coded colours`
  );
}
check(!app.includes('Product Name *'), 'required-field asterisk is removed');
check(app.includes('Yazi inzuzo yakho'), 'core Home copy has an isiZulu translation');
check(app.includes('createBackup(db)'), 'screen backup uses the complete database adapter');
check(app.includes('restoreBackup(db, backup)'), 'screen restore uses the transactional adapter');
check(!app.includes('version: SCHEMA_VERSION'), 'backup format is not tied to schema version');
check(app.includes('COST_MODE_EACH'), 'stock-in supports total and per-item cost modes');
check(app.includes('setProductSearch'), 'stock-in product selection is searchable');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} pilot screen contract(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all pilot screen contracts held');
