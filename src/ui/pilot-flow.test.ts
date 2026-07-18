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
import {
  getHardwareBackTarget,
  registerHardwareBackOverride,
  runHardwareBackOverride,
} from './navigation';
import type { Screen } from './screens';

const root = join(__dirname, '..', '..');
const app = readFileSync(join(root, 'src', 'app', 'ShopTrackApp.tsx'), 'utf8');
const styles = readFileSync(join(root, 'src', 'ui', 'styles.ts'), 'utf8');
const home = readFileSync(join(root, 'src', 'ui', 'home', 'HomeScreen.tsx'), 'utf8');
const count = readFileSync(join(root, 'src', 'ui', 'count', 'CountScreen.tsx'), 'utf8');
const productsList = readFileSync(join(root, 'src', 'ui', 'products', 'ProductsListScreen.tsx'), 'utf8');
const addProduct = readFileSync(join(root, 'src', 'ui', 'products', 'AddProductScreen.tsx'), 'utf8');
const stockIn = readFileSync(join(root, 'src', 'ui', 'stockin', 'StockInScreen.tsx'), 'utf8');
const weekly = readFileSync(join(root, 'src', 'ui', 'weekly', 'WeeklySummaryScreen.tsx'), 'utf8');
const expenses = readFileSync(join(root, 'src', 'ui', 'expenses', 'ExpensesScreen.tsx'), 'utf8');
const credit = readFileSync(join(root, 'src', 'ui', 'credit', 'CreditScreen.tsx'), 'utf8');
const sales = readFileSync(join(root, 'src', 'ui', 'sales', 'SalesScreen.tsx'), 'utf8');
const cashUp = readFileSync(join(root, 'src', 'ui', 'cashup', 'CashUpScreen.tsx'), 'utf8');
const monthCalendar = readFileSync(join(root, 'src', 'ui', 'sales', 'MonthCalendar.tsx'), 'utf8');
const calendarStyles = readFileSync(join(root, 'src', 'ui', 'sales', 'calendarStyles.ts'), 'utf8');
const screenHeader = readFileSync(join(root, 'src', 'ui', 'components', 'ScreenHeader.tsx'), 'utf8');
const dataSafety = readFileSync(join(root, 'src', 'app', 'dataSafety.ts'), 'utf8');
const cloudBackup = readFileSync(join(root, 'src', 'net', 'cloudBackup.ts'), 'utf8');
const photoBackupAdapter = readFileSync(join(root, 'src', 'media', 'photoBackupAdapter.ts'), 'utf8');
const settings = readFileSync(join(root, 'src', 'ui', 'settings', 'SettingsScreen.tsx'), 'utf8');
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
check(
  app.includes('{ includeCustomerPhotos: false }'),
  'plaintext shared backup excludes sensitive customer/ID photos'
);
check(
  app.includes('restoreBackupWithSafetySnapshot(db, backup)')
    && dataSafety.indexOf('createPreRestoreSafetySnapshot(db, now)')
      < dataSafety.indexOf('restoreBackup(db, backup, photoBackupMediaAdapter)'),
  'shared restore saves the current shop before transactionally replacing data and media'
);
check(
  app.indexOf('recoverInterruptedPhotoRestore(db)')
    < app.indexOf('sweepOrphanedPhotos(db)')
    && photoBackupAdapter.includes('MEDIA_RESTORE_TOKEN_SETTING')
    && photoBackupAdapter.includes('shoptrack-media-restore-journal-v1.json'),
  'startup resolves a crash-interrupted SQL/media restore before orphan sweeping'
);
check(
  dataSafety.includes('createBackup(db, photoBackupMediaAdapter)'),
  'daily device backups embed every referenced managed photo'
);
check(
  cloudBackup.includes('createBackup(db, mediaReader)')
    && settings.includes('uploadEncryptedBackup(db, store, phrase, photoBackupMediaAdapter)'),
  'encrypted cloud uploads receive the media reader without reversing layer direction'
);
check(
  settings.includes('restoreBackupWithSafetySnapshot(db, backup)'),
  'cloud restore uses the same safety-snapshotted data and media replacement path'
);
check(
  app.includes('renderBackupPreviewMessage(')
    && app.includes('buildBackupPreview(backup)')
    && settings.includes('renderBackupPreviewMessage(buildBackupPreview(backup), strings)'),
  'local and encrypted-cloud restores show the same validated content preview before replacement'
);
check(
  dataSafety.includes('undoRestoreFromSafetySnapshot')
    && dataSafety.includes('await restoreBackupWithSafetySnapshot(db, backup)')
    && app.includes('undoRestoreFromSafetySnapshot(db, snapshotUri)')
    && settings.includes('undoRestoreFromSafetySnapshot(db, snapshotUri)'),
  'a successful local or cloud restore offers a reversible, safely snapshotted Undo'
);
check(
  app.includes('dailyBackup.created')
    && app.includes('isAutomaticCloudBackupOptedIn()')
    && settings.includes('setAutomaticCloudBackupOptIn(next)')
    && settings.includes('automaticCloudBackupEntitled')
    && dataSafety.includes('planAutomaticCloudBackup({'),
  'automatic encrypted backup is owner-opted-in, Plus-gated, daily-coalesced, and retryable'
);
check(
  app.includes("screen === 'settings'")
    && home.includes('sharedBackupDue && !ownerLocked')
    && home.includes('{!ownerLocked && ('),
  'owner lock protects recovery phrases and backup/restore data from a worker holding the phone'
);
check(!app.includes('version: SCHEMA_VERSION'), 'backup format is not tied to schema version');
check(stockIn.includes('COST_MODE_EACH'), 'stock-in supports total and per-item cost modes');
check(
  addProduct.includes("import { lookupOpenFoodFactsProduct } from '../../net/openFoodFacts';")
    && addProduct.includes('lookupOpenFoodFactsProduct(scannedBarcode)')
    && addProduct.includes('onScanned={handleBarcodeScanned}'),
  'Add Product scans call the Open Food Facts client after persisting the barcode'
);
check(
  addProduct.includes('nameWasUntouchedAndBlank')
    && addProduct.includes('!nameTouchedRef.current')
    && addProduct.includes("nameRef.current.trim() !== ''")
    && addProduct.includes('lookupToken !== lookupTokenRef.current'),
  'product-name prefill requires an untouched blank field and ignores stale lookups'
);
check(
  addProduct.includes('strings.BARCODE_LOOKING_UP')
    && addProduct.includes('accessibilityLiveRegion="polite"')
    && addProduct.includes('accessibilityRole="progressbar"'),
  'barcode lookup exposes localized accessible progress copy'
);
check(stockIn.includes('setProductSearch'), 'stock-in product selection is searchable');
check(
  stockIn.includes('setSavedMovementId(movementId)') && !stockIn.includes('Alert.alert(\n        strings.STOCK_ADDED'),
  'stock-in success is an in-app state, not an alert callback'
);
check(
  count.includes('styles.resultConfidenceCount') && count.includes('styles.resultConfidenceLevel'),
  'count-result confidence copy uses its verified on-green styles'
);
check(
  home.includes('AccessibilityInfo.isReduceMotionEnabled()'),
  'Home respects the device reduced-motion preference'
);
check(
  home.includes('accessibilityRole="button"') && home.includes('accessibilityLabel={strings.COUNT_STOCK}'),
  'core Home actions have explicit accessibility semantics'
);
check(
  expenses.includes('pendingDeleteId') && expenses.includes('strings.EXPENSES_DELETE_CONFIRM'),
  'expense correction has a visible inline confirmation flow'
);
check(expenses.includes('<ChoiceChip'), 'expense categories expose a reusable selected state');
check(
  monthCalendar.includes('recordedDays') && monthCalendar.includes('complete') && monthCalendar.includes('partial'),
  'month picker distinguishes complete, partial, empty and future states'
);
check(
  sales.includes('<SalesStatisticsCard')
    && sales.includes('highest_day: highest')
    && sales.includes('month_over_month: monthChange')
    && sales.includes('statistics.year_to_date'),
  'Sales Book renders the high/low day, adjacent-month and year-to-date statistics'
);
check(
  sales.includes('ytd.current.months_recorded')
    && sales.includes('ytd.previous.months_recorded')
    && sales.includes('SALES_STATS_NO_PREVIOUS_MONTH'),
  'sales comparisons expose missing-period coverage instead of treating it as zero'
);
check(
  calendarStyles.includes("flexBasis: '42%'") && calendarStyles.includes('minWidth: 120'),
  'month picker uses a compact-phone-safe two-column layout'
);
check(
  screenHeader.includes('accessibilityRole="button"') && screenHeader.includes('accessibilityRole="header"'),
  'the reusable screen header labels navigation and titles'
);
check(!uiSources.includes('width: 50'), 'screen headers no longer balance titles with fixed spacer views');
check(!uiSources.includes('placeholderTextColor="#999"'), 'inputs use the verified placeholder token');
check(!uiSources.includes('placeholderTextColor="#CCCCCC"'), 'count inputs use the verified placeholder token');

