/**
 * ShopTrack - Main App Entry Point
 * ==================================
 * 
 * A simple profit tracking app for spaza shops.
 * Offline-first, stock-movement based, no POS required.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Animated,
  Text,
  View,
  TouchableOpacity,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SQLite from 'expo-sqlite';
import { Paths, File } from 'expo-file-system';
import { isAvailableAsync, shareAsync } from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  calculatePeriodSummary,
  calculateProductMetrics,
  getPeriodBounds,
} from './src/core/calculations';
import {
  addProduct,
  createBackup,
  deactivateProduct,
  getLatestCountSession,
  loadMovements,
  loadProducts,
  loadCountSessionProductIds,
  loadPreviouslyCountedProductIds,
  normaliseBackup,
  recordStockIn,
  restoreBackup,
  saveCountSession,
  toCoreProduct,
  undoCountSession,
  undoStockIn,
  updateProduct,
  type AppProduct,
} from './src/core/db';
import { initDatabase } from './src/core/schema';
import {
  calculateCreditSummary,
  summariseOutstanding,
  type CreditSummary,
  type DueOptionKey,
} from './src/core/credit';
import { CASH_TOLERANCE } from './src/core/cashup';
import {
  calculateExpenseSummary,
  calculateNetProfit,
  type ExpenseCategory,
  type ExpenseSummary,
  type NetProfit,
} from './src/core/expenses';
import {
  getLastCashUp,
  loadCreditEntries,
  loadCustomers,
  loadExpenses,
  loadSalesEntries,
  type CashUp,
} from './src/core/db';
import { styles } from './src/ui/styles';
import { color, motion } from './src/ui/theme';
import { calculateSalesHistory, summariseSalesBook, type SalesHistory } from './src/core/sales';
import { CreditScreen } from './src/ui/credit/CreditScreen';
import { ExpensesScreen } from './src/ui/expenses/ExpensesScreen';
import { CashUpScreen } from './src/ui/cashup/CashUpScreen';
import { SalesScreen } from './src/ui/sales/SalesScreen';

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

// The UI product shape now lives with the adapter so the engine and the
// screens cannot drift apart again.
type Product = AppProduct;

type Screen = 'home' | 'products' | 'add_product' | 'edit_product' | 'count' | 'stock_in' | 'activity' | 'weekly' | 'credit' | 'expenses' | 'cashup' | 'sales';

type Language = 'en' | 'zu';

// ============================================
// LANGUAGE STRINGS
// ============================================

const STRINGS = {
  en: {
    // Count screen
    COUNT_HEADER: "How many do you have right now?",
    COUNT_HINT: "Count what's on your shelves",
    COUNT_REVIEW_TITLE: "Review your count",
    COUNT_REVIEW_HINT: "Check these numbers before they change your profit.",
    COUNT_FIRST_VALUE: (name: string, qty: number) => `${name}: first count ${qty}`,
    COUNT_CHANGE_VALUE: (name: string, before: number, after: number) => `${name}: ${before} → ${after}`,
    COUNT_REVIEW_BUTTON: (count: number) => `Review ${count} counted`,
    COUNT_SAVE_BUTTON: "Save count",
    COUNT_GO_BACK: "Go back",
    COUNT_UNDO: "Undo this count",
    COUNT_UNDO_CONFIRM: "This removes the latest count and restores the stock quantities from before it.",
    COUNT_UNDONE: "Count removed",
    COUNT_UNDONE_HINT: "Your previous stock quantities are back.",
    COUNT_UNDO_EXPIRED: "This count can no longer be undone.",
    COUNT_REMINDER_TITLE: "Time to count again",
    COUNT_REMINDER_HINT: "It has been a week. Count what's left to refresh your profit.",
    FIRST_COUNT_HINT: "This is your starting point — we'll compare future counts to this.",
    
    // Results - Profit Explanation (Tier 3.1)
    SOLD_SINCE: (n: number) => `You sold ${n} item${n !== 1 ? 's' : ''} since your last count.`,
    PROFIT_MADE: (r: number) => `You made R${r} profit`,
    NO_CHANGE: "No sales since your last count.",
    STOCK_INCREASED: "You added more stock than you sold.",
    UNUSUAL_CHANGE: "This change looks unusual. You may want to recount.",
    
    // Weekly
    WEEKLY_HEADING: "This Week",
    WEEKLY_YOU_MADE: "You made:",
    WEEKLY_PROFIT: (r: number) => `R${r} profit`,
    WEEKLY_TOP_PRODUCT: "Top product:",
    WEEKLY_COMPARED: "Compared to last week:",
    WEEKLY_MORE: (r: number) => `↑ R${r} more`,
    WEEKLY_LESS: (r: number) => `↓ R${r} less`,
    WEEKLY_FIRST_WEEK: "This is your first week tracking.",
    WEEKLY_FIRST_WEEK_HINT: "Count your stock a few times and your profit will show here.",
    WEEKLY_NO_COUNTS: "No counts yet this week",
    WEEKLY_NO_COUNTS_HINT: "Count your stock to see this week's profit.",
    WEEKLY_KEEP_COUNTING: "Keep counting! Next week you'll see how you compare.",
    
    // Backup
    BACKUP_SAVED: "Saved!",
    BACKUP_HINT: "Your data is safe. Keep this file somewhere you won't lose it — like WhatsApp or Google Drive.",
    RESTORE_DONE: "Done!",
    RESTORE_DONE_HINT: "Your shop data is back.",
    RESTORE_INVALID: "Not a ShopTrack backup",
    RESTORE_INVALID_HINT: "This doesn't look like a ShopTrack backup. Try a different file.",
    RESTORE_OLD_VERSION: "Backup is too old",
    RESTORE_OLD_VERSION_HINT: "This backup was made by an older version of ShopTrack and can't be opened. Use a newer backup.",
    RESTORE_CONFIRM: "Restore backup?",
    RESTORE_CONFIRM_HINT: "This will replace all your current data with the backup. Are you sure?",
    
    // Errors
    ERROR_GENERIC: "Something went wrong",
    ERROR_TITLE: "Error",
    ERROR_BACKUP: "Could not create backup",
    ERROR_RESTORE: "Could not restore backup",
    DB_ERROR_TITLE: "Can't open your shop data",
    DB_ERROR_HINT: "Your data is still on this phone — ShopTrack just couldn't read it. Try again, or close the app and open it fresh.",
    DB_ERROR_RETRY: "Try again",
    
    // Confidence Signals (Tier 3.2)
    BASED_ON_COUNTS: (n: number) => `Based on ${n} count${n !== 1 ? 's' : ''}`,
    CONFIDENCE_EARLY: "Early estimate",
    CONFIDENCE_CLEARER: "Getting clearer",
    CONFIDENCE_RELIABLE: "Reliable",
    MISSING_STOCKIN: "This profit doesn't include purchases you didn't record.",
    
    // Stock Value (Tier 3.3)
    STOCK_VALUE_LABEL: "Stock on hand (at cost)",
    STOCK_VALUE_HINT: "Based on purchase prices",
    STOCK_VALUE_MISSING_PRICES: "Some products missing buy prices",
    
    // Restock Priority (Tier 4.1)
    RESTOCK_TITLE: "Restock priority",
    RESTOCK_HINT: "Based on recent sales and stock levels",
    RESTOCK_FAST_LOW: "sells fast, low stock",
    RESTOCK_FAST: "sells fast",
    RESTOCK_PROFIT: "high profit",
    
    // Money Tied Up (Tier 4.2)
    SLOW_STOCK_TITLE: "Money tied up in slow stock",
    SLOW_STOCK_HINT: "Stock with little or no movement this week",
    SLOW_STOCK_LABEL: "slow",
    
    // Silent Loss Detector (Tier 4.3)
    LOSS_TITLE: "Some products are losing profit",
    LOSS_HINT: "Selling below purchase price",
    
    // Owner Memory (Tier 4.4)
    OWNER_MEMORY_TITLE: "This week you mostly sold",

    // Credit book / izikweletu
    CREDIT_TITLE: "Credit Book",
    CREDIT_HOME_BUTTON: "Credit Book",
    CREDIT_HOME_HINT: "Who owes you",
    CREDIT_EMPTY: "No credit yet",
    CREDIT_EMPTY_HINT: "When someone takes goods and pays later, write it here so you don't forget.",
    CREDIT_ALL_PAID: "Everyone is paid up",
    CREDIT_ALL_PAID_HINT: "Nobody owes you anything right now.",
    CREDIT_OUTSTANDING_LABEL: "Owed to you",
    CREDIT_WEEK_SUMMARY: (given: string, paid: string) => `This week: ${given} given, ${paid} paid back`,
    CREDIT_STALE_TITLE: "Not paid for a long time",
    CREDIT_STALE_HINT: "These people may need a reminder.",
    CREDIT_OVERDUE_TITLE: "Said they would pay by now",
    CREDIT_OVERDUE_HINT: "They named a day and it has passed.",
    CREDIT_ADD_CUSTOMER: "Add Person",
    CREDIT_CUSTOMER_NAME: "Name",
    CREDIT_CUSTOMER_PHONE: "Phone",
    CREDIT_PHONE_OPTIONAL: "Optional — leave empty if you don't have it.",
    CREDIT_TAKING_NOW: "How much are they taking?",
    CREDIT_TAKING_HINT: "Leave empty if they're not taking anything yet.",
    CREDIT_WHEN_PAY: "When will they pay?",
    CREDIT_DUE_OPTION: (key: DueOptionKey) => ({
      friday: 'Friday',
      end_of_month: 'End of month',
      two_weeks: 'In 2 weeks',
      unknown: "Didn't say",
    })[key],
    CREDIT_GIVE: "Gave credit",
    CREDIT_RECEIVE: "Got paid",
    CREDIT_AMOUNT: "How much?",
    CREDIT_NOTE: "What did they take?",
    CREDIT_NOTE_HINT: "Bread and milk",
    CREDIT_SAVE: "Save",
    CREDIT_SAVING: "Saving...",
    CREDIT_DAYS_QUIET: (days: number) => days === 0 ? "today" : days === 1 ? "1 day ago" : `${days} days ago`,
    CREDIT_DUE_IN: (days: number) => days === 0 ? "Says they'll pay today" : days === 1 ? "Says they'll pay tomorrow" : `Says they'll pay in ${days} days`,
    CREDIT_OVERDUE_BY: (days: number) => days === 0 ? "was due today" : days === 1 ? "1 day late" : `${days} days late`,
    CREDIT_PAID_UP: "They will be all paid up",
    CREDIT_PAID_UP_TAG: "Paid up",
    CREDIT_OWES_YOU_CHANGE: "You owe them change",
    CREDIT_CURRENT_OWES: (amount: string) => `Owes you ${amount}`,
    CREDIT_CURRENT_CHANGE: (amount: string) => `You owe them ${amount} change`,
    // Shown next to profit, never subtracted from it (see src/core/credit.ts)
    CREDIT_NOT_IN_HAND: (amount: string) => `${amount} of this is still owed to you.`,

    // Expenses
    EXPENSES_TITLE: "Expenses",
    EXPENSES_HOME_BUTTON: "Expenses",
    EXPENSES_HOME_HINT: "What you pay out",
    EXPENSES_EMPTY: "No expenses yet",
    EXPENSES_EMPTY_HINT: "Rent, electricity, transport, wages. Add them here so your profit is the real number.",
    EXPENSES_MONTH_LABEL: "Paid out this month",
    EXPENSES_ADD: "Add Expense",
    EXPENSES_AMOUNT: "How much?",
    EXPENSES_CATEGORY: "What was it for?",
    EXPENSES_NOTE: "Note",
    EXPENSES_NOTE_HINT: "Taxi to cash and carry",
    EXPENSES_SAVE: "Save",
    EXPENSES_SAVING: "Saving...",
    EXPENSES_NOT_STOCK: "Don't add stock you bought here — use Add Stock for that, or it gets counted twice.",
    EXPENSES_DELETE_CONFIRM: "Remove this expense?",
    EXPENSES_DELETE_CONFIRM_HINT: "It will be taken off your totals.",
    EXPENSES_DELETE: "Remove",
    EXPENSES_CANCEL: "Cancel",
    CATEGORY_LABEL: (c: ExpenseCategory) => ({
      RENT: 'Rent',
      ELECTRICITY: 'Electricity',
      TRANSPORT: 'Transport',
      WAGES: 'Wages',
      AIRTIME: 'Airtime & data',
      OTHER: 'Other',
    })[c],

    // Net profit (gross - expenses)
    NET_FROM_SALES: "From sales:",
    NET_EXPENSES: "Costs:",
    NET_KEPT: "You kept:",
    NET_LOSS: "You are short:",
    NET_NO_EXPENSES: "No expenses recorded, so this is before rent and costs.",

    // Cash up
    CASHUP_TITLE: "Cash Up",
    CASHUP_HOME_BUTTON: "Cash Up",
    CASHUP_HOME_HINT: "Count your till",

    // Sales book
    SALES_TITLE: "Sales Book",
    SALES_HOME_BUTTON: "Sales Book",
    SALES_HOME_HINT: "What you took",
    SALES_EMPTY: "No sales written down yet",
    SALES_EMPTY_HINT: "Keep a book of what you take each day? Write it here and ShopTrack works out what you made — even for months before you got the app.",
    SALES_TOTAL_LABEL: "Profit so far",
    SALES_TOTAL_HINT: (months: number, margin: string) =>
      `From ${months} ${months === 1 ? 'month' : 'months'}, keeping about ${margin}`,
    SALES_TODAY: "Today's sales",
    SALES_BACKFILL: "Add a past month",
    SALES_TOOK_TODAY: "How much did you take today?",
    SALES_DAYS_FILLED: (filled: number, total: number) => `${filled} of ${total} days filled in`,
    SALES_FILL_HINT: "Fill in the days you know. Leave the rest empty. Put 0 for a day you were closed.",
    SALES_MARGIN: "How much of that do you keep?",
    SALES_MARGIN_HINT: "Out of every R100 you take, how much is yours after paying for the stock? Most shops keep R20–R30.",
    SALES_MARGIN_IS_YOURS: "This is your own estimate, so the profit is an estimate too. Count your stock for the exact number.",
    SALES_WILL_KEEP: (amount: string) => `You kept about ${amount}`,
    SALES_PICK_MONTH: "Which month?",
    SALES_SAVE: "Save",
    SALES_SAVING: "Saving...",
    SALES_CANCEL: "Cancel",
    SALES_MONTH_DAYS: (days: number) => `${days} ${days === 1 ? 'day' : 'days'} written down`,
    SALES_MONTH_TOTAL: "whole month",
    SALES_CONFLICT: "One month is written down twice",
    SALES_CONFLICT_FIX: "tap to keep the daily entries",
    SALES_NOT_COUNTED_PROFIT: "This is from your own book. Counting stock gives its own profit — the two answer the same question in different ways, so don't add them together.",
    CASHUP_FIRST_TITLE: "Starting Cash",
    CASHUP_FIRST_HINT: "This is your starting point. Next time you cash up, we'll compare against this.",
    CASHUP_QUESTION: "How much cash is in your till?",
    CASHUP_HINT: "Count it before you look at anything else.",
    CASHUP_SINCE: (when: string) => `Since your last cash up: ${when}`,
    CASHUP_CHECK: "Check",
    CASHUP_CHECKING: "Saving...",
    CASHUP_SAVE: "Save",
    CASHUP_TRAIL_TITLE: "How we worked it out",
    CASHUP_LINE_OPENING: "Was in the till",
    CASHUP_LINE_REVENUE: "Sold",
    CASHUP_LINE_CREDIT: "Given on credit",
    CASHUP_LINE_PAYMENTS: "Debts paid to you",
    CASHUP_LINE_EXPENSES: "Expenses paid",
    CASHUP_LINE_STOCK: "Stock bought",
    CASHUP_EXPECTED: "Should be there",
    CASHUP_COUNTED: "You counted",
    CASHUP_BALANCED: "Your till is right",
    CASHUP_SHORT: "Money is missing",
    CASHUP_OVER: "There is extra",
    CASHUP_TAKE_OUT: "Taking money out?",
    CASHUP_TAKE_OUT_HINT: "If you're taking cash out now, put it here so tomorrow's count starts right.",
    CASHUP_NO_COUNT_WARNING: "You haven't counted stock since your last cash up, so the 'sold' number is a guess. Count your stock first for a real answer.",
    CASHUP_DONE: "Done",
    CASHUP_HISTORY: "Last few cash ups",
    CASHUP_CANCEL: "Cancel",
    CASHUP_HOME_SHORTFALL: "was missing at your last cash up. Tap to look again.",
    CASHUP_FLOAT: "float",
    CASHUP_STATEMENT_BALANCED: "Your till matches what the app expected.",
    CASHUP_STATEMENT_OVER: (amount: string) => `You have ${amount} more than expected. A sale or payment may not have been written down.`,
    CASHUP_STATEMENT_SHORT_LARGE: (amount: string) => `You are ${amount} short. Check stock bought, an expense paid, or credit given that was not recorded.`,
    CASHUP_STATEMENT_SHORT_SMALL: (amount: string) => `You are ${amount} short. This is often change given or a small expense not written down.`,
    FORMAT_WHEN: (ts: number) => new Date(ts).toLocaleString('en-ZA', { dateStyle: 'medium', timeStyle: 'short' }),

    // Shared app, product, and activity UI
    APP_TAGLINE: "Know your profit",
    STARTING_APP: "Starting ShopTrack...",
    HOW_TITLE: "📊 How it works",
    HOW_STEP_1: "Add your products (name + prices)",
    HOW_STEP_2: "Count your stock today",
    HOW_STEP_3: "Count again in a few days",
    HOW_STEP_4: "See your profit here! ⬇️",
    HOW_NOTE: "Count what's left and ShopTrack works out what sold and what you made.",
    YOUR_PROFIT: "Your Profit",
    PROFIT_EXPLAINER: "Based on stock sold since your last count",
    PRODUCTS_LABEL: "Products",
    ITEMS_IN_STOCK: "Items in Stock",
    COUNT_STOCK: "Count Stock",
    COUNT_TO_PROFIT: "Count now to refresh your profit",
    COUNT_BASELINE: "First count = your starting point",
    ADD_STOCK: "Add Stock",
    WHEN_YOU_BUY: "When you buy",
    ADD_OR_EDIT: "Add or edit",
    RECENT_ACTIVITY: "Recent Activity",
    THIS_WEEK: "This Week",
    RUNNING_LOW: "⚠️ Running Low",
    STOCK_LEFT: (name: string, qty: number) => `${name}: ${qty} left`,
    WELCOME_TITLE: "👋 Welcome to ShopTrack!",
    WELCOME_TEXT: "Add what you sell. We'll show you how much you make.",
    WELCOME_HOW: "Start with three products. Count what's left regularly and ShopTrack works out what sold.",
    ADD_FIRST_PRODUCT: "Add Your First Product",
    YOUR_DATA: "Your Data",
    SAVE_DATA: "Save a copy of your shop data",
    SAVE_DATA_HINT: "Keep it safe on WhatsApp or Google Drive",
    RESTORE_DATA: "Restore from backup",
    RESTORE_DATA_HINT: "Get all your data back on a new phone",
    BACKUP_DIALOG_TITLE: "Save your ShopTrack backup",
    RESTORE_ACTION: "Restore",
    BACK: "← Back",
    CANCEL: "Cancel",
    ADD: "+ Add",
    SEARCH_PRODUCTS: "Search products...",
    NO_PRODUCTS: "No products yet",
    ADD_PRODUCT: "Add Product",
    READY_TO_TRACK: "You're ready to track",
    READY_TO_TRACK_HINT: "Add another product, or start counting when you're ready.",
    START_COUNTING: "Start counting",
    ADD_PRODUCTS_FIRST: "Add products first",
    NO_PRODUCT_MATCH: (query: string) => `No products match "${query}"`,
    PRODUCT_META: (qty: number, unit: string, sell: number | null, buy: number | null) =>
      `${qty} ${unit}${sell != null ? ` • Sell: R${sell}` : ''}${buy != null ? ` • Buy: R${buy}` : ''}`,
    CREDIT_HOME_STATUS: (owing: number, overdue: number, stale: number) =>
      `${owing === 1 ? '1 person' : `${owing} people`}${overdue > 0 ? ` · ${overdue} late` : stale > 0 ? ` · ${stale} not paid in a while` : ''}`,
    WHAT_DO_YOU_SELL: "What do you sell?",
    PRODUCT_EXAMPLE: "e.g., Coca-Cola 500ml",
    SELL_PRICE_OPTIONAL: "Customer pays (optional)",
    BUY_PRICE_OPTIONAL: "You pay (optional)",
    CUSTOMER_PAYS: "What you charge customers",
    YOU_PAY: "What you pay for it",
    CURRENT_STOCK_OPTIONAL: "How many now? (optional)",
    HOW_MANY_NOW: "How many do you have right now?",
    SAVING: "Saving...",
    EDIT_PRODUCT: "Edit Product",
    SELL_PRICE: "Customer pays",
    BUY_PRICE: "You pay",
    CURRENT_STOCK: (qty: number, unit: string) => `Current stock: ${qty} ${unit}`,
    USE_COUNT_TO_UPDATE: "Use Count Stock to update quantity",
    SAVE_CHANGES: "Save Changes",
    DELETE_PRODUCT: "Delete Product",
    DELETE_PRODUCT_CONFIRM: (name: string) => `Delete "${name}"? Its history will be kept, but it will no longer appear in your lists.`,
    FIRST_COUNT_DONE: "First Count Done!",
    COUNT_SAVED: "Count Saved!",
    STARTING_STOCK_RECORDED: "You've recorded your starting stock.",
    GOT_IT: "Got it!",
    DONE: "Done",
    COUNT_PROGRESS: (done: number, total: number) => `${done} of ${total} counted`,
    NOT_COUNTED_YET: "Not counted yet",
    LAST_COUNT: (qty: number) => `Last: ${qty}`,
    ERROR_SAVE_PRODUCT: "Could not save product",
    ERROR_UPDATE_PRODUCT: "Could not update product",
    ERROR_DELETE_PRODUCT: "Could not delete product",
    ERROR_SAVE_COUNT: "Could not save count",
    SHARING_UNAVAILABLE: "Sharing is not available on this device",
    STOCK_ADDED: "Stock Added! ✓",
    STOCK_ADDED_HINT: (qty: number, unit: string, name: string) => `${qty} ${unit} of ${name} recorded.`,
    UNDO: "Undo",
    WHAT_DID_YOU_BUY: "What did you buy?",
    IN_STOCK: (qty: number, unit: string) => `${qty} ${unit} in stock`,
    CURRENTLY_IN_STOCK: (qty: number, unit: string) => `Currently: ${qty} ${unit}`,
    HOW_MANY_BOUGHT: "How many did you buy?",
    TOTAL_COST: "Total cost?",
    COST_MODE_TOTAL: "Total cost",
    COST_MODE_EACH: "Per item",
    COST_PER_ITEM: "Cost per item?",
    COST_EACH: (amount: string) => `= R${amount} each`,
    COST_TOTAL: (qty: number, each: string, total: string) => `${qty} × R${each} = R${total}`,
    SAVE_STOCK_IN: "Save Stock-In",
    ERROR_SAVE_STOCK: "Could not save stock",
    ERROR_UNDO_STOCK: "Could not undo stock-in",
    WEEKLY_SUMMARY: "Weekly Summary",
    TOP_SELLERS: "🏆 Top Sellers",
    SINCE_LAST_COUNT: "Since last count",
    PRODUCT_DETAILS: "Product Details",
    CURRENT_STOCK_ACTIVITY: "Current stock:",
    SOLD_SINCE_LAST: "Sold since last count:",
    PROFIT_LABEL: "Profit:",
    LAST_COUNTS: (counts: number[]) => `Last counts: ${counts.join(' → ')}`,
    NO_ACTIVITY: "No activity yet",

    // Language
    LANGUAGE_LABEL: "Language",
  },
  zu: {
    // Count screen
    COUNT_HEADER: "Unazo zingaki manje?",
    COUNT_HINT: "Bala okuseshelevini yakho",
    COUNT_REVIEW_TITLE: "Buyekeza ukubala kwakho",
    COUNT_REVIEW_HINT: "Hlola lezi zinombolo ngaphambi kokuthi zishintshe inzuzo yakho.",
    COUNT_FIRST_VALUE: (name: string, qty: number) => `${name}: ukubala kokuqala ${qty}`,
    COUNT_CHANGE_VALUE: (name: string, before: number, after: number) => `${name}: ${before} → ${after}`,
    COUNT_REVIEW_BUTTON: (count: number) => `Buyekeza okubaliwe ${count}`,
    COUNT_SAVE_BUTTON: "Gcina ukubala",
    COUNT_GO_BACK: "Buyela emuva",
    COUNT_UNDO: "Hlehlisa lokhu kubala",
    COUNT_UNDO_CONFIRM: "Lokhu kususa ukubala kokugcina bese kubuyisela amanani esitoko angaphambilini.",
    COUNT_UNDONE: "Ukubala kususiwe",
    COUNT_UNDONE_HINT: "Amanani esitoko sangaphambilini abuyile.",
    COUNT_UNDO_EXPIRED: "Lokhu kubala akusakwazi ukuhlehliswa.",
    COUNT_REMINDER_TITLE: "Isikhathi sokubala futhi",
    COUNT_REMINDER_HINT: "Sekuphele iviki. Bala okusele ukuze ubuyekeze inzuzo yakho.",
    FIRST_COUNT_HINT: "Lena yindawo yakho yokuqala — sizokqhathanisa nokubala okulandelayo.",
    
    // Results - Profit Explanation (Tier 3.1)
    SOLD_SINCE: (n: number) => `Uthengise izinto ezi-${n} kusukela ekubalweni kokugcina.`,
    PROFIT_MADE: (r: number) => `Wenze inzuzo ka-R${r}`,
    NO_CHANGE: "Akukho okuthengisiwe kusukela ekubalweni kokugcina.",
    STOCK_INCREASED: "Wengeze isitoko esiningi kunaleso osithengisile.",
    UNUSUAL_CHANGE: "Lolu shintsho lubukeka lungajwayelekile. Ungaphinda ubale.",
    
    // Weekly
    WEEKLY_HEADING: "Leli Viki",
    WEEKLY_YOU_MADE: "Wenzile:",
    WEEKLY_PROFIT: (r: number) => `Inzuzo ka-R${r}`,
    WEEKLY_TOP_PRODUCT: "Umkhiqizo ophezulu:",
    WEEKLY_COMPARED: "Uma kuqhathaniswa neviki elidlule:",
    WEEKLY_MORE: (r: number) => `↑ R${r} ngaphezulu`,
    WEEKLY_LESS: (r: number) => `↓ R${r} ngaphansi`,
    WEEKLY_FIRST_WEEK: "Leli yiviki lakho lokuqala lokulandelela.",
    WEEKLY_FIRST_WEEK_HINT: "Bala isitoko sakho izikhathi ezimbalwa futhi inzuzo yakho izovela lapha.",
    WEEKLY_NO_COUNTS: "Akukho kubala okwenziwe kuleli viki",
    WEEKLY_NO_COUNTS_HINT: "Bala isitoko sakho ukuze ubone inzuzo yaleli viki.",
    WEEKLY_KEEP_COUNTING: "Qhubeka ubala! Ngeviki elizayo uzobona ukuthi uqhathaniswa kanjani.",
    
    // Backup
    BACKUP_SAVED: "Kulondoloziwe!",
    BACKUP_HINT: "Idatha yakho iphephile. Gcina le fayela endaweni engeke ilahleke — njengo-WhatsApp noma i-Google Drive.",
    RESTORE_DONE: "Kwenziwe!",
    RESTORE_DONE_HINT: "Idatha yesitolo sakho ibuyile.",
    RESTORE_INVALID: "Akuyona ibhekhi ye-ShopTrack",
    RESTORE_INVALID_HINT: "Lokhu akubukeki njengebhekhi ye-ShopTrack. Zama enye ifayela.",
    RESTORE_OLD_VERSION: "Ibhekhi indala kakhulu",
    RESTORE_OLD_VERSION_HINT: "Le bhekhi yenziwe inguqulo endala ye-ShopTrack, ayikwazi ukuvulwa. Sebenzisa ibhekhi entsha.",
    RESTORE_CONFIRM: "Buyisela ibhekhi?",
    RESTORE_CONFIRM_HINT: "Lokhu kuzothatha indawo yayo yonke idatha yakho yamanje ngebhekhi. Uqinisekile?",
    
    // Errors
    ERROR_GENERIC: "Kukhona okungahambanga kahle",
    ERROR_TITLE: "Iphutha",
    ERROR_BACKUP: "Ayikwazanga ukwenza ibhekhi",
    ERROR_RESTORE: "Ayikwazanga ukubuyisela ibhekhi",
    DB_ERROR_TITLE: "Ayikwazi ukuvula idatha yesitolo sakho",
    DB_ERROR_HINT: "Idatha yakho isesekhona kule foni — i-ShopTrack ayikwazanga ukuyifunda. Zama futhi, noma uvale uhlelo bese uyaluvula kabusha.",
    DB_ERROR_RETRY: "Zama futhi",
    
    // Confidence Signals (Tier 3.2)
    BASED_ON_COUNTS: (n: number) => `Kusekelwe ekubalweni oku-${n}`,
    CONFIDENCE_EARLY: "Isilinganiso sokuqala",
    CONFIDENCE_CLEARER: "Kuyacaca",
    CONFIDENCE_RELIABLE: "Kuthembekile",
    MISSING_STOCKIN: "Le nzuzo ayifaki izinto ozithenge ongazibhalanga.",
    
    // Stock Value (Tier 3.3)
    STOCK_VALUE_LABEL: "Isitoko esisesandleni (ngezindleko)",
    STOCK_VALUE_HINT: "Kusekelwe ezentengisweni",
    STOCK_VALUE_MISSING_PRICES: "Eminye imikhiqizo ayinawo amanani okuthenga",
    
    // Restock Priority (Tier 4.1)
    RESTOCK_TITLE: "Okubalulekile ukugcwalisa",
    RESTOCK_HINT: "Kusekelwe ekuthengiseni kwakamuva nasezingeni lesitoko",
    RESTOCK_FAST_LOW: "kuthengisa ngokushesha, isitoko siphansi",
    RESTOCK_FAST: "kuthengisa ngokushesha",
    RESTOCK_PROFIT: "inzuzo ephezulu",
    
    // Money Tied Up (Tier 4.2)
    SLOW_STOCK_TITLE: "Imali eboshwe esitokweni esingasheshi",
    SLOW_STOCK_HINT: "Isitoko esingenakho ukuhamba kuleli viki",
    SLOW_STOCK_LABEL: "kuhamba kancane",
    
    // Silent Loss Detector (Tier 4.3)
    LOSS_TITLE: "Eminye imikhiqizo ilahlekelwa yinzuzo",
    LOSS_HINT: "Uthengisa ngaphansi kwentengo yokuthenga",
    
    // Owner Memory (Tier 4.4)
    OWNER_MEMORY_TITLE: "Kuleli viki uthengise kakhulu",

    // Credit book / izikweletu
    CREDIT_TITLE: "Incwadi Yezikweletu",
    CREDIT_HOME_BUTTON: "Izikweletu",
    CREDIT_HOME_HINT: "Abakukweletayo",
    CREDIT_EMPTY: "Akukho zikweletu okwamanje",
    CREDIT_EMPTY_HINT: "Uma umuntu ethatha impahla akhokhe kamuva, kubhale lapha ukuze ungakhohlwa.",
    CREDIT_ALL_PAID: "Wonke umuntu ukhokhile",
    CREDIT_ALL_PAID_HINT: "Akekho okukweletayo njengamanje.",
    CREDIT_OUTSTANDING_LABEL: "Okukweletwayo",
    CREDIT_WEEK_SUMMARY: (given: string, paid: string) => `Kuleli viki: ${given} onikeziwe, ${paid} okhokhiwe`,
    CREDIT_STALE_TITLE: "Abangakhokhanga isikhathi eside",
    CREDIT_STALE_HINT: "Laba bantu bangase badinge isikhumbuzo.",
    CREDIT_OVERDUE_TITLE: "Bathi bazobe sebekhokhile manje",
    CREDIT_OVERDUE_HINT: "Basho usuku futhi seludlulile.",
    CREDIT_ADD_CUSTOMER: "Engeza Umuntu",
    CREDIT_CUSTOMER_NAME: "Igama",
    CREDIT_CUSTOMER_PHONE: "Ucingo",
    CREDIT_PHONE_OPTIONAL: "Akuphoqelekile — shiya kungenalutho uma ungenalo.",
    CREDIT_TAKING_NOW: "Bathatha malini?",
    CREDIT_TAKING_HINT: "Shiya kungenalutho uma bengathathi lutho okwamanje.",
    CREDIT_WHEN_PAY: "Bazokhokha nini?",
    CREDIT_DUE_OPTION: (key: DueOptionKey) => ({
      friday: 'NgoLwesihlanu',
      end_of_month: 'Ekupheleni kwenyanga',
      two_weeks: 'Emavikini ama-2',
      unknown: 'Abashongo',
    })[key],
    CREDIT_GIVE: "Unikeze isikweletu",
    CREDIT_RECEIVE: "Ukhokhelwe",
    CREDIT_AMOUNT: "Malini?",
    CREDIT_NOTE: "Bathathe ini?",
    CREDIT_NOTE_HINT: "Isinkwa nobisi",
    CREDIT_SAVE: "Gcina",
    CREDIT_SAVING: "Iyagcina...",
    CREDIT_DAYS_QUIET: (days: number) => days === 0 ? "namuhla" : days === 1 ? "izolo" : `ezinsukwini ezingu-${days} ezedlule`,
    CREDIT_DUE_IN: (days: number) => days === 0 ? "Uthi uzokhokha namuhla" : days === 1 ? "Uthi uzokhokha kusasa" : `Uthi uzokhokha ezinsukwini ezingu-${days}`,
    CREDIT_OVERDUE_BY: (days: number) => days === 0 ? "bekufanele akhokhe namuhla" : days === 1 ? "usuku olu-1 emuva" : `izinsuku ezingu-${days} emuva`,
    CREDIT_PAID_UP: "Bazobe sebekhokhile ngokugcwele",
    CREDIT_PAID_UP_TAG: "Ukhokhile",
    CREDIT_OWES_YOU_CHANGE: "Ubakweleta ushintshi",
    CREDIT_CURRENT_OWES: (amount: string) => `Ukukweleta ${amount}`,
    CREDIT_CURRENT_CHANGE: (amount: string) => `Umkweleta ushintshi ongu-${amount}`,
    CREDIT_NOT_IN_HAND: (amount: string) => `${amount} kulokhu usakukweletwa.`,

    // Expenses
    EXPENSES_TITLE: "Izindleko",
    EXPENSES_HOME_BUTTON: "Izindleko",
    EXPENSES_HOME_HINT: "Okukhokhayo",
    EXPENSES_EMPTY: "Azikho izindleko okwamanje",
    EXPENSES_EMPTY_HINT: "Irenti, ugesi, ezokuthutha, amaholo. Kufake lapha ukuze inzuzo yakho ibe yiqiniso.",
    EXPENSES_MONTH_LABEL: "Okukhokhiwe kule nyanga",
    EXPENSES_ADD: "Engeza Indleko",
    EXPENSES_AMOUNT: "Malini?",
    EXPENSES_CATEGORY: "Bekungokwani?",
    EXPENSES_NOTE: "Inothi",
    EXPENSES_NOTE_HINT: "Itekisi eya ku-cash and carry",
    EXPENSES_SAVE: "Gcina",
    EXPENSES_SAVING: "Iyagcina...",
    EXPENSES_NOT_STOCK: "Ungafaki lapha isitoko osithengile — sebenzisa u-Engeza Isitoko, ngaphandle kwalokho kubalwa kabili.",
    EXPENSES_DELETE_CONFIRM: "Susa le ndleko?",
    EXPENSES_DELETE_CONFIRM_HINT: "Izokhishwa kwizibalo zakho.",
    EXPENSES_DELETE: "Susa",
    EXPENSES_CANCEL: "Khansela",
    CATEGORY_LABEL: (c: ExpenseCategory) => ({
      RENT: 'Irenti',
      ELECTRICITY: 'Ugesi',
      TRANSPORT: 'Ezokuthutha',
      WAGES: 'Amaholo',
      AIRTIME: 'I-airtime ne-data',
      OTHER: 'Okunye',
    })[c],

    // Net profit (gross - expenses)
    NET_FROM_SALES: "Kokuthengisiwe:",
    NET_EXPENSES: "Izindleko:",
    NET_KEPT: "Osele nakho:",
    NET_LOSS: "Okushodayo:",
    NET_NO_EXPENSES: "Azikho izindleko ezifakiwe, ngakho lokhu kungaphambi kwerenti nezinye izindleko.",

    // Cash up
    CASHUP_TITLE: "Bala Imali",
    CASHUP_HOME_BUTTON: "Bala Imali",
    CASHUP_HOME_HINT: "Bala imali yakho",

    // Sales book
    SALES_TITLE: "Incwadi Yokuthengisa",
    SALES_HOME_BUTTON: "Okuthengisiwe",
    SALES_HOME_HINT: "Okutholile",
    SALES_EMPTY: "Akukho okuthengisiwe okubhaliwe",
    SALES_EMPTY_HINT: "Ugcina incwadi yalokho okutholayo nsuku zonke? Kubhale lapha bese i-ShopTrack ibala ukuthi wenzeni — ngisho nangezinyanga ngaphambi kokuthola uhlelo.",
    SALES_TOTAL_LABEL: "Inzuzo kuze kube manje",
    SALES_TOTAL_HINT: (months: number, margin: string) =>
      `Ezinyangeni ezingu-${months}, ugcina cishe u-${margin}`,
    SALES_TODAY: "Okuthengisiwe namuhla",
    SALES_BACKFILL: "Engeza inyanga edlule",
    SALES_TOOK_TODAY: "Utholé malini namuhla?",
    SALES_DAYS_FILLED: (filled: number, total: number) => `Izinsuku ezingu-${filled} kwezingu-${total} ezigcwalisiwe`,
    SALES_FILL_HINT: "Gcwalisa izinsuku ozaziyo. Shiya ezinye zingenalutho. Faka u-0 ngosuku obuvaliwe ngalo.",
    SALES_MARGIN: "Ugcina malini kulokho?",
    SALES_MARGIN_HINT: "Kuwo wonke u-R100 owutholayo, malini engeyakho ngemva kokukhokhela isitoko? Izitolo eziningi zigcina u-R20–R30.",
    SALES_MARGIN_IS_YOURS: "Lesi yisilinganiso sakho, ngakho inzuzo nayo iyisilinganiso. Bala isitoko sakho ukuze uthole inani eliqondile.",
    SALES_WILL_KEEP: (amount: string) => `Ugcine cishe u-${amount}`,
    SALES_PICK_MONTH: "Iyiphi inyanga?",
    SALES_SAVE: "Gcina",
    SALES_SAVING: "Iyagcina...",
    SALES_CANCEL: "Khansela",
    SALES_MONTH_DAYS: (days: number) => `izinsuku ezingu-${days} ezibhaliwe`,
    SALES_MONTH_TOTAL: "inyanga yonke",
    SALES_CONFLICT: "Inyanga eyodwa ibhalwe kabili",
    SALES_CONFLICT_FIX: "thepha ukugcina okwansuku zonke",
    SALES_NOT_COUNTED_PROFIT: "Lokhu kuvela encwadini yakho. Ukubala isitoko kunikeza inzuzo yakho — kokubili kuphendula umbuzo ofanayo ngezindlela ezahlukene, ngakho ungakuhlanganisi.",
    CASHUP_FIRST_TITLE: "Imali Yokuqala",
    CASHUP_FIRST_HINT: "Lena yindawo yakho yokuqala. Ngokuzayo uma ubala imali, sizoqhathanisa nalokhu.",
    CASHUP_QUESTION: "Imalini esesikhwameni sakho?",
    CASHUP_HINT: "Yibale ngaphambi kokubheka noma yini enye.",
    CASHUP_SINCE: (when: string) => `Kusukela ekubaleni kwakho kokugcina: ${when}`,
    CASHUP_CHECK: "Hlola",
    CASHUP_CHECKING: "Iyagcina...",
    CASHUP_SAVE: "Gcina",
    CASHUP_TRAIL_TITLE: "Sikubale kanjani",
    CASHUP_LINE_OPENING: "Bekusesikhwameni",
    CASHUP_LINE_REVENUE: "Okuthengisiwe",
    CASHUP_LINE_CREDIT: "Okunikezwe ngesikweletu",
    CASHUP_LINE_PAYMENTS: "Izikweletu ozikhokhelwe",
    CASHUP_LINE_EXPENSES: "Izindleko ozikhokhile",
    CASHUP_LINE_STOCK: "Isitoko osithengile",
    CASHUP_EXPECTED: "Okufanele kube khona",
    CASHUP_COUNTED: "Obalile",
    CASHUP_BALANCED: "Imali yakho ilungile",
    CASHUP_SHORT: "Kukhona imali engekho",
    CASHUP_OVER: "Kukhona eyeqile",
    CASHUP_TAKE_OUT: "Ukhipha imali?",
    CASHUP_TAKE_OUT_HINT: "Uma ukhipha imali manje, yifake lapha ukuze ukubala kwakusasa kuqale kahle.",
    CASHUP_NO_COUNT_WARNING: "Awukabali isitoko kusukela ekubaleni kwakho kwemali kokugcina, ngakho inani 'lokuthengisiwe' liyisilinganiso. Bala isitoko sakho kuqala ukuze uthole impendulo eyiqiniso.",
    CASHUP_DONE: "Kwenziwe",
    CASHUP_HISTORY: "Ukubala kwemali kwakamuva",
    CASHUP_CANCEL: "Khansela",
    CASHUP_HOME_SHORTFALL: "bekungekho ekubaleni kwakho kokugcina. Thepha ukuze ubheke futhi.",
    CASHUP_FLOAT: "imali yokuqala",
    CASHUP_STATEMENT_BALANCED: "Imali yakho iyahambisana nalokho obekulindelwe uhlelo.",
    CASHUP_STATEMENT_OVER: (amount: string) => `Unemali engu-${amount} ngaphezu kokulindelwe. Ukuthengisa noma inkokhelo kungenzeka akubhalwanga.`,
    CASHUP_STATEMENT_SHORT_LARGE: (amount: string) => `Ushoda ngo-${amount}. Hlola isitoko esithengiwe, izindleko ezikhokhiwe, noma isikweletu esingabhalwanga.`,
    CASHUP_STATEMENT_SHORT_SMALL: (amount: string) => `Ushoda ngo-${amount}. Lokhu kuvame ukuba ushintshi noma izindleko ezincane ezingabhalwanga.`,
    FORMAT_WHEN: (ts: number) => new Date(ts).toLocaleString('zu-ZA', { dateStyle: 'medium', timeStyle: 'short' }),

    // Shared app, product, and activity UI
    APP_TAGLINE: "Yazi inzuzo yakho",
    STARTING_APP: "I-ShopTrack iyaqala...",
    HOW_TITLE: "📊 Isebenza kanjani",
    HOW_STEP_1: "Faka imikhiqizo yakho (igama + amanani)",
    HOW_STEP_2: "Bala isitoko sakho namuhla",
    HOW_STEP_3: "Phinda ubale ezinsukwini ezimbalwa",
    HOW_STEP_4: "Bona inzuzo yakho lapha! ⬇️",
    HOW_NOTE: "Bala okusele, i-ShopTrack ibale okuthengisiwe nenzuzo yakho.",
    YOUR_PROFIT: "Inzuzo Yakho",
    PROFIT_EXPLAINER: "Kusekelwe esitokweni esithengisiwe kusukela ekubalweni kokugcina",
    PRODUCTS_LABEL: "Imikhiqizo",
    ITEMS_IN_STOCK: "Izinto Esitokweni",
    COUNT_STOCK: "Bala Isitoko",
    COUNT_TO_PROFIT: "Bala manje ukuze ubuyekeze inzuzo",
    COUNT_BASELINE: "Ukubala kokuqala = indawo yokuqala",
    ADD_STOCK: "Faka Isitoko",
    WHEN_YOU_BUY: "Uma uthenga",
    ADD_OR_EDIT: "Faka noma lungisa",
    RECENT_ACTIVITY: "Okwakamuva",
    THIS_WEEK: "Leli Viki",
    RUNNING_LOW: "⚠️ Isitoko Siyaphela",
    STOCK_LEFT: (name: string, qty: number) => `${name}: kusele ${qty}`,
    WELCOME_TITLE: "👋 Siyakwamukela ku-ShopTrack!",
    WELCOME_TEXT: "Faka okuthengisayo. Sizokukhombisa ukuthi wenza malini.",
    WELCOME_HOW: "Qala ngemikhiqizo emithathu. Bala okusele njalo, i-ShopTrack ibale okuthengisiwe.",
    ADD_FIRST_PRODUCT: "Faka Umkhiqizo Wokuqala",
    YOUR_DATA: "Idatha Yakho",
    SAVE_DATA: "Gcina ikhophi yedatha yesitolo",
    SAVE_DATA_HINT: "Yigcine ku-WhatsApp noma ku-Google Drive",
    RESTORE_DATA: "Buyisela ngebhekhi",
    RESTORE_DATA_HINT: "Buyisa yonke idatha kufoni entsha",
    BACKUP_DIALOG_TITLE: "Gcina ibhekhi ye-ShopTrack",
    RESTORE_ACTION: "Buyisela",
    BACK: "← Emuva",
    CANCEL: "Khansela",
    ADD: "+ Faka",
    SEARCH_PRODUCTS: "Sesha imikhiqizo...",
    NO_PRODUCTS: "Ayikho imikhiqizo okwamanje",
    ADD_PRODUCT: "Faka Umkhiqizo",
    READY_TO_TRACK: "Usukulungele ukulandelela",
    READY_TO_TRACK_HINT: "Faka omunye umkhiqizo, noma uqale ukubala uma usukulungele.",
    START_COUNTING: "Qala ukubala",
    ADD_PRODUCTS_FIRST: "Faka imikhiqizo kuqala",
    NO_PRODUCT_MATCH: (query: string) => `Awukho umkhiqizo ofana no-"${query}"`,
    PRODUCT_META: (qty: number, unit: string, sell: number | null, buy: number | null) =>
      `${qty} ${unit}${sell != null ? ` • Thengisa: R${sell}` : ''}${buy != null ? ` • Thenga: R${buy}` : ''}`,
    CREDIT_HOME_STATUS: (owing: number, overdue: number, stale: number) =>
      `${owing} ${owing === 1 ? 'umuntu' : 'abantu'}${overdue > 0 ? ` · ${overdue} sekwephuzile` : stale > 0 ? ` · ${stale} abakhokhanga kudala` : ''}`,
    WHAT_DO_YOU_SELL: "Uthengisani?",
    PRODUCT_EXAMPLE: "isib. Coca-Cola 500ml",
    SELL_PRICE_OPTIONAL: "Ikhasimende likhokha (uyazikhethela)",
    BUY_PRICE_OPTIONAL: "Wena ukhokha (uyazikhethela)",
    CUSTOMER_PAYS: "Inani elikhokhwa ikhasimende",
    YOU_PAY: "Inani olikhokhayo",
    CURRENT_STOCK_OPTIONAL: "Zingaki manje? (uyazikhethela)",
    HOW_MANY_NOW: "Unazo zingaki manje?",
    SAVING: "Kuyagcinwa...",
    EDIT_PRODUCT: "Lungisa Umkhiqizo",
    SELL_PRICE: "Ikhasimende likhokha",
    BUY_PRICE: "Wena ukhokha",
    CURRENT_STOCK: (qty: number, unit: string) => `Isitoko samanje: ${qty} ${unit}`,
    USE_COUNT_TO_UPDATE: "Sebenzisa Bala Isitoko ukushintsha inani",
    SAVE_CHANGES: "Gcina Izinguquko",
    DELETE_PRODUCT: "Susa Umkhiqizo",
    DELETE_PRODUCT_CONFIRM: (name: string) => `Susa u-"${name}"? Umlando uzogcinwa kodwa ngeke usavela ohlwini.`,
    FIRST_COUNT_DONE: "Ukubala Kokuqala Kuqediwe!",
    COUNT_SAVED: "Ukubala Kugcinwe!",
    STARTING_STOCK_RECORDED: "Isitoko sokuqala sigciniwe.",
    GOT_IT: "Ngizwile!",
    DONE: "Kwenziwe",
    COUNT_PROGRESS: (done: number, total: number) => `Kubaliwe ${done} kokungu-${total}`,
    NOT_COUNTED_YET: "Akukabalwa",
    LAST_COUNT: (qty: number) => `Okokugcina: ${qty}`,
    ERROR_SAVE_PRODUCT: "Ayikwazanga ukugcina umkhiqizo",
    ERROR_UPDATE_PRODUCT: "Ayikwazanga ukulungisa umkhiqizo",
    ERROR_DELETE_PRODUCT: "Ayikwazanga ukususa umkhiqizo",
    ERROR_SAVE_COUNT: "Ayikwazanga ukugcina ukubala",
    SHARING_UNAVAILABLE: "Ukwabelana akutholakali kule divayisi",
    STOCK_ADDED: "Isitoko Sifakiwe! ✓",
    STOCK_ADDED_HINT: (qty: number, unit: string, name: string) => `${qty} ${unit} we-${name} kugciniwe.`,
    UNDO: "Hlehlisa",
    WHAT_DID_YOU_BUY: "Uthenge ini?",
    IN_STOCK: (qty: number, unit: string) => `${qty} ${unit} esitokweni`,
    CURRENTLY_IN_STOCK: (qty: number, unit: string) => `Manje: ${qty} ${unit}`,
    HOW_MANY_BOUGHT: "Uthenge ezingaki?",
    TOTAL_COST: "Kubize malini konke?",
    COST_MODE_TOTAL: "Inani lonke",
    COST_MODE_EACH: "Ngayinye",
    COST_PER_ITEM: "Kubiza malini ngakunye?",
    COST_EACH: (amount: string) => `= R${amount} ngakunye`,
    COST_TOTAL: (qty: number, each: string, total: string) => `${qty} × R${each} = R${total}`,
    SAVE_STOCK_IN: "Gcina Isitoko",
    ERROR_SAVE_STOCK: "Ayikwazanga ukugcina isitoko",
    ERROR_UNDO_STOCK: "Ayikwazanga ukuhlehlisa isitoko",
    WEEKLY_SUMMARY: "Isifinyezo Seviki",
    TOP_SELLERS: "🏆 Okuthengiswa Kakhulu",
    SINCE_LAST_COUNT: "Kusukela ekubalweni kokugcina",
    PRODUCT_DETAILS: "Imininingwane Yemikhiqizo",
    CURRENT_STOCK_ACTIVITY: "Isitoko samanje:",
    SOLD_SINCE_LAST: "Okuthengisiwe kusukela ekubalweni:",
    PROFIT_LABEL: "Inzuzo:",
    LAST_COUNTS: (counts: number[]) => `Ukubala kokugcina: ${counts.join(' → ')}`,
    NO_ACTIVITY: "Akukho okwenzekile okwamanje",

    // Language
    LANGUAGE_LABEL: "Ulimi",
  },
};

// Helper to get strings for current language
const t = (lang: Language) => STRINGS[lang];

// ============================================
// MAIN APP COMPONENT
// ============================================

// How far back to load movements beyond a reporting period. The engine needs
// prior history to establish an opening quantity for each product.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Tier 4.1: Restock priority item
interface RestockItem {
  name: string;
  reason: 'fast_low' | 'fast' | 'profit';
  score: number;
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastProfit, setLastProfit] = useState<number | null>(null);
  const [latestCountSessionId, setLatestCountSessionId] = useState<number | null>(null);
  const [latestCountAt, setLatestCountAt] = useState<number | null>(null);
  const [lang, setLang] = useState<Language>('en');
  const [restockPriority, setRestockPriority] = useState<RestockItem[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [credit, setCredit] = useState<CreditSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [lastCashUp, setLastCashUp] = useState<CashUp | null>(null);
  const [sales, setSales] = useState<SalesHistory | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const strings = t(lang);

  // Entrance for the profit figure. Only opacity and transform are animated:
  // animating height or width re-lays-out every frame and drops frames on the
  // mid-range phones this runs on. useNativeDriver keeps it off the JS thread,
  // so it stays smooth even while the database is still being read.
  const profitFade = useRef(new Animated.Value(0)).current;
  const profitRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (lastProfit === null) return;
    Animated.parallel([
      Animated.timing(profitFade, {
        toValue: 1,
        duration: motion.base,
        useNativeDriver: true,
      }),
      Animated.timing(profitRise, {
        toValue: 0,
        duration: motion.base,
        useNativeDriver: true,
      }),
    ]).start();
  }, [lastProfit, profitFade, profitRise]);

  // Open the database and load everything Home needs.
  //
  // Also the retry: openDatabase() drops its cached promise when an open fails,
  // so calling this again is a real second attempt rather than a replay of the
  // same error.
  // Toggle language
  const toggleLanguage = async () => {
    const newLang = lang === 'en' ? 'zu' : 'en';
    setLang(newLang);
    await AsyncStorage.setItem('shoptrack_language', newLang);
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

  const init = useCallback(async () => {
    setLoading(true);
    setDbError(null);
    try {
      // Load saved language
      const savedLang = await AsyncStorage.getItem('shoptrack_language');
      if (savedLang === 'zu' || savedLang === 'en') {
        setLang(savedLang);
      }

      db = await openDatabase();
      await initDatabase(db);
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
  }, [refreshProducts, refreshCredit, refreshExpenses, refreshCashUp, refreshSales]);

  useEffect(() => {
    init();
    // Deliberately once per mount, not on every init identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      const backup = await createBackup(db);
      
      // Create filename with date
      const date = new Date().toISOString().split('T')[0];
      const filename = `shoptrack-backup-${date}.json`;
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
        Alert.alert(strings.BACKUP_SAVED, strings.BACKUP_HINT);
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
        type: 'application/json',
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
        backup = normaliseBackup(JSON.parse(content));
      } catch {
        Alert.alert(strings.RESTORE_INVALID, strings.RESTORE_INVALID_HINT);
        return;
      }

      // Confirm restore
      Alert.alert(
        strings.RESTORE_CONFIRM,
        strings.RESTORE_CONFIRM_HINT,
        [
          { text: strings.CANCEL, style: 'cancel' },
          { 
            text: strings.RESTORE_ACTION,
            style: 'destructive',
            onPress: async () => {
              try {
                await restoreBackup(db, backup);
                await Promise.all([
                  refreshProducts(),
                  refreshCredit(),
                  refreshExpenses(),
                  refreshCashUp(),
                ]);
                
                Alert.alert(strings.RESTORE_DONE, strings.RESTORE_DONE_HINT);
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
        <ActivityIndicator size="large" color="#4CAF50" />
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
  // SCREEN: Home
  // ==========================================
  if (screen === 'home') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        
        {/* Header */}
        <View style={styles.homeHeader}>
          <Text style={styles.appName}>ShopTrack</Text>
          <Text style={styles.tagline}>{strings.APP_TAGLINE}</Text>
        </View>

        <ScrollView style={styles.homeContent}>
          {/* How it works - show when no profit yet */}
          {lastProfit === null && products.length > 0 && (
            <View style={styles.howItWorksCard}>
              <Text style={styles.howItWorksTitle}>{strings.HOW_TITLE}</Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>1.</Text> {strings.HOW_STEP_1}
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>2.</Text> {strings.HOW_STEP_2}
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>3.</Text> {strings.HOW_STEP_3}
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>4.</Text> {strings.HOW_STEP_4}
              </Text>
              <Text style={styles.howItWorksNote}>{strings.HOW_NOTE}</Text>
            </View>
          )}

          {/* Profit display (if available).
              The one animation in the app. This number is the answer the owner
              opened ShopTrack for, so it arrives rather than just being there.
              Nothing else animates -- a screen where everything moves has no
              emphasis left to give. */}
          {lastProfit !== null && (
            <Animated.View
              style={[
                styles.profitCard,
                { opacity: profitFade, transform: [{ translateY: profitRise }] },
              ]}
            >
              <Text style={styles.profitLabel}>{strings.YOUR_PROFIT}</Text>
              <Text style={styles.profitValue}>R{lastProfit.toFixed(0)}</Text>
              <Text style={styles.profitExplainer}>
                {strings.PROFIT_EXPLAINER}
              </Text>
              {/* Profit counts goods that left the shelf, including those taken
                  on credit. Say so here rather than let the owner assume the
                  cash is in the till. */}
              {credit && credit.total_outstanding > 0 && (
                <Text style={styles.profitOwedNote}>
                  {strings.CREDIT_NOT_IN_HAND(`R${credit.total_outstanding.toFixed(2)}`)}
                </Text>
              )}
            </Animated.View>
          )}

          {/* Quick stats */}
          {products.length > 0 && <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{products.length}</Text>
              <Text style={styles.statLabel}>{strings.PRODUCTS_LABEL}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {products.reduce((sum, p) => sum + p.current_qty, 0)}
              </Text>
              <Text style={styles.statLabel}>{strings.ITEMS_IN_STOCK}</Text>
            </View>
          </View>}

          {/* Tier 3.3: Stock Value */}
          {products.some(p => p.current_qty > 0 && p.buy_price) && (
            <View style={styles.stockValueCard}>
              <Text style={styles.stockValueLabel}>{strings.STOCK_VALUE_LABEL}</Text>
              <Text style={styles.stockValueAmount}>
                ~R{Math.round(products.reduce((sum, p) => {
                  if (p.current_qty > 0 && p.buy_price) {
                    return sum + (p.current_qty * p.buy_price);
                  }
                  return sum;
                }, 0))}
              </Text>
              <Text style={styles.stockValueHint}>{strings.STOCK_VALUE_HINT}</Text>
              {products.some(p => p.current_qty > 0 && !p.buy_price) && (
                <Text style={styles.stockValueMissing}>{strings.STOCK_VALUE_MISSING_PRICES}</Text>
              )}
            </View>
          )}

          {/* A till that came up short last time. Surfaced on Home because it
              is the one number an owner will not go looking for, and the one
              most worth acting on. Opening floats have nothing to reconcile. */}
          {lastCashUp && !lastCashUp.is_opening && lastCashUp.difference < -CASH_TOLERANCE && (
            <TouchableOpacity
              style={styles.shortfallCard}
              onPress={() => setScreen('cashup')}
            >
              <Text style={styles.shortfallLabel}>{strings.CASHUP_SHORT}</Text>
              <Text style={styles.shortfallAmount}>
                R{Math.abs(lastCashUp.difference).toFixed(2)}
              </Text>
              <Text style={styles.shortfallHint}>{strings.CASHUP_HOME_SHORTFALL}</Text>
            </TouchableOpacity>
          )}

          {/* The owner's own book. Shown next to counted profit, never added to
              it: both answer "did I make money?", so summing them counts the
              same trading twice. See src/core/sales.ts. */}
          {sales && summariseSalesBook(sales) && (
            <Pressable
              style={({ pressed }) => [styles.salesCard, pressed && styles.salesCardPressed]}
              android_ripple={{ color: color.ripple }}
              onPress={() => setScreen('sales')}
            >
              <Text style={styles.salesCardLabel}>{strings.SALES_TOTAL_LABEL}</Text>
              <Text style={styles.salesCardAmount}>R{sales.total_profit.toFixed(2)}</Text>
              <Text style={styles.salesCardHint}>
                {strings.SALES_TOTAL_HINT(
                  sales.months_recorded,
                  `${sales.average_margin_pct.toFixed(0)}%`
                )}
              </Text>
            </Pressable>
          )}

          {/* Credit book: what's out in the community */}
          {credit && summariseOutstanding(credit) && (
            <TouchableOpacity
              style={styles.creditCard}
              onPress={() => setScreen('credit')}
            >
              <Text style={styles.creditCardLabel}>{strings.CREDIT_OUTSTANDING_LABEL}</Text>
              <Text style={styles.creditCardAmount}>
                R{credit.total_outstanding.toFixed(2)}
              </Text>
              <Text style={styles.creditCardHint}>
                {strings.CREDIT_HOME_STATUS(
                  credit.customers_owing,
                  credit.customers_overdue,
                  credit.customers_stale
                )}
              </Text>
            </TouchableOpacity>
          )}

          {/* Tier 4.1: Restock Priority */}
          {restockPriority.length > 0 && (
            <View style={styles.restockPriorityCard}>
              <Text style={styles.restockPriorityTitle}>{strings.RESTOCK_TITLE}</Text>
              {restockPriority.map((item, index) => (
                <View key={item.name} style={styles.restockPriorityItem}>
                  <Text style={styles.restockPriorityNumber}>{index + 1}.</Text>
                  <Text style={styles.restockPriorityName}>{item.name}</Text>
                  <Text style={styles.restockPriorityReason}>
                    — {item.reason === 'fast_low' ? strings.RESTOCK_FAST_LOW : 
                       item.reason === 'fast' ? strings.RESTOCK_FAST : 
                       strings.RESTOCK_PROFIT}
                  </Text>
                </View>
              ))}
              <Text style={styles.restockPriorityHint}>{strings.RESTOCK_HINT}</Text>
            </View>
          )}

          {latestCountAt != null && Date.now() - latestCountAt >= 7 * 24 * 60 * 60 * 1000 && (
            <TouchableOpacity style={styles.countReminderCard} onPress={() => setScreen('count')}>
              <Text style={styles.countReminderTitle}>{strings.COUNT_REMINDER_TITLE}</Text>
              <Text style={styles.countReminderHint}>{strings.COUNT_REMINDER_HINT}</Text>
            </TouchableOpacity>
          )}

          {/* Main actions */}
          {products.length > 0 && <View style={styles.actionsContainer}>
            {/* Pressable, not TouchableOpacity: it gives a real Android ripple
                and a pressed state, so a tap feels acknowledged on a cheap
                phone where the screen itself lags. */}
            <Pressable
              style={({ pressed }) => [
                styles.primaryAction,
                pressed && styles.primaryActionPressed,
              ]}
              android_ripple={{ color: color.ripple }}
              onPress={() => setScreen('count')}
            >
              <Text style={styles.primaryActionIcon}>📦</Text>
              <Text style={styles.primaryActionText}>{strings.COUNT_STOCK}</Text>
              <Text style={styles.primaryActionSubtext}>
                {products.some(p => p.current_qty > 0) 
                  ? strings.COUNT_TO_PROFIT
                  : strings.COUNT_BASELINE
                }
              </Text>
            </Pressable>

            <View style={styles.secondaryActions}>
              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('stock_in')}
              >
                <Text style={styles.secondaryActionIcon}>➕</Text>
                <Text style={styles.secondaryActionText}>{strings.ADD_STOCK}</Text>
                <Text style={styles.secondaryActionHint}>{strings.WHEN_YOU_BUY}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('products')}
              >
                <Text style={styles.secondaryActionIcon}>📋</Text>
                <Text style={styles.secondaryActionText}>{strings.PRODUCTS_LABEL}</Text>
                <Text style={styles.secondaryActionHint}>{strings.ADD_OR_EDIT}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('credit')}
              >
                <Text style={styles.secondaryActionIcon}>📖</Text>
                <Text style={styles.secondaryActionText}>{strings.CREDIT_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.CREDIT_HOME_HINT}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('expenses')}
              >
                <Text style={styles.secondaryActionIcon}>🧾</Text>
                <Text style={styles.secondaryActionText}>{strings.EXPENSES_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.EXPENSES_HOME_HINT}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('cashup')}
              >
                <Text style={styles.secondaryActionIcon}>💰</Text>
                <Text style={styles.secondaryActionText}>{strings.CASHUP_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.CASHUP_HOME_HINT}</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
                android_ripple={{ color: color.ripple, borderless: false }}
                onPress={() => setScreen('sales')}
              >
                <Text style={styles.secondaryActionIcon}>📗</Text>
                <Text style={styles.secondaryActionText}>{strings.SALES_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.SALES_HOME_HINT}</Text>
              </Pressable>
            </View>
            
            {/* Activity buttons - only show if there's history */}
            {products.some(p => p.current_qty > 0) && (
              <View style={styles.insightButtons}>
                <TouchableOpacity
                  style={styles.insightButton}
                  onPress={() => setScreen('activity')}
                >
                  <Text style={styles.insightButtonIcon}>📊</Text>
                  <Text style={styles.insightButtonText}>{strings.RECENT_ACTIVITY}</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.insightButton}
                  onPress={() => setScreen('weekly')}
                >
                  <Text style={styles.insightButtonIcon}>📅</Text>
                  <Text style={styles.insightButtonText}>{strings.THIS_WEEK}</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>}

          {/* Low Stock Warning */}
          {products.filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5)).length > 0 && (
            <View style={styles.lowStockWarning}>
              <Text style={styles.lowStockTitle}>{strings.RUNNING_LOW}</Text>
              {products
                .filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5))
                .slice(0, 3)
                .map(p => (
                  <Text key={p.id} style={styles.lowStockItem}>
                    {strings.STOCK_LEFT(p.name, p.current_qty)}
                  </Text>
                ))
              }
            </View>
          )}

          {/* Empty state prompt */}
          {products.length === 0 && (
            <View style={styles.emptyPrompt}>
              <Text style={styles.emptyPromptTitle}>{strings.WELCOME_TITLE}</Text>
              <Text style={styles.emptyPromptText}>{strings.WELCOME_TEXT}</Text>
              <Text style={styles.emptyPromptHow}>{strings.WELCOME_HOW}</Text>
              <TouchableOpacity
                style={styles.emptyPromptButton}
                onPress={() => setScreen('add_product')}
              >
                <Text style={styles.emptyPromptButtonText}>
                  {strings.ADD_FIRST_PRODUCT}
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {latestCountSessionId != null && latestCountAt != null &&
            Date.now() - latestCountAt <= 60 * 60 * 1000 && (
            <TouchableOpacity style={styles.homeUndoButton} onPress={handleUndoLatestCount}>
              <Text style={styles.homeUndoText}>{strings.COUNT_UNDO}</Text>
            </TouchableOpacity>
          )}

          {/* Data Safety Section */}
          <View style={styles.dataSection}>
            <Text style={styles.dataSectionTitle}>{strings.YOUR_DATA}</Text>
            
            <TouchableOpacity
              style={styles.dataButton}
              onPress={handleBackup}
            >
              <Text style={styles.dataButtonIcon}>💾</Text>
              <View style={styles.dataButtonContent}>
                <Text style={styles.dataButtonText}>{strings.SAVE_DATA}</Text>
                <Text style={styles.dataButtonHint}>{strings.SAVE_DATA_HINT}</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dataButton}
              onPress={handleRestore}
            >
              <Text style={styles.dataButtonIcon}>📂</Text>
              <View style={styles.dataButtonContent}>
                <Text style={styles.dataButtonText}>{strings.RESTORE_DATA}</Text>
                <Text style={styles.dataButtonHint}>{strings.RESTORE_DATA_HINT}</Text>
              </View>
            </TouchableOpacity>
            
            {/* Language Toggle */}
            <TouchableOpacity
              style={styles.languageButton}
              onPress={toggleLanguage}
            >
              <Text style={styles.languageButtonIcon}>🌐</Text>
              <Text style={styles.languageButtonLabel}>{strings.LANGUAGE_LABEL}:</Text>
              <Text style={styles.languageButtonValue}>
                {lang === 'en' ? 'English' : 'isiZulu'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ==========================================
  // SCREEN: Products List
  // ==========================================
  if (screen === 'products') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={() => setScreen('home')}>
            <Text style={styles.backButton}>{strings.BACK}</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{strings.PRODUCTS_LABEL}</Text>
          <TouchableOpacity onPress={() => setScreen('add_product')}>
            <Text style={styles.addButton}>{strings.ADD}</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar - only show if there are products */}
        {products.length > 0 && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder={strings.SEARCH_PRODUCTS}
              placeholderTextColor="#999"
              value={productSearch}
              onChangeText={setProductSearch}
            />
            {productSearch.length > 0 && (
              <TouchableOpacity 
                style={styles.searchClear}
                onPress={() => setProductSearch('')}
              >
                <Text style={styles.searchClearText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {products.length > 0 && latestCountSessionId == null && (
          <View style={styles.readyCard}>
            <View style={styles.readyCardText}>
              <Text style={styles.readyCardTitle}>{strings.READY_TO_TRACK}</Text>
              <Text style={styles.readyCardHint}>{strings.READY_TO_TRACK_HINT}</Text>
            </View>
            <TouchableOpacity style={styles.readyCardButton} onPress={() => setScreen('count')}>
              <Text style={styles.readyCardButtonText}>{strings.START_COUNTING}</Text>
            </TouchableOpacity>
          </View>
        )}

        {products.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.NO_PRODUCTS}</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>{strings.ADD_PRODUCT}</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView style={styles.productList}>
            {products
              .filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase()))
              .map((product) => (
              <TouchableOpacity 
                key={product.id} 
                style={styles.productItem}
                onPress={() => {
                  setEditingProduct(product);
                  setScreen('edit_product');
                }}
              >
                <View style={styles.productItemContent}>
                  <Text style={styles.productName}>{product.name}</Text>
                  <Text style={styles.productMeta}>
                    {strings.PRODUCT_META(
                      product.current_qty,
                      product.unit_label,
                      product.sell_price,
                      product.buy_price
                    )}
                  </Text>
                </View>
                <Text style={styles.productEditHint}>›</Text>
              </TouchableOpacity>
            ))}
            {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
              <Text style={styles.noSearchResults}>{strings.NO_PRODUCT_MATCH(productSearch)}</Text>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    );
  }

  // ==========================================
  // SCREEN: Credit Book
  // ==========================================
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

  // ==========================================
  // SCREEN: Expenses
  // ==========================================
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

  // ==========================================
  // SCREEN: Cash Up
  // ==========================================
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

  // ==========================================
  // SCREEN: Cash Up
  // ==========================================
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

  // ==========================================
  // SCREEN: Add Product
  // ==========================================
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

  // ==========================================
  // SCREEN: Edit Product
  // ==========================================
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

  // ==========================================
  // SCREEN: Count Stock
  // ==========================================
  if (screen === 'count') {
    if (products.length === 0) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar style="dark" />
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.backButton}>{strings.BACK}</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>{strings.COUNT_STOCK}</Text>
            <View style={{ width: 50 }} />
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.ADD_PRODUCTS_FIRST}</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
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

  // ==========================================
  // SCREEN: Add Stock (Stock-In)
  // ==========================================
  if (screen === 'stock_in') {
    if (products.length === 0) {
      return (
        <SafeAreaView style={styles.container}>
          <StatusBar style="dark" />
          <View style={styles.screenHeader}>
            <TouchableOpacity onPress={() => setScreen('home')}>
              <Text style={styles.backButton}>{strings.BACK}</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>{strings.ADD_STOCK}</Text>
            <View style={{ width: 50 }} />
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.ADD_PRODUCTS_FIRST}</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
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

  // ==========================================
  // SCREEN: Recent Activity
  // ==========================================
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

  // ==========================================
  // SCREEN: Weekly Summary
  // ==========================================
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

// ============================================
// ADD PRODUCT SCREEN COMPONENT
// ============================================

function AddProductScreen({ 
  db,
  strings,
  onSave, 
  onCancel 
}: { 
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onSave: () => void; 
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      const qty = quantity ? parseInt(quantity, 10) : 0;
      await addProduct(db, {
        name,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        buyPrice: buyPrice ? parseFloat(buyPrice) : null,
        quantity: qty,
      });

      onSave();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_PRODUCT);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.ADD_PRODUCT}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <Text style={styles.inputLabel}>{strings.SELL_PRICE_OPTIONAL}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={sellPrice}
            onChangeText={setSellPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.CUSTOMER_PAYS}</Text>

        <Text style={styles.inputLabel}>{strings.BUY_PRICE_OPTIONAL}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={buyPrice}
            onChangeText={setBuyPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.YOU_PAY}</Text>

        <Text style={styles.inputLabel}>{strings.CURRENT_STOCK_OPTIONAL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Text style={styles.inputHint}>{strings.HOW_MANY_NOW}</Text>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.ADD_PRODUCT}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// EDIT PRODUCT SCREEN COMPONENT
// ============================================

function EditProductScreen({ 
  db,
  strings,
  product,
  onSave, 
  onDelete,
  onCancel 
}: { 
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  product: Product;
  onSave: () => void; 
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [sellPrice, setSellPrice] = useState(product.sell_price?.toString() || '');
  const [buyPrice, setBuyPrice] = useState(product.buy_price?.toString() || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    
    setSaving(true);
    try {
      await updateProduct(db, product.id, {
        name,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      });
      
      onSave();
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_UPDATE_PRODUCT);
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      strings.DELETE_PRODUCT,
      strings.DELETE_PRODUCT_CONFIRM(product.name),
      [
        { text: strings.CANCEL, style: 'cancel' },
        { 
          text: strings.DELETE_PRODUCT,
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete - set is_active to 0
              await deactivateProduct(db, product.id);
              onDelete();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(strings.ERROR_TITLE, strings.ERROR_DELETE_PRODUCT);
            }
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.EDIT_PRODUCT}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>{strings.SELL_PRICE}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={sellPrice}
            onChangeText={setSellPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.CUSTOMER_PAYS}</Text>

        <Text style={styles.inputLabel}>{strings.BUY_PRICE}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={buyPrice}
            onChangeText={setBuyPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.YOU_PAY}</Text>

        <View style={styles.editProductInfo}>
          <Text style={styles.editProductInfoText}>
            {strings.CURRENT_STOCK(product.current_qty, product.unit_label)}
          </Text>
          <Text style={styles.editProductInfoHint}>
            {strings.USE_COUNT_TO_UPDATE}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_CHANGES}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>{strings.DELETE_PRODUCT}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// COUNT SCREEN COMPONENT
// ============================================

function CountScreen({ 
  products, 
  db,
  strings,
  onComplete,
  onUndo,
  onCancel 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onComplete: (profit: number | null) => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'counting' | 'review' | 'results'>('counting');
  const [saving, setSaving] = useState(false);
  const [profit, setProfit] = useState(0);
  const [savedSessionId, setSavedSessionId] = useState<number | null>(null);
  const [previouslyCounted, setPreviouslyCounted] = useState<Set<number>>(new Set());

  const countedCount = Object.entries(counts).filter(([_, v]) => v !== '').length;
  const countedEntries = products.flatMap(product => {
    const value = counts[product.id];
    if (value == null || value === '') return [];
    return [{ product, quantity: Number(value) }];
  });
  const isFirstCount = countedEntries.length > 0 &&
    countedEntries.every(entry => !previouslyCounted.has(entry.product.id));
  
  // Calculate what changed for the results screen (Tier 3.1)
  const [totalSold, setTotalSold] = useState(0);
  const [stockIncreased, setStockIncreased] = useState(false);
  const [unusualChange, setUnusualChange] = useState(false);
  
  // Tier 3.2: Confidence tracking
  const [totalCountSessions, setTotalCountSessions] = useState(0);
  const [hasAnyStockIns, setHasAnyStockIns] = useState(false);

  // Threshold for unusual change warning
  const UNUSUAL_THRESHOLD = 50;
  
  // Tier 3.2: Load confidence data on mount
  useEffect(() => {
    const loadConfidenceData = async () => {
      try {
        const countResult = await db.getAllAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM count_sessions WHERE completed_at IS NOT NULL'
        );
        setTotalCountSessions(countResult[0]?.count || 0);
        
        const stockInResult = await db.getAllAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM stock_movements WHERE type = \'STOCK_IN\''
        );
        setHasAnyStockIns((stockInResult[0]?.count || 0) > 0);
        setPreviouslyCounted(new Set(await loadPreviouslyCountedProductIds(db)));
      } catch (error) {
        console.error('Load confidence data error:', error);
      }
    };
    loadConfidenceData();
  }, [db]);

  const handleSave = async () => {
    if (countedEntries.length === 0) return;
    setSaving(true);

    try {
      const now = Date.now();
      let didStockIncrease = false;
      let hasUnusualChange = false;

      for (const entry of countedEntries) {
        const change = entry.product.current_qty - entry.quantity;

        // Track if stock went up (restock without using Stock-In)
        if (change < 0) {
          didStockIncrease = true;
        }

        // Track unusual changes (Tier 3.1)
        if (previouslyCounted.has(entry.product.id) && Math.abs(change) > UNUSUAL_THRESHOLD) {
          hasUnusualChange = true;
        }
      }

      const saved = await saveCountSession(db, countedEntries, products.length, now);
      setSavedSessionId(saved.sessionId);

      // Profit since the previous count, per the engine.
      const movements = await loadMovements(db);
      const previousCountAt = movements
        .filter(m => m.type === 'COUNT' && m.recorded_at < now)
        .reduce((latest, m) => Math.max(latest, m.recorded_at), 0);

      const summary = calculatePeriodSummary(
        countedEntries.map(entry => toCoreProduct(entry.product)),
        movements,
        previousCountAt > 0 ? previousCountAt + 1 : now,
        now
      );

      setProfit(summary.total_estimated_profit);
      setTotalSold(summary.total_units_sold);
      setStockIncreased(didStockIncrease);
      setUnusualChange(hasUnusualChange || summary.products_with_anomalies > 0);
      setTotalCountSessions(prev => prev + 1); // Tier 3.2: increment count
      setStep('results');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_COUNT);
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (savedSessionId == null) return;
    setSaving(true);
    try {
      const undone = await undoCountSession(db, savedSessionId);
      if (!undone) {
        Alert.alert(strings.COUNT_UNDO_EXPIRED);
        return;
      }
      Alert.alert(strings.COUNT_UNDONE, strings.COUNT_UNDONE_HINT);
      onUndo();
    } catch (error) {
      console.error('Undo count error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    } finally {
      setSaving(false);
    }
  };

  // Results screen
  if (step === 'results') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        
        <View style={styles.resultsContainer}>
          <Text style={styles.resultsIcon}>{isFirstCount ? '🎉' : '✓'}</Text>
          <Text style={styles.resultsTitle}>
            {isFirstCount ? strings.FIRST_COUNT_DONE : strings.COUNT_SAVED}
          </Text>
          
          {isFirstCount ? (
            <>
              <Text style={styles.resultsSubtitle}>
                {strings.STARTING_STOCK_RECORDED}
              </Text>
              <View style={styles.nextStepBox}>
                <Text style={styles.nextStepText}>
                  {strings.FIRST_COUNT_HINT}
                </Text>
              </View>
            </>
          ) : (
            <>
              {/* PROFIT CASE: Stock went down = sales */}
              {totalSold > 0 && (
                <>
                  <View style={styles.profitResultCard}>
                    <Text style={styles.profitResultLabel}>{strings.YOUR_PROFIT}</Text>
                    <Text style={styles.profitResultValue}>R{profit.toFixed(0)}</Text>
                    {/* Tier 3.2: Confidence signals */}
                    <Text style={styles.confidenceCount}>
                      {strings.BASED_ON_COUNTS(totalCountSessions)}
                    </Text>
                    <Text style={styles.confidenceLevel}>
                      {totalCountSessions >= 4 ? strings.CONFIDENCE_RELIABLE : 
                       totalCountSessions >= 2 ? strings.CONFIDENCE_CLEARER : 
                       strings.CONFIDENCE_EARLY}
                    </Text>
                  </View>
                  {/* Tier 3.1: Calm explanation */}
                  <Text style={styles.profitExplainerText}>
                    {strings.SOLD_SINCE(totalSold)}
                  </Text>
                  {/* Tier 3.2: Missing stock-in acknowledgement */}
                  {!hasAnyStockIns && (
                    <Text style={styles.missingDataHintSmall}>
                      {strings.MISSING_STOCKIN}
                    </Text>
                  )}
                </>
              )}
              
              {/* STOCK INCREASED CASE: Added more than sold (Tier 3.1) */}
              {totalSold === 0 && stockIncreased && (
                <Text style={styles.profitExplainerText}>
                  {strings.STOCK_INCREASED}
                </Text>
              )}
              
              {/* NO CHANGE CASE (Tier 3.1) */}
              {totalSold === 0 && !stockIncreased && (
                <Text style={styles.profitExplainerText}>
                  {strings.NO_CHANGE}
                </Text>
              )}
              
              {/* UNUSUAL CHANGE WARNING (Tier 3.1) */}
              {unusualChange && (
                <Text style={styles.unusualChangeText}>
                  {strings.UNUSUAL_CHANGE}
                </Text>
              )}
            </>
          )}
          
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => onComplete(isFirstCount ? null : profit)}
          >
            <Text style={styles.doneButtonText}>
              {isFirstCount ? strings.GOT_IT : strings.DONE}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.undoButton}
            onPress={handleUndo}
            disabled={saving}
          >
            <Text style={styles.undoButtonText}>{strings.COUNT_UNDO}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={() => setStep('counting')}>
            <Text style={styles.backButton}>{strings.COUNT_GO_BACK}</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{strings.COUNT_REVIEW_TITLE}</Text>
          <View style={{ width: 50 }} />
        </View>
        <Text style={styles.reviewHint}>{strings.COUNT_REVIEW_HINT}</Text>
        <ScrollView style={styles.countList}>
          {countedEntries.map(({ product, quantity }) => {
            const first = !previouslyCounted.has(product.id);
            const change = quantity - product.current_qty;
            return (
              <View key={product.id} style={styles.reviewItem}>
                <Text style={styles.reviewItemName}>{product.name}</Text>
                <Text style={styles.reviewItemValue}>
                  {first
                    ? strings.COUNT_FIRST_VALUE(product.name, quantity)
                    : strings.COUNT_CHANGE_VALUE(product.name, product.current_qty, quantity)}
                </Text>
                {!first && Math.abs(change) > UNUSUAL_THRESHOLD && (
                  <Text style={styles.reviewWarning}>{strings.UNUSUAL_CHANGE}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.countBottomBar}>
          <TouchableOpacity
            style={[styles.saveCountButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? strings.SAVING : strings.COUNT_SAVE_BUTTON}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Counting screen
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.COUNT_STOCK}</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.countInstructions}>
        <Text style={styles.countInstructionsTitle}>{strings.COUNT_HEADER}</Text>
        <Text style={styles.countInstructionsHint}>{strings.COUNT_HINT}</Text>
      </View>

      <Text style={styles.countProgress}>
        {strings.COUNT_PROGRESS(countedCount, products.length)}
      </Text>

      <ScrollView style={styles.countList}>
        {products.map((product) => (
          <View key={product.id} style={styles.countItem}>
            <View style={styles.countItemInfo}>
              <Text style={styles.countItemName}>{product.name}</Text>
              <Text style={styles.countItemPrev}>
                {previouslyCounted.has(product.id)
                  ? strings.LAST_COUNT(product.current_qty)
                  : strings.NOT_COUNTED_YET}
              </Text>
            </View>
            <TextInput
              style={styles.countInput}
              placeholder="0"
              placeholderTextColor="#CCCCCC"
              keyboardType="number-pad"
              value={counts[product.id] || ''}
              onChangeText={(val) => {
                setCounts(prev => ({ ...prev, [product.id]: val.replace(/[^0-9]/g, '') }));
              }}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.countBottomBar}>
        <TouchableOpacity
          style={[
            styles.saveCountButton,
            (countedCount === 0 || saving) && styles.saveButtonDisabled,
          ]}
          onPress={() => setStep('review')}
          disabled={countedCount === 0 || saving}
        >
          <Text style={styles.saveButtonText}>
            {strings.COUNT_REVIEW_BUTTON(countedCount)}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ============================================
// STOCK-IN SCREEN COMPONENT
// ============================================

function StockInScreen({ 
  products, 
  db,
  strings,
  onComplete, 
  onCancel 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [costMode, setCostMode] = useState<'total' | 'each'>('total');
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);

  const qty = parseInt(quantity) || 0;
  const enteredCost = parseFloat(cost) || 0;
  const totalCost = costMode === 'each' ? enteredCost * qty : enteredCost;
  const canSave = selectedProduct && qty > 0 && totalCost > 0;

  const handleSave = async () => {
    if (!selectedProduct || !canSave) return;
    
    setSaving(true);
    try {
      const movementId = await recordStockIn(db, selectedProduct, qty, totalCost);

      Alert.alert(
        strings.STOCK_ADDED,
        strings.STOCK_ADDED_HINT(qty, selectedProduct.unit_label, selectedProduct.name),
        [
          {
            text: strings.UNDO,
            style: 'destructive',
            onPress: async () => {
              try {
                await undoStockIn(db, movementId);
                onComplete();
              } catch (error) {
                console.error('Undo stock-in error:', error);
                Alert.alert(strings.ERROR_TITLE, strings.ERROR_UNDO_STOCK);
                setSaving(false);
              }
            },
          },
          { text: strings.DONE, onPress: onComplete },
        ]
      );
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_STOCK);
      setSaving(false);
    }
  };

  // Product selection
  if (!selectedProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        
        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.backButton}>{strings.CANCEL}</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{strings.ADD_STOCK}</Text>
          <View style={{ width: 50 }} />
        </View>

        <Text style={styles.sectionTitle}>{strings.WHAT_DID_YOU_BUY}</Text>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={strings.SEARCH_PRODUCTS}
            placeholderTextColor="#999"
            value={productSearch}
            onChangeText={setProductSearch}
          />
          {productSearch.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setProductSearch('')}>
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.productList}>
          {products
            .filter(product => product.name.toLowerCase().includes(productSearch.toLowerCase()))
            .map((product) => (
            <TouchableOpacity
              key={product.id}
              style={styles.productSelectItem}
              onPress={() => {
                setSelectedProduct(product);
                if (product.buy_price != null) {
                  setCostMode('each');
                  setCost(product.buy_price.toFixed(2));
                } else {
                  setCostMode('total');
                  setCost('');
                }
              }}
            >
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productMeta}>
                {strings.IN_STOCK(product.current_qty, product.unit_label)}
              </Text>
            </TouchableOpacity>
          ))}
          {products.filter(product =>
            product.name.toLowerCase().includes(productSearch.toLowerCase())
          ).length === 0 && (
            <Text style={styles.noSearchResults}>{strings.NO_PRODUCT_MATCH(productSearch)}</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Entry form
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={() => {
          setSelectedProduct(null);
          setQuantity('');
          setCost('');
        }}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.ADD_STOCK}</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.selectedProductBanner}>
        <Text style={styles.selectedProductName}>{selectedProduct.name}</Text>
        <Text style={styles.selectedProductMeta}>
          {strings.CURRENTLY_IN_STOCK(selectedProduct.current_qty, selectedProduct.unit_label)}
        </Text>
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.HOW_MANY_BOUGHT}</Text>
        <View style={styles.priceInputRow}>
          <TextInput
            style={styles.quantityInput}
            placeholder="0"
            placeholderTextColor="#999"
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
            autoFocus
          />
          <Text style={styles.unitSuffix}>{selectedProduct.unit_label}</Text>
        </View>

        <View style={styles.costModeRow}>
          <TouchableOpacity
            style={[styles.costModeButton, costMode === 'total' && styles.costModeButtonActive]}
            onPress={() => setCostMode('total')}
          >
            <Text style={[styles.costModeText, costMode === 'total' && styles.costModeTextActive]}>
              {strings.COST_MODE_TOTAL}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.costModeButton, costMode === 'each' && styles.costModeButtonActive]}
            onPress={() => setCostMode('each')}
          >
            <Text style={[styles.costModeText, costMode === 'each' && styles.costModeTextActive]}>
              {strings.COST_MODE_EACH}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>
          {costMode === 'each' ? strings.COST_PER_ITEM : strings.TOTAL_COST}
        </Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
          />
        </View>

        {qty > 0 && totalCost > 0 && (
          <Text style={styles.costSummary}>
            {costMode === 'each'
              ? strings.COST_TOTAL(qty, enteredCost.toFixed(2), totalCost.toFixed(2))
              : strings.COST_EACH((totalCost / qty).toFixed(2))}
          </Text>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!canSave || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_STOCK_IN}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// WEEKLY SUMMARY SCREEN COMPONENT
// ============================================

// Tier 4.2: Slow stock item
interface SlowStockItem {
  name: string;
  value: number;
}

// Tier 4.4: Sales breakdown item
interface SalesBreakdownItem {
  name: string;
  percentage: number;
}

interface WeeklySummary {
  totalProfit: number;      // Gross: revenue - cost of goods sold
  net: NetProfit;           // Gross minus expenses recorded this week
  topProduct: { name: string; profit: number } | null;
  lastWeekProfit: number | null;
  isFirstWeek: boolean;
  hasCountsThisWeek: boolean;
  countThisWeek: number;  // Tier 3.2: for confidence signal
  hasStockIns: boolean;   // Tier 3.2: for missing data acknowledgement
  slowStockValue: number; // Tier 4.2: total value of slow-moving stock
  slowStockItems: SlowStockItem[]; // Tier 4.2: top slow items
  salesBreakdown: SalesBreakdownItem[]; // Tier 4.4: what you mostly sold
}

function WeeklySummaryScreen({ 
  products, 
  db,
  strings,
  onBack 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeeklySummary();
  }, []);

  const loadWeeklySummary = async () => {
    try {
      const thisWeek = getPeriodBounds('this_week');
      const lastWeek = getPeriodBounds('last_week');

      // One read covers both weeks plus the history the engine needs to
      // establish opening quantities.
      const movements = await loadMovements(db, lastWeek.start - THIRTY_DAYS_MS);
      const coreProducts = products.map(toCoreProduct);

      const thisWeekSummary = calculatePeriodSummary(
        coreProducts,
        movements,
        thisWeek.start,
        thisWeek.end
      );

      const countsThisWeek = movements.filter(
        m => m.type === 'COUNT' && m.recorded_at >= thisWeek.start
      );
      const hasCountsThisWeek = countsThisWeek.length > 0;

      // Tier 3.2: how many distinct count sessions happened this week
      const countSessionsThisWeek = await db.getAllAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM count_sessions
         WHERE completed_at IS NOT NULL AND completed_at >= ?`,
        [thisWeek.start]
      );
      const countThisWeek = countSessionsThisWeek[0]?.count || 0;

      // Tier 3.2: Check if any stock-ins exist this week
      const hasStockIns = movements.some(
        m => m.type === 'STOCK_IN' && m.recorded_at >= thisWeek.start
      );

      // First week means no counts recorded before this week started
      const isFirstWeek = !movements.some(
        m => m.type === 'COUNT' && m.recorded_at < thisWeek.start
      );

      // Only products with both prices produce a profit we can stand behind.
      const priced = new Set(
        products.filter(p => p.buy_price != null && p.sell_price != null).map(p => p.id)
      );
      const sellingMetrics = thisWeekSummary.products.filter(
        m => priced.has(m.product_id) && m.estimated_sold > 0
      );

      const totalProfit = sellingMetrics.reduce((sum, m) => sum + m.estimated_profit, 0);

      const topProduct = sellingMetrics.length > 0
        ? sellingMetrics.reduce((best, m) => (m.estimated_profit > best.estimated_profit ? m : best))
        : null;

      // Last week, for the comparison line
      let lastWeekProfit: number | null = null;
      if (!isFirstWeek) {
        const lastWeekSummary = calculatePeriodSummary(
          coreProducts,
          movements,
          lastWeek.start,
          lastWeek.end
        );
        const lastWeekTotal = lastWeekSummary.products
          .filter(m => priced.has(m.product_id) && m.estimated_sold > 0)
          .reduce((sum, m) => sum + m.estimated_profit, 0);

        if (lastWeekTotal > 0) {
          lastWeekProfit = lastWeekTotal;
        }
      }

      const soldThisWeekById = new Map(
        sellingMetrics.map(m => [m.product_id, m])
      );

      // Net profit for the same window. Expenses are cash-basis: they land in
      // the week they were paid. A month's rent paid on Monday therefore hits
      // that week in full, which is what actually happened to the till.
      const weekExpenses = calculateExpenseSummary(
        await loadExpenses(db, thisWeek.start),
        thisWeek.start,
        thisWeek.end
      );
      const net = calculateNetProfit(totalProfit, weekExpenses.total);

      // Tier 4.2: Calculate slow-moving stock (money tied up)
      const slowStockItems: SlowStockItem[] = [];
      let slowStockValue = 0;
      const SLOW_STOCK_THRESHOLD = 100; // Only show items worth R100+
      
      for (const product of products) {
        // Skip products with no stock or no buy price
        if (product.current_qty <= 0 || !product.buy_price) continue;
        
        const stockValue = product.current_qty * product.buy_price;
        if (stockValue < SLOW_STOCK_THRESHOLD) continue;
        
        // Check if this product sold anything this week
        const soldThisWeek = soldThisWeekById.get(product.id);

        if (!soldThisWeek) {
          // This product didn't sell this week
          slowStockValue += stockValue;
          slowStockItems.push({
            name: product.name,
            value: Math.round(stockValue),
          });
        }
      }
      
      // Sort by value and take top 3
      slowStockItems.sort((a, b) => b.value - a.value);
      const topSlowItems = slowStockItems.slice(0, 3);
      
      // Tier 4.4: Calculate sales breakdown (what you mostly sold)
      const salesBreakdown: SalesBreakdownItem[] = [];
      const productSales = sellingMetrics.map(m => ({
        name: m.product_name,
        units: m.estimated_sold,
      }));
      const totalUnitsSold = productSales.reduce((sum, s) => sum + s.units, 0);

      // Calculate percentages and take top 3
      if (totalUnitsSold > 0) {
        productSales.sort((a, b) => b.units - a.units);
        productSales.slice(0, 3).forEach(item => {
          salesBreakdown.push({
            name: item.name,
            percentage: Math.round((item.units / totalUnitsSold) * 100),
          });
        });
      }

      setSummary({
        totalProfit,
        net,
        topProduct: topProduct
          ? { name: topProduct.product_name, profit: topProduct.estimated_profit }
          : null,
        lastWeekProfit,
        isFirstWeek,
        hasCountsThisWeek,
        countThisWeek,
        hasStockIns,
        slowStockValue: Math.round(slowStockValue),
        slowStockItems: topSlowItems,
        salesBreakdown,
      });
      
    } catch (error) {
      console.error('Load weekly summary error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  // Render based on state
  const renderContent = () => {
    if (!summary) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyNoData}>{strings.ERROR_GENERIC}</Text>
        </View>
      );
    }

    // First week, no baseline yet
    if (summary.isFirstWeek && !summary.hasCountsThisWeek) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyFirstWeek}>
              {strings.WEEKLY_FIRST_WEEK}
            </Text>
            <Text style={styles.weeklyFirstWeekHint}>
              {strings.WEEKLY_FIRST_WEEK_HINT}
            </Text>
          </View>
        </View>
      );
    }

    // No counts this week
    if (!summary.hasCountsThisWeek) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyNoData}>{strings.WEEKLY_NO_COUNTS}</Text>
            <Text style={styles.weeklyNoDataHint}>
              {strings.WEEKLY_NO_COUNTS_HINT}
            </Text>
          </View>
        </View>
      );
    }

    // Calculate comparison
    const comparison = summary.lastWeekProfit !== null 
      ? summary.totalProfit - summary.lastWeekProfit 
      : null;

    // Tier 3.2: Determine confidence level
    const getConfidenceLabel = () => {
      if (summary.countThisWeek >= 4) return strings.CONFIDENCE_RELIABLE;
      if (summary.countThisWeek >= 2) return strings.CONFIDENCE_CLEARER;
      return strings.CONFIDENCE_EARLY;
    };

    return (
      <View style={styles.weeklyContent}>
        <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>
        
        {/* Main profit */}
        <View style={styles.weeklyCard}>
          <Text style={styles.weeklyLabel}>{strings.WEEKLY_YOU_MADE}</Text>
          <Text style={styles.weeklyProfit}>{strings.WEEKLY_PROFIT(Math.round(summary.totalProfit))}</Text>
          
          {/* Tier 3.2: Confidence signals */}
          <Text style={styles.confidenceCount}>
            {strings.BASED_ON_COUNTS(summary.countThisWeek)}
          </Text>
          <Text style={styles.confidenceLevel}>
            {getConfidenceLabel()}
          </Text>
        </View>

        {/* Net profit: what the sales figure leaves once costs are paid.
            Shown only once expenses exist, otherwise it would just repeat the
            gross number and imply the owner keeps all of it. */}
        {summary.net.has_expense_data ? (
          <View style={styles.netCard}>
            <View style={styles.netRow}>
              <Text style={styles.netRowLabel}>{strings.NET_FROM_SALES}</Text>
              <Text style={styles.netRowValue}>R{summary.net.gross_profit.toFixed(2)}</Text>
            </View>
            <View style={styles.netRow}>
              <Text style={styles.netRowLabel}>{strings.NET_EXPENSES}</Text>
              <Text style={styles.netRowCost}>−R{summary.net.expenses.toFixed(2)}</Text>
            </View>
            <View style={styles.netDivider} />
            <View style={styles.netRow}>
              <Text style={styles.netKeptLabel}>
                {summary.net.is_loss ? strings.NET_LOSS : strings.NET_KEPT}
              </Text>
              <Text style={[styles.netKeptValue, summary.net.is_loss && styles.netKeptLoss]}>
                R{Math.abs(summary.net.net_profit).toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.netNoExpenses}>{strings.NET_NO_EXPENSES}</Text>
        )}

        {/* Top product */}
        {summary.topProduct && (
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyLabel}>{strings.WEEKLY_TOP_PRODUCT}</Text>
            <Text style={styles.weeklyTopProduct}>
              {summary.topProduct.name} (R{summary.topProduct.profit.toFixed(0)})
            </Text>
          </View>
        )}

        {/* Comparison to last week */}
        {comparison !== null && (
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyLabel}>{strings.WEEKLY_COMPARED}</Text>
            <Text style={[
              styles.weeklyComparison,
              comparison >= 0 ? styles.weeklyComparisonUp : styles.weeklyComparisonDown
            ]}>
              {comparison >= 0 ? strings.WEEKLY_MORE(Math.abs(Math.round(comparison))) : strings.WEEKLY_LESS(Math.abs(Math.round(comparison)))}
            </Text>
          </View>
        )}

        {/* First week with data */}
        {summary.isFirstWeek && summary.hasCountsThisWeek && (
          <View style={styles.weeklyHintCard}>
            <Text style={styles.weeklyHint}>
              {strings.WEEKLY_KEEP_COUNTING}
            </Text>
          </View>
        )}

        {/* Tier 4.2: Money Tied Up in Slow Stock */}
        {summary.slowStockValue > 0 && summary.slowStockItems.length > 0 && (
          <View style={styles.slowStockCard}>
            <Text style={styles.slowStockTitle}>{strings.SLOW_STOCK_TITLE}</Text>
            <Text style={styles.slowStockValue}>~R{summary.slowStockValue}</Text>
            <View style={styles.slowStockList}>
              {summary.slowStockItems.map((item) => (
                <Text key={item.name} style={styles.slowStockItem}>
                  • {item.name} — R{item.value} ({strings.SLOW_STOCK_LABEL})
                </Text>
              ))}
            </View>
            <Text style={styles.slowStockHint}>{strings.SLOW_STOCK_HINT}</Text>
          </View>
        )}

        {/* Tier 4.4: Owner Memory - What you mostly sold */}
        {summary.salesBreakdown.length > 0 && (
          <View style={styles.ownerMemoryCard}>
            <Text style={styles.ownerMemoryTitle}>{strings.OWNER_MEMORY_TITLE}</Text>
            {summary.salesBreakdown.map((item) => (
              <Text key={item.name} style={styles.ownerMemoryItem}>
                • {item.name} ({item.percentage}%)
              </Text>
            ))}
          </View>
        )}

        {/* Tier 3.2: Missing data acknowledgement */}
        {!summary.hasStockIns && (
          <View style={styles.weeklyHintCard}>
            <Text style={styles.missingDataHint}>
              {strings.MISSING_STOCKIN}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.WEEKLY_SUMMARY}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.weeklyScroll}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// ACTIVITY SCREEN COMPONENT (HISTORY)
// ============================================

interface ActivityItem {
  product_id: number;
  product_name: string;
  last_counts: number[];
  sold_since_last: number;
  profit_since_last: number;
  current_qty: number;
  sell_price: number | null;
  buy_price: number | null;
}

// Tier 4.3: Loss item
interface LossItem {
  name: string;
  buyPrice: number;
  sellPrice: number;
}

function ActivityScreen({ 
  products, 
  db,
  strings,
  onBack 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onBack: () => void;
}) {
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [topSellers, setTopSellers] = useState<ActivityItem[]>([]);
  const [lossItems, setLossItems] = useState<LossItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadActivity();
  }, []);

  const loadActivity = async () => {
    try {
      const activityData: ActivityItem[] = [];
      const movements = await loadMovements(db);

      for (const product of products) {
        // Get last 3 counts for this product
        const counts = await db.getAllAsync<{ quantity: number; recorded_at: number }>(
          `SELECT quantity, recorded_at FROM stock_movements
           WHERE product_id = ? AND type = 'COUNT'
           ORDER BY recorded_at DESC LIMIT 3`,
          [product.id]
        );

        const lastCounts = counts.map(c => c.quantity);

        // Calculate sold since last count
        let soldSinceLast = 0;
        let profitSinceLast = 0;

        // Measure between the two most recent counts. Going through the engine
        // means stock-ins landing between them are accounted for, instead of
        // reading as negative sales.
        if (counts.length >= 2) {
          const metrics = calculateProductMetrics(
            toCoreProduct(product),
            movements,
            counts[1].recorded_at + 1,
            counts[0].recorded_at
          );
          soldSinceLast = metrics.estimated_sold;
          if (product.sell_price != null && product.buy_price != null && soldSinceLast > 0) {
            profitSinceLast = metrics.estimated_profit;
          }
        }

        activityData.push({
          product_id: product.id,
          product_name: product.name,
          last_counts: lastCounts,
          sold_since_last: soldSinceLast,
          profit_since_last: profitSinceLast,
          current_qty: product.current_qty,
          sell_price: product.sell_price,
          buy_price: product.buy_price,
        });
      }
      
      setActivity(activityData);
      
      // Top 3 sellers by profit
      const sorted = [...activityData]
        .filter(a => a.profit_since_last > 0)
        .sort((a, b) => b.profit_since_last - a.profit_since_last)
        .slice(0, 3);
      setTopSellers(sorted);
      
      // Tier 4.3: Detect products selling at a loss
      const losses: LossItem[] = [];
      for (const product of products) {
        if (product.buy_price && product.sell_price && product.sell_price < product.buy_price) {
          losses.push({
            name: product.name,
            buyPrice: product.buy_price,
            sellPrice: product.sell_price,
          });
        }
      }
      setLossItems(losses.slice(0, 3)); // Show max 3
      
    } catch (error) {
      console.error('Load activity error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.RECENT_ACTIVITY}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.activityContent}>
        {/* Tier 4.3: Silent Loss Detector */}
        {lossItems.length > 0 && (
          <View style={styles.lossCard}>
            <Text style={styles.lossTitle}>{strings.LOSS_TITLE}</Text>
            {lossItems.map((item) => (
              <Text key={item.name} style={styles.lossItem}>
                • {item.name} — bought at R{item.buyPrice}, sold at R{item.sellPrice}
              </Text>
            ))}
            <Text style={styles.lossHint}>{strings.LOSS_HINT}</Text>
          </View>
        )}

        {/* Top Sellers Card */}
        {topSellers.length > 0 && (
          <View style={styles.topSellersCard}>
            <Text style={styles.topSellersTitle}>{strings.TOP_SELLERS}</Text>
            <Text style={styles.topSellersSubtitle}>{strings.SINCE_LAST_COUNT}</Text>
            {topSellers.map((item, index) => (
              <View key={item.product_id} style={styles.topSellerRow}>
                <Text style={styles.topSellerRank}>{index + 1}.</Text>
                <Text style={styles.topSellerName}>{item.product_name}</Text>
                <Text style={styles.topSellerProfit}>R{item.profit_since_last.toFixed(0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity by product */}
        <Text style={styles.activitySectionTitle}>{strings.PRODUCT_DETAILS}</Text>
        
        {activity.map((item) => (
          <View key={item.product_id} style={styles.activityCard}>
            <Text style={styles.activityProductName}>{item.product_name}</Text>
            
            <View style={styles.activityRow}>
              <Text style={styles.activityLabel}>{strings.CURRENT_STOCK_ACTIVITY}</Text>
              <Text style={styles.activityValue}>{item.current_qty}</Text>
            </View>
            
            {item.last_counts.length >= 2 && (
              <>
                <View style={styles.activityRow}>
                  <Text style={styles.activityLabel}>{strings.SOLD_SINCE_LAST}</Text>
                  <Text style={[
                    styles.activityValue,
                    item.sold_since_last > 0 && styles.activityValueGreen
                  ]}>
                    {item.sold_since_last > 0 ? item.sold_since_last : '—'}
                  </Text>
                </View>
                
                {item.profit_since_last > 0 && (
                  <View style={styles.activityRow}>
                    <Text style={styles.activityLabel}>{strings.PROFIT_LABEL}</Text>
                    <Text style={[styles.activityValue, styles.activityValueGreen]}>
                      R{item.profit_since_last.toFixed(0)}
                    </Text>
                  </View>
                )}
              </>
            )}
            
            {item.last_counts.length > 0 && (
              <Text style={styles.activityHistory}>
                {strings.LAST_COUNTS(item.last_counts)}
              </Text>
            )}
            
            {item.last_counts.length === 0 && (
              <Text style={styles.activityNoData}>{strings.NOT_COUNTED_YET}</Text>
            )}
          </View>
        ))}
        
        {activity.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.NO_ACTIVITY}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================
