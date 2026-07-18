/**
 * ShopTrack - Main App Entry Point
 * ==================================
 *
 * A simple profit tracking app for spaza shops.
 * Offline-first, stock-movement based, no POS required.
 *
 * This file owns three things: the single database open, the app-level
 * state that Home and the screens share, and the screen state machine.
 * Every screen lives in src/ui/<feature>/.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  AppState,
  BackHandler,
  Platform,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import { Paths, File } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  calculatePeriodSummary,
  getPeriodBounds,
} from '../core/calculations';
import {
  createBackup,
  getSetting,
  getLatestCountSession,
  getLastCashUp,
  loadCountSessionProductIds,
  loadCreditEntries,
  loadCustomers,
  loadExpenses,
  loadMovements,
  loadProducts,
  loadSalesEntries,
  parseBackupText,
  setSetting,
  toCoreProduct,
  undoCountSession,
  type AppProduct,
  type CashUp,
} from '../core/db';
import { initDatabase } from '../core/schema';
import { calculateCreditSummary, type CreditSummary } from '../core/credit';
import { calculateExpenseSummary, type ExpenseSummary } from '../core/expenses';
import { calculateSalesHistory, type SalesHistory } from '../core/sales';
import {
  CURRENCY_SETTING_KEY,
  setCurrentCurrency,
  type CurrencyCode,
} from '../core/currency';
import {
  backupFilenameSlug,
  setCurrentShopProfile,
  SHOP_NAME_SETTING_KEY,
  SHOP_PHONE_SETTING_KEY,
  type ShopProfile,
} from '../core/shopProfile';
import {
  isOwnerLocked,
  lockOwner,
  OWNER_PIN_SETTING_KEY,
  setStoredOwnerPin,
  unlockOwner,
} from '../core/ownerLock';
import { OwnerGateScreen } from '../ui/owner/OwnerGateScreen';
import { styles } from '../ui/styles';
import { color } from '../ui/theme';
import {
  photoBackupMediaAdapter,
  recoverInterruptedPhotoRestore,
} from '../media/photoBackupAdapter';
import { sweepOrphanedPhotos } from '../media/photoMaintenance';
import { getStrings, isLanguage, type Language } from '../i18n';
import type { Screen } from '../ui/screens';
import { getHardwareBackTarget, runHardwareBackOverride } from '../ui/navigation';
import { HomeScreen, type RestockItem } from '../ui/home/HomeScreen';
import { ScreenHeader } from '../ui/components/ScreenHeader';
import { ProductsListScreen } from '../ui/products/ProductsListScreen';
import { AddProductScreen } from '../ui/products/AddProductScreen';
import { EditProductScreen } from '../ui/products/EditProductScreen';
import { CountScreen } from '../ui/count/CountScreen';
import { StockInScreen } from '../ui/stockin/StockInScreen';
import { ActivityScreen } from '../ui/activity/ActivityScreen';
import { WeeklySummaryScreen } from '../ui/weekly/WeeklySummaryScreen';
import { CreditScreen } from '../ui/credit/CreditScreen';
import { ExpensesScreen } from '../ui/expenses/ExpensesScreen';
import { CashUpScreen } from '../ui/cashup/CashUpScreen';
import { SalesScreen } from '../ui/sales/SalesScreen';
import { expo as expoConfig } from '../../app.json';
import {
  ensureDailyBackup,
  flushPendingCrash,
  installGlobalCrashCapture,
  isAutomaticCloudBackupOptedIn,
  LAST_SHARED_BACKUP_SETTING,
  lastSharedBackupAt,
  restoreBackupWithSafetySnapshot,
  scheduleAutomaticCloudBackup,
  undoRestoreFromSafetySnapshot,
} from './dataSafety';
import { isSharedBackupDue } from '../core/safety';
import { buildBackupPreview } from '../core/backupPreview';
import { initPrivacySafeCrashReporting } from './telemetry';
import { refreshActivationMetric } from './activation';
import {
  COUNTRY_PACK_SETTING_KEY,
  setCurrentCountryPack,
  type CountryPackCode,
} from '../core/countryPacks';
import { SettingsScreen } from '../ui/settings/SettingsScreen';
import { HealthReportScreen } from '../ui/reports/HealthReportScreen';
import { captureInitialPartnerReferral } from './partnerAttribution';
import { createConfiguredCloudBackupStore } from '../net/cloudBackup';
import { renderBackupPreviewMessage } from '../ui/backupPreviewMessage';
import {
  canUsePlusFeature,
  FREE_ENTITLEMENT_STATE,
  type EntitlementState,
} from '../core/entitlements';

const automaticCloudBackupStore = createConfiguredCloudBackupStore();

// ============================================
// DATABASE SETUP
// ============================================

/**
 * Do NOT switch this back to openDatabaseSync. On native it makes no
 * difference, but on web expo-sqlite runs SQLite in a worker, and the *sync*
 * API reaches it by spinning on Atomics.load over a SharedArrayBuffer until the
 * worker replies (expo-sqlite/web/WorkerChannel.ts). When that busy-wait is not
 * satisfied -- which is routine in a non-cross-origin-isolated browser -- it
 * gives up with "Sync operation timeout" and no data can be saved.
 *
 * Every async method posts to the same worker and awaits a promise instead:
 * no SharedArrayBuffer, no busy-wait, nothing to time out. Keeping every
 * database call on the async path is what makes the web build usable.
 */
