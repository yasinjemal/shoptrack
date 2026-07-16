/**
 * Critical screen-contract checks.
 *
 * These do not replace a phone walkthrough. They pin the screen wiring that
 * previously regressed while engine tests stayed green: the Review step,
 * first-count copy, Home entry point, scrollable summary, full backup adapter,
 * and bilingual core loop.
 *
 * App.tsx was decomposed into src/ui/<feature>/ screens (July 2026); each
 * contract now points at the file that owns it. The contracts themselves are
 * unchanged.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const app = readFileSync(join(root, 'src', 'app', 'ShopTrackApp.tsx'), 'utf8');
const styles = readFileSync(join(root, 'src', 'ui', 'styles.ts'), 'utf8');
const home = readFileSync(join(root, 'src', 'ui', 'home', 'HomeScreen.tsx'), 'utf8');
const count = readFileSync(join(root, 'src', 'ui', 'count', 'CountScreen.tsx'), 'utf8');
const productsList = readFileSync(join(root, 'src', 'ui', 'products', 'ProductsListScreen.tsx'), 'utf8');
const stockIn = readFileSync(join(root, 'src', 'ui', 'stockin', 'StockInScreen.tsx'), 'utf8');
const weekly = readFileSync(join(root, 'src', 'ui', 'weekly', 'WeeklySummaryScreen.tsx'), 'utf8');
const zu = readFileSync(join(root, 'src', 'i18n', 'zu.ts'), 'utf8');

// Every UI source file, for whole-tree assertions. Test files are excluded --
// this file itself spells out the very literals it asserts are absent.
function collectSources(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) found.push(...collectSources(full));
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) found.push(full);
  }
  return found;
}
const uiSources = collectSources(join(root, 'src', 'ui'))
  .map(file => readFileSync(file, 'utf8'))
  .join('\n');

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
  count.includes("useState<'counting' | 'review' | 'results'>('counting')"),
  'count flow includes a Review step before Results'
);
check(count.includes("onPress={() => setStep('review')}"), 'count button opens Review instead of writing');
check(
  /saveCountSession\(\s*db,\s*countedEntries,/.test(count),
  'Review saves through the atomic adapter'
);
check(count.includes('undoCountSession(db, savedSessionId)'), 'saved count offers Undo');
check(count.includes('COUNT_FIRST_VALUE'), 'first-count Review avoids a fake 0 → quantity delta');
check(count.includes('isFirstCount ? null : profit'), 'first baseline never becomes a Home profit card');
check(home.includes("onPress={() => setScreen('count')}"), 'Home exposes the core Count Stock action');
check(productsList.includes('READY_TO_TRACK'), 'product setup ends with a clear ready-to-count state');
check(
  home.includes('products.length > 0 && <View style={styles.actionsContainer}'),
  'first-use Home hides the full action grid until a product exists'
);
check(weekly.includes('<ScrollView style={styles.weeklyScroll}>'), 'Weekly Summary scrolls on small phones');
// Was pinned to the literal '#777777'. That landed at 4.48:1 -- right instinct,
// 0.02 short of WCAG AA. It now uses color.inkMuted (4.97:1), whose contrast is
// enforced by theme.test.ts rather than by a hex spelled out here.
check(
  /profitExplainer:\s*\{[^}]*color:\s*color\.inkMuted/s.test(styles),
  'profit explanation has visible contrast on its white card'
);

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
  !uiSources.includes('openDatabaseAsync('),
  'no screen opens its own database handle'
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
check(!uiSources.includes('Product Name *'), 'required-field asterisk is removed');
check(zu.includes('Yazi inzuzo yakho'), 'core Home copy has an isiZulu translation');
check(app.includes('createBackup(db)'), 'screen backup uses the complete database adapter');
check(app.includes('restoreBackup(db, backup)'), 'screen restore uses the transactional adapter');
check(!app.includes('version: SCHEMA_VERSION'), 'backup format is not tied to schema version');
check(stockIn.includes('COST_MODE_EACH'), 'stock-in supports total and per-item cost modes');
check(stockIn.includes('setProductSearch'), 'stock-in product selection is searchable');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} pilot screen contract(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all pilot screen contracts held');