const fixedBackTargets: readonly (readonly [Screen, Screen | null])[] = [
  ['home', null],
  ['products', 'home'],
  ['edit_product', 'products'],
  ['count', 'home'],
  ['stock_in', 'home'],
  ['activity', 'home'],
  ['weekly', 'home'],
  ['credit', 'home'],
  ['expenses', 'home'],
  ['cashup', 'home'],
  ['sales', 'home'],
  ['sales_today', 'home'],
  ['settings', 'home'],
  ['health', 'home'],
  ['owner_unlock', 'home'],
];
for (const [from, expected] of fixedBackTargets) {
  check(
    getHardwareBackTarget(from, false) === expected,
    `Android Back maps ${from} to ${expected ?? 'system exit'}`
  );
}
check(
  getHardwareBackTarget('add_product', false) === 'home',
  'Android Back returns first-product setup to Home'
);
check(
  getHardwareBackTarget('add_product', true) === 'products',
  'Android Back returns catalog product setup to Products'
);
check(
  app.includes("BackHandler.addEventListener('hardwareBackPress'") &&
    app.includes('runHardwareBackOverride()') &&
    app.includes('getHardwareBackTarget(screen, products.length > 0)'),
  'the Android hardware handler applies the tested screen-parent policy'
);
check(
  [count, stockIn, credit, expenses, sales, cashUp].every(source =>
    source.includes('registerHardwareBackOverride')
  ),
  'multi-step screens register child-level Android Back behavior'
);
check(
  credit.includes("kind: 'manage_customer'")
    && credit.includes("mode.kind === 'add_customer' || mode.kind === 'manage_customer'")
    && credit.includes('function ManageCustomerScreen')
    && credit.includes('registerHardwareBackOverride(() => {'),
  'customer management is reachable and owns Android Back while a photo draft exists'
);

let firstOverrideRuns = 0;
const clearFirstOverride = registerHardwareBackOverride(() => {
  firstOverrideRuns++;
  return true;
});
check(
  runHardwareBackOverride() && firstOverrideRuns === 1,
  'the active child can consume Android Back before top-level navigation'
);
let secondOverrideRuns = 0;
const clearSecondOverride = registerHardwareBackOverride(() => {
  secondOverrideRuns++;
  return false;
});
clearFirstOverride();
check(
  !runHardwareBackOverride() && secondOverrideRuns === 1,
  'a stale child cleanup cannot erase the newly active Back override'
);
clearSecondOverride();
check(!runHardwareBackOverride(), 'the Back override registry clears on unmount');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} pilot screen contract(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all pilot screen contracts held');