let db: SQLite.SQLiteDatabase;

// Install before React mounts so launch/render failures are staged locally.
installGlobalCrashCapture(expoConfig.version);
initPrivacySafeCrashReporting();

/**
 * The database is opened exactly ONCE per JS context, and the promise is cached
 * on globalThis.
 *
 * WHY THIS IS NOT JUST A MODULE VARIABLE
 * --------------------------------------
 * On web, SQLite lives in a worker holding an OPFS access handle, and that
 * handle is EXCLUSIVE -- one holder at a time. Nothing here ever closes it,
 * because the database should stay open for the life of the app.
 *
 * So a second open, while the first handle is still held, fails with
 * SQLITE_CANTOPEN ("Error code 14: unable to open database file"), and the app
 * shows "Can't open your shop data" until the browser's storage is cleared.
 *
 * Opening used to happen inside a useEffect against a plain module variable,
 * which meant a second open every time the component remounted -- which is what
 * a Metro fast-refresh does after any code change. That is exactly the bug:
 * edit a file, and the app could no longer open its own database.
 *
 * globalThis rather than a module-level variable, because fast-refresh
 * re-evaluates the module and would reset a module variable while the worker
 * from the previous evaluation is still very much alive, still holding the file.
 * globalThis survives that.
 *
 * A failed open is NOT cached: the rejection clears the slot so a retry can
 * genuinely try again rather than replay the same error forever.
 */
const DB_SLOT = '__shoptrack_db__';

type DbGlobal = typeof globalThis & {
  [DB_SLOT]?: Promise<SQLite.SQLiteDatabase>;
};

function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const g = globalThis as DbGlobal;

  if (!g[DB_SLOT]) {
    g[DB_SLOT] = SQLite.openDatabaseAsync('shoptrack.db').catch(error => {
      delete g[DB_SLOT];
      throw error;
    });
  }

  return g[DB_SLOT];
}

// ============================================
// TYPES
// ============================================

// The UI product shape lives with the adapter so the engine and the
// screens cannot drift apart.
type Product = AppProduct;

// Helper to get strings for current language
const t = getStrings;

// How far back to load movements beyond a reporting period. The engine needs
// prior history to establish an opening quantity for each product.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// ============================================
// MAIN APP COMPONENT
// ============================================

export function ShopTrackApp({
  entitlementState = FREE_ENTITLEMENT_STATE,
}: {
  /** Future billing/account adapters inject their normalized result here. */
  entitlementState?: EntitlementState;
}) {
  const [screen, setScreen] = useState<Screen>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastProfit, setLastProfit] = useState<number | null>(null);
  const [latestCountSessionId, setLatestCountSessionId] = useState<number | null>(null);
  const [latestCountAt, setLatestCountAt] = useState<number | null>(null);
  const [lang, setLang] = useState<Language>('en');
  const [restockPriority, setRestockPriority] = useState<RestockItem[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [credit, setCredit] = useState<CreditSummary | null>(null);
  const [, setExpenses] = useState<ExpenseSummary | null>(null);
  const [lastCashUp, setLastCashUp] = useState<CashUp | null>(null);
  const [sales, setSales] = useState<SalesHistory | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const [crashNotice, setCrashNotice] = useState(false);
  const [sharedBackupDue, setSharedBackupDue] = useState(false);
  // Values live in the backed-up settings table. React copies rerender every
  // money label and country-specific payment label after a settings change.
  const [currencyCode, setCurrencyCode] = useState<CurrencyCode>('ZAR');
  const [countryPackCode, setCountryPackCode] = useState<CountryPackCode>('ZA');
  const [shopName, setShopName] = useState<string | null>(null);
  // React copy of the module lock state (ownerLock.ts), so gating re-renders.
  const [ownerLocked, setOwnerLocked] = useState(false);
  const strings = t(lang);

  // Re-lock whenever the app leaves the foreground: handing the phone to the
  // worker mid-session must hand over nothing.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        lockOwner();
        setOwnerLocked(isOwnerLocked());
      }
    });
    return () => subscription.remove();
  }, []);

  // Keep Android's system Back behavior aligned with every visible header.
  // Returning false on Home deliberately hands the event back to Android so
  // the normal app-exit behavior remains available there.
  useEffect(() => {
    if (Platform.OS !== 'android') return;

    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (runHardwareBackOverride()) return true;
      const target = getHardwareBackTarget(screen, products.length > 0);
      if (target == null) return false;
      setScreen(target);
      return true;
    });

    return () => subscription.remove();
  }, [screen, products.length]);

  // Load the stored profile into the module (for the share renderer) and the
  // React copy (for the home header). Runs at init and after every restore --
  // a restored shop must come back knowing its own name.
  const applyStoredShopProfile = async () => {
    const profile = setCurrentShopProfile({
      shop_name: await getSetting(db, SHOP_NAME_SETTING_KEY),
      shop_phone: await getSetting(db, SHOP_PHONE_SETTING_KEY),
    });
    setShopName(profile.shop_name);
    // The owner PIN travels in backups too; loading always re-locks.
    setStoredOwnerPin(await getSetting(db, OWNER_PIN_SETTING_KEY));
    setOwnerLocked(isOwnerLocked());
  };

  const changeOwnerPin = async (pin: string | null) => {
    await setSetting(db, OWNER_PIN_SETTING_KEY, pin ?? '');
    setStoredOwnerPin(pin);
    // Setting or changing a PIN re-locks (module behavior); the owner just
    // proved they know the new PIN, so let them keep working unlocked.
    if (pin != null) unlockOwner(pin);
    setOwnerLocked(isOwnerLocked());
  };

  const changeShopProfile = async (profile: ShopProfile) => {
    const clean = setCurrentShopProfile(profile);
    setShopName(clean.shop_name);
    await setSetting(db, SHOP_NAME_SETTING_KEY, clean.shop_name ?? '');
    await setSetting(db, SHOP_PHONE_SETTING_KEY, clean.shop_phone ?? '');
  };

  const refreshAfterRestore = async () => {
    const country = setCurrentCountryPack(await getSetting(db, COUNTRY_PACK_SETTING_KEY));
    setCountryPackCode(country.code);
    const currency = setCurrentCurrency(
      (await getSetting(db, CURRENCY_SETTING_KEY)) ?? country.currency
    );
    setCurrencyCode(currency.code as CurrencyCode);
    await applyStoredShopProfile();
    await Promise.all([
      refreshProducts(),
      refreshCredit(),
      refreshExpenses(),
      refreshCashUp(),
      refreshSales(),
    ]);
  };

  const changeLanguage = async (newLang: Language) => {
    setLang(newLang);
    await AsyncStorage.setItem('shoptrack_language', newLang);
  };

  const changeCurrency = async (code: CurrencyCode) => {
    setCurrentCurrency(code);
    setCurrencyCode(code);
    await setSetting(db, CURRENCY_SETTING_KEY, code);
  };

  const changeCountryPack = async (code: CountryPackCode) => {
    const pack = setCurrentCountryPack(code);
    setCountryPackCode(code);
    await setSetting(db, COUNTRY_PACK_SETTING_KEY, code);
    await changeCurrency(pack.currency);
  };

  // The owner's own sales book, for the Home summary.
  const refreshSales = useCallback(async () => {
    try {
      setSales(calculateSalesHistory(await loadSalesEntries(db)));
    } catch (error) {
      console.error('Load sales error:', error);
    }
  }, []);

  // The most recent till count, for the Home signal.
  const refreshCashUp = useCallback(async () => {
    try {
      setLastCashUp(await getLastCashUp(db));
    } catch (error) {
      console.error('Load cash up error:', error);
    }
  }, []);

  // Load this month's expenses for the Home summary.
  //
  // Scoped to the month because rent and electricity arrive monthly; a weekly
  // window would show a spike one week and nothing the next.
  const refreshExpenses = useCallback(async () => {
    try {
      const month = getPeriodBounds('this_month');
      const rows = await loadExpenses(db, month.start);
      setExpenses(calculateExpenseSummary(rows, month.start, month.end));
    } catch (error) {
      console.error('Load expenses error:', error);
    }
  }, []);

  // Load the credit book for the Home summary
  const refreshCredit = useCallback(async () => {
    try {
      const [customers, entries] = await Promise.all([
        loadCustomers(db),
        loadCreditEntries(db),
      ]);
      const week = getPeriodBounds('this_week');
      setCredit(calculateCreditSummary(customers, entries, week.start, week.end));
    } catch (error) {
      console.error('Load credit error:', error);
    }
  }, []);

  // Load products from database
  const refreshProducts = useCallback(async () => {
    const result = await loadProducts(db);
    setProducts(result);

    // Refresh every Home signal derived from stock, including the most recent
    // saved profit so it survives closing and reopening the app.
    await Promise.all([
      calculateRestockPriority(result),
      refreshLatestProfit(result),
    ]);
  }, []);

  // Open the database and load everything Home needs.
  //
  // Also the retry: openDatabase() drops its cached promise when an open fails,
  // so calling this again is a real second attempt rather than a replay of the
  // same error.
  const init = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      // Load saved language. Any known language loads, reviewed or not --
      // the owner reviews draft translations inside the app, and a draft
      // that resets to English on every restart cannot be reviewed.
      const savedLang = await AsyncStorage.getItem('shoptrack_language');
      if (isLanguage(savedLang)) {
        setLang(savedLang);
      }

      db = await openDatabase();
      await initDatabase(db);
      await recoverInterruptedPhotoRestore(db);
      const photoMaintenance = await sweepOrphanedPhotos(db);
      if (photoMaintenance.failed > 0 || photoMaintenance.missingReferenced.length > 0) {
        console.warn('Photo maintenance found incomplete media:', photoMaintenance);
      }
      await captureInitialPartnerReferral(db);
      setCrashNotice((await flushPendingCrash(db)) != null);
      const country = setCurrentCountryPack(await getSetting(db, COUNTRY_PACK_SETTING_KEY));
      setCountryPackCode(country.code);
      const currency = setCurrentCurrency(
        (await getSetting(db, CURRENCY_SETTING_KEY)) ?? country.currency
      );
      setCurrencyCode(currency.code as CurrencyCode);
      await applyStoredShopProfile();
      setSharedBackupDue(isSharedBackupDue(await lastSharedBackupAt(db)));
      try {
        const dailyBackup = await ensureDailyBackup(db);
        const automaticCloudBackupOptedIn = await isAutomaticCloudBackupOptedIn();
        scheduleAutomaticCloudBackup(db, {
          optedIn: automaticCloudBackupOptedIn,
          entitled: canUsePlusFeature('automatic_cloud_backup', entitlementState),
          store: automaticCloudBackupStore,
          newSnapshot: dailyBackup.created,
        });
      } catch (error) {
        console.error('Auto-backup error:', error);
      }
      await refreshActivationMetric(db);
      await refreshProducts();
      await refreshCredit();
      await refreshExpenses();
      await refreshCashUp();
      await refreshSales();
    } catch (error) {
      console.error('Database init error:', error);
      // Kept verbatim. The exact wording is the fastest route back to the notes
      // above: "Sync operation timeout" means a sync SQLite call came back on
      // web; "code 14: unable to open database file" means something opened the
      // database twice.
      setDbError(error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  }, [
    entitlementState,
    refreshProducts,
    refreshCredit,
    refreshExpenses,
    refreshCashUp,
    refreshSales,
  ]);

  useEffect(() => {
    init();
    // Deliberately once per mount, not on every init identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (screen === 'home' && !loading && !dbError) {
      void refreshActivationMetric(db).catch(error => console.error('Activation metric error:', error));
    }
  }, [screen, loading, dbError]);

  const refreshLatestProfit = async (productList: Product[]) => {
    const latest = await getLatestCountSession(db);
    setLatestCountSessionId(latest?.id ?? null);
    setLatestCountAt(latest?.completed_at ?? null);
    if (!latest) {
      setLastProfit(null);
      return;
    }

    const [productIds, movements] = await Promise.all([
      loadCountSessionProductIds(db, latest.id),
      loadMovements(db),
    ]);
    const counted = productList.filter(product => productIds.includes(product.id));
    const hasPriorBaseline = movements.some(
      movement => movement.type === 'COUNT' &&
        movement.recorded_at < latest.completed_at &&
        productIds.includes(movement.product_id)
    );
    if (!hasPriorBaseline) {
      setLastProfit(null);
      return;
    }
    const previousCountAt = movements
      .filter(movement => movement.type === 'COUNT' && movement.recorded_at < latest.completed_at)
      .reduce((mostRecent, movement) => Math.max(mostRecent, movement.recorded_at), 0);
    const summary = calculatePeriodSummary(
      counted.map(toCoreProduct),
      movements,
      previousCountAt > 0 ? previousCountAt + 1 : latest.completed_at,
      latest.completed_at
    );
    setLastProfit(summary.total_estimated_profit);
  };

  const handleUndoLatestCount = () => {
    if (latestCountSessionId == null) return;
    Alert.alert(
      strings.COUNT_UNDO,
      strings.COUNT_UNDO_CONFIRM,
      [
        { text: strings.COUNT_GO_BACK, style: 'cancel' },
        {
          text: strings.COUNT_UNDO,
          style: 'destructive',
          onPress: async () => {
            const undone = await undoCountSession(db, latestCountSessionId);
            if (!undone) {
              Alert.alert(strings.COUNT_UNDO_EXPIRED);
              return;
            }
            await refreshProducts();
            Alert.alert(strings.COUNT_UNDONE, strings.COUNT_UNDONE_HINT);
          },
        },
      ]
    );
  };

  // Tier 4.1: Calculate restock priority
  const calculateRestockPriority = async (productList: Product[]) => {
    try {
      const week = getPeriodBounds('this_week');
      // Reach back past the period so the engine can find an opening count.
      const movements = await loadMovements(db, week.start - THIRTY_DAYS_MS);
      const summary = calculatePeriodSummary(
        productList.map(toCoreProduct),
        movements,
        week.start,
        week.end
      );

      const byId = new Map(productList.map(p => [p.id, p]));
      const priorityItems: RestockItem[] = [];

      for (const metrics of summary.products) {
        const product = byId.get(metrics.product_id);
        if (!product) continue;

        // Needs stock on hand, known prices, and actual sales to rank on.
        if (product.current_qty <= 0 || !product.buy_price || !product.sell_price) continue;
        if (metrics.estimated_sold === 0) continue;

        const profitPerUnit = product.sell_price - product.buy_price;
        const avgPerDay = metrics.estimated_sold / 7;
        const daysOfStock = product.current_qty / Math.max(avgPerDay, 0.1);
        const score = (avgPerDay * profitPerUnit) / Math.max(product.current_qty, 1);

        let reason: 'fast_low' | 'fast' | 'profit';
        if (avgPerDay >= 1 && daysOfStock <= 3) {
          reason = 'fast_low';
        } else if (avgPerDay >= 1) {
          reason = 'fast';
        } else {
          reason = 'profit';
        }

        priorityItems.push({ name: product.name, reason, score });
      }

      // Sort by score and take top 3
      priorityItems.sort((a, b) => b.score - a.score);
      setRestockPriority(priorityItems.slice(0, 3));
    } catch (error) {
      console.error('Calculate restock priority error:', error);
    }
  };

  // ==========================================
  // BACKUP & RESTORE
  // ==========================================

  const handleBackup = async () => {
    try {
      // A WhatsApp/Drive JSON is not encrypted. Customer/ID photos therefore
      // stay on the phone; private daily snapshots and encrypted cloud uploads
      // use the default full export and preserve them.
      const backup = await createBackup(
        db,
        photoBackupMediaAdapter,
        { includeCustomerPhotos: false }
      );

      // Named after the shop so the file is findable in a WhatsApp chat full
      // of backups: "nomsas-shop-backup-2026-07-18.json".
      const date = new Date().toISOString().split('T')[0];
      const filename = `${backupFilenameSlug(shopName)}-backup-${date}.json`;
      const backupFile = new File(Paths.cache, filename);

      // Write to cache
      await backupFile.write(JSON.stringify(backup, null, 2));

      // Share
      const canShare = await isAvailableAsync();
      if (canShare) {
        await shareAsync(backupFile.uri, {
          mimeType: 'application/json',
          dialogTitle: strings.BACKUP_DIALOG_TITLE,
        });
        const sharedAt = Date.now();
        await setSetting(db, LAST_SHARED_BACKUP_SETTING, String(sharedAt), sharedAt);
        setSharedBackupDue(false);
        Alert.alert(
          strings.BACKUP_SAVED,
          `${strings.BACKUP_HINT}\n\n${strings.BACKUP_CUSTOMER_PHOTOS_EXCLUDED}`
        );
      } else {
        Alert.alert(strings.ERROR_TITLE, strings.SHARING_UNAVAILABLE);
      }
    } catch (error) {
      console.error('Backup error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_BACKUP);
    }
  };

  const handleRestore = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        // WhatsApp, Drive and some Android download managers label JSON files
        // as text/plain or application/octet-stream. Validate the contents
        // ourselves instead of hiding a genuine backup behind a MIME filter.
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return;
      }

      const pickedFile = result.assets[0];
      const restoreFile = new File(pickedFile.uri);
      const content = await restoreFile.text();
      let backup;
      try {
        backup = parseBackupText(content);
      } catch (error) {
        console.error('Backup validation error:', error);
        Alert.alert(strings.RESTORE_INVALID, strings.RESTORE_INVALID_HINT);
        return;
      }
      const backupPreviewMessage = renderBackupPreviewMessage(
        buildBackupPreview(backup),
        strings
      );

      // Confirm restore
      Alert.alert(
        strings.RESTORE_CONFIRM,
        `${strings.RESTORE_CONFIRM_HINT}\n\n${backupPreviewMessage}`,
        [
          { text: strings.CANCEL, style: 'cancel' },
          {
            text: strings.RESTORE_ACTION,
            style: 'destructive',
            onPress: async () => {
              try {
                const snapshotUri = await restoreBackupWithSafetySnapshot(db, backup);
                await refreshAfterRestore();
                Alert.alert(strings.RESTORE_DONE, strings.RESTORE_DONE_HINT, [
                  {
                    text: strings.RESTORE_UNDO_ACTION,
                    onPress: async () => {
                      try {
                        await undoRestoreFromSafetySnapshot(db, snapshotUri);
                        await refreshAfterRestore();
                        Alert.alert(strings.RESTORE_UNDO_DONE);
                      } catch (error) {
                        console.error('Restore undo error:', error);
                        Alert.alert(strings.ERROR_TITLE, strings.ERROR_RESTORE);
                      }
                    },
                  },
                  { text: strings.DONE },
                ]);
              } catch (error) {
                console.error('Restore error:', error);
                Alert.alert(strings.ERROR_TITLE, strings.ERROR_RESTORE);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_RESTORE);
    }
  };

  // ==========================================
  // SCREEN: Loading
  // ==========================================
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={color.green} />
        <Text style={styles.loadingText}>{strings.STARTING_APP}</Text>
      </View>
    );
  }

  // The database failed to open. Falling through to Home would render an empty
  // shop -- telling the owner their stock, their book, and their money are all
  // gone. Say what actually happened instead.
  if (dbError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.dbErrorContainer}>
          <Text style={styles.dbErrorIcon}>⚠️</Text>
          <Text style={styles.dbErrorTitle}>{strings.DB_ERROR_TITLE}</Text>
          <Text style={styles.dbErrorHint}>{strings.DB_ERROR_HINT}</Text>

          {/* Without this the only way out was clearing browser storage, which
              on a real phone means deleting the shop's books to fix a lock. */}
          <Pressable
            style={({ pressed }) => [
              styles.dbErrorRetry,
              pressed && styles.dbErrorRetryPressed,
            ]}
            android_ripple={{ color: color.ripple }}
            onPress={init}
          >
            <Text style={styles.dbErrorRetryText}>{strings.DB_ERROR_RETRY}</Text>
          </Pressable>

          <Text style={styles.dbErrorDetail}>{dbError}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ==========================================
  // THE SCREEN STATE MACHINE
  // ==========================================

  // The owner gate stands in front of every money screen while locked:
  // expenses, the sales book, weekly profit, activity (per-product profit),
  // the health report, and Settings (which exposes recovery phrases and data
  // replacement). Home also hides backup/share actions while locked. The
  // worker's screens -- count, stock-in, credit, cash-up, products, today's
  // takings -- remain available.
  const gatedScreen =
    screen === 'expenses' || screen === 'sales' || screen === 'weekly' ||
    screen === 'activity' || screen === 'health' || screen === 'settings' ||
    screen === 'owner_unlock';
  if (gatedScreen && ownerLocked) {
    return (
      <OwnerGateScreen
        strings={strings}
        onBack={() => setScreen('home')}
        onUnlocked={() => {
          setOwnerLocked(isOwnerLocked());
          if (screen === 'owner_unlock') setScreen('home');
        }}
      />
    );
  }
  // Unlocked (or lock disabled): this pseudo-screen has nothing to show.
  if (screen === 'owner_unlock') {
    setScreen('home');
    return null;
  }

  if (screen === 'home') {
    return (
      <HomeScreen
        shopName={shopName}
        ownerLocked={ownerLocked}
        products={products}
        lastProfit={lastProfit}
        credit={credit}
        sales={sales}
        lastCashUp={lastCashUp}
        restockPriority={restockPriority}
        latestCountSessionId={latestCountSessionId}
        latestCountAt={latestCountAt}
        crashNotice={crashNotice}
        sharedBackupDue={sharedBackupDue}
        strings={strings}
        setScreen={setScreen}
        onUndoLatestCount={handleUndoLatestCount}
        onBackup={handleBackup}
        onRestore={handleRestore}
      />
    );
  }

  if (screen === 'settings') {
    return (
      <SettingsScreen
        db={db}
        strings={strings}
        language={lang}
        currency={currencyCode}
        countryPack={countryPackCode}
        remoteViewerEntitled={canUsePlusFeature('remote_viewer', entitlementState)}
        automaticCloudBackupEntitled={canUsePlusFeature(
          'automatic_cloud_backup',
          entitlementState
        )}
        onBack={() => setScreen('home')}
        onLanguageChange={changeLanguage}
        onCurrencyChange={changeCurrency}
        onCountryPackChange={changeCountryPack}
        onShopProfileChange={changeShopProfile}
        onOwnerPinChange={changeOwnerPin}
        onDataRestored={refreshAfterRestore}
      />
    );
  }

  if (screen === 'health') {
    return <HealthReportScreen db={db} strings={strings} onBack={() => setScreen('home')} />;
  }

  if (screen === 'products') {
    return (
      <ProductsListScreen
        products={products}
        latestCountSessionId={latestCountSessionId}
        strings={strings}
        onBack={() => setScreen('home')}
        onAddProduct={() => setScreen('add_product')}
        onEditProduct={(product) => {
          setEditingProduct(product);
          setScreen('edit_product');
        }}
        onStartCount={() => setScreen('count')}
      />
    );
  }

  if (screen === 'credit') {
    return (
      <CreditScreen
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
        onChanged={refreshCredit}
      />
    );
  }

  if (screen === 'expenses') {
    return (
      <ExpensesScreen
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
        onChanged={refreshExpenses}
      />
    );
  }

  if (screen === 'sales') {
    return (
      <SalesScreen
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
        onChanged={refreshSales}
      />
    );
  }

  // The worker's path while the owner lock is on: today's takings only.
  if (screen === 'sales_today') {
    return (
      <SalesScreen
        db={db}
        strings={strings}
        todayOnly
        onBack={() => setScreen('home')}
        onChanged={refreshSales}
      />
    );
  }

  if (screen === 'cashup') {
    return (
      <CashUpScreen
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
        onChanged={refreshCashUp}
      />
    );
  }

  if (screen === 'add_product') {
    return (
      <AddProductScreen
        db={db}
        strings={strings}
        onSave={async () => {
          await refreshProducts();
          setScreen('products');
        }}
        onCancel={() => setScreen(products.length === 0 ? 'home' : 'products')}
      />
    );
  }

  if (screen === 'edit_product' && editingProduct) {
    return (
      <EditProductScreen
        db={db}
        strings={strings}
        product={editingProduct}
        onSave={async () => {
          await refreshProducts();
          setEditingProduct(null);
          setScreen('products');
        }}
        onDelete={async () => {
          await refreshProducts();
          setEditingProduct(null);
          setScreen('products');
        }}
        onCancel={() => {
          setEditingProduct(null);
          setScreen('products');
        }}
      />
    );
  }

  if (screen === 'count') {
    if (products.length === 0) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar style="dark" />
          <ScreenHeader title={strings.COUNT_STOCK} leftLabel={strings.BACK} onLeft={() => setScreen('home')} />
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.ADD_PRODUCTS_FIRST}</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              accessibilityRole="button"
              accessibilityLabel={strings.ADD_PRODUCT}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>{strings.ADD_PRODUCT}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <CountScreen
        products={products}
        db={db}
        strings={strings}
        onComplete={(profit: number | null) => {
          setLastProfit(profit);
          refreshProducts();
          setScreen('home');
        }}
        onUndo={() => {
          refreshProducts();
          setScreen('home');
        }}
        onCancel={() => setScreen('home')}
      />
    );
  }

  if (screen === 'stock_in') {
    if (products.length === 0) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar style="dark" />
          <ScreenHeader title={strings.ADD_STOCK} leftLabel={strings.BACK} onLeft={() => setScreen('home')} />
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.ADD_PRODUCTS_FIRST}</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              accessibilityRole="button"
              accessibilityLabel={strings.ADD_PRODUCT}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>{strings.ADD_PRODUCT}</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <StockInScreen
        products={products}
        db={db}
        strings={strings}
        onComplete={() => {
          refreshProducts();
          setScreen('home');
        }}
        onCancel={() => setScreen('home')}
      />
    );
  }

  if (screen === 'activity') {
    return (
      <ActivityScreen
        products={products}
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
      />
    );
  }

  if (screen === 'weekly') {
    return (
      <WeeklySummaryScreen
        products={products}
        db={db}
        strings={strings}
        onBack={() => setScreen('home')}
      />
    );
  }

  return null;
}

/** Expo's registered root has no custom props; providers can render ShopTrackApp directly. */
export default function App() {
  return <ShopTrackApp entitlementState={FREE_ENTITLEMENT_STATE} />;
}
