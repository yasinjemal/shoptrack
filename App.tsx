/**
 * ShopTrack - Main App Entry Point
 * ==================================
 * 
 * A simple profit tracking app for spaza shops.
 * Offline-first, stock-movement based, no POS required.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Text,
  View,
  TouchableOpacity, 
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
  loadMovements,
  loadProducts,
  recordCount,
  recordStockIn,
  toCoreProduct,
  type AppProduct,
} from './src/core/db';
import { initDatabase, SCHEMA_VERSION } from './src/core/schema';
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
  type CashUp,
} from './src/core/db';
import { styles } from './src/ui/styles';
import { CreditScreen } from './src/ui/credit/CreditScreen';
import { ExpensesScreen } from './src/ui/expenses/ExpensesScreen';
import { CashUpScreen } from './src/ui/cashup/CashUpScreen';

// ============================================
// DATABASE SETUP
// ============================================

/**
 * Opened once in init() below, via openDatabaseAsync.
 *
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

// ============================================
// TYPES
// ============================================

// The UI product shape now lives with the adapter so the engine and the
// screens cannot drift apart again.
type Product = AppProduct;

type Screen = 'home' | 'products' | 'add_product' | 'edit_product' | 'count' | 'stock_in' | 'activity' | 'weekly' | 'credit' | 'expenses' | 'cashup';

type Language = 'en' | 'zu';

// ============================================
// LANGUAGE STRINGS
// ============================================

const STRINGS = {
  en: {
    // Count screen
    COUNT_HEADER: "How many do you have right now?",
    COUNT_HINT: "Count what's on your shelves",
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
    ERROR_BACKUP: "Could not create backup",
    ERROR_RESTORE: "Could not restore backup",
    DB_ERROR_TITLE: "Can't open your shop data",
    DB_ERROR_HINT: "Your data is still on this phone — ShopTrack just couldn't read it. Close the app and open it again. If it keeps happening, don't add anything new until it's fixed.",
    
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

    // Language
    LANGUAGE_LABEL: "Language",
  },
  zu: {
    // Count screen
    COUNT_HEADER: "Unazo zingaki manje?",
    COUNT_HINT: "Bala okuseshelevini yakho",
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
    ERROR_BACKUP: "Ayikwazanga ukwenza ibhekhi",
    ERROR_RESTORE: "Ayikwazanga ukubuyisela ibhekhi",
    DB_ERROR_TITLE: "Ayikwazi ukuvula idatha yesitolo sakho",
    DB_ERROR_HINT: "Idatha yakho isesekhona kule foni — i-ShopTrack ayikwazanga ukuyifunda. Vala uhlelo bese uyavula futhi. Uma kuqhubeka, ungangezi lutho olusha kuze kulungiswe.",
    
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
  const [lang, setLang] = useState<Language>('en');
  const [restockPriority, setRestockPriority] = useState<RestockItem[]>([]);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [credit, setCredit] = useState<CreditSummary | null>(null);
  const [expenses, setExpenses] = useState<ExpenseSummary | null>(null);
  const [lastCashUp, setLastCashUp] = useState<CashUp | null>(null);
  const [dbError, setDbError] = useState<string | null>(null);
  const strings = t(lang);

  // Initialize database and language on mount
  useEffect(() => {
    async function init() {
      try {
        // Load saved language
        const savedLang = await AsyncStorage.getItem('shoptrack_language');
        if (savedLang === 'zu' || savedLang === 'en') {
          setLang(savedLang);
        }
        
        db = await SQLite.openDatabaseAsync('shoptrack.db');
        await initDatabase(db);
        await refreshProducts();
        await refreshCredit();
        await refreshExpenses();
        await refreshCashUp();
      } catch (error) {
        console.error('Database init error:', error);
        // Kept verbatim: "Sync operation timeout" means someone reintroduced a
        // sync SQLite call on web, and the exact wording is the fastest route
        // back to the note above.
        setDbError(error instanceof Error ? error.message : String(error));
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  // Toggle language
  const toggleLanguage = async () => {
    const newLang = lang === 'en' ? 'zu' : 'en';
    setLang(newLang);
    await AsyncStorage.setItem('shoptrack_language', newLang);
  };

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

    // Tier 4.1: Calculate restock priority after loading products
    await calculateRestockPriority(result);
  }, []);

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
      // Get all data
      const productsData = await db.getAllAsync('SELECT * FROM products');
      const movementsData = await db.getAllAsync('SELECT * FROM stock_movements');
      const sessionsData = await db.getAllAsync('SELECT * FROM count_sessions');
      
      const backup = {
        shoptrack_backup: true,
        version: SCHEMA_VERSION,
        created_at: new Date().toISOString(),
        data: {
          products: productsData,
          stock_movements: movementsData,
          count_sessions: sessionsData,
        }
      };
      
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
          dialogTitle: 'Save your ShopTrack backup',
        });
        Alert.alert(strings.BACKUP_SAVED, strings.BACKUP_HINT);
      } else {
        Alert.alert('Error', 'Sharing is not available on this device');
      }
    } catch (error) {
      console.error('Backup error:', error);
      Alert.alert('Error', strings.ERROR_BACKUP);
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
      const backup = JSON.parse(content);
      
      // Validate backup format
      if (!backup.shoptrack_backup || !backup.data) {
        Alert.alert(strings.RESTORE_INVALID, strings.RESTORE_INVALID_HINT);
        return;
      }

      // A backup written against an older schema no longer lines up with the
      // current tables. Refuse it rather than restore a broken shop.
      if (backup.version !== SCHEMA_VERSION) {
        Alert.alert(strings.RESTORE_OLD_VERSION, strings.RESTORE_OLD_VERSION_HINT);
        return;
      }

      // Confirm restore
      Alert.alert(
        strings.RESTORE_CONFIRM,
        strings.RESTORE_CONFIRM_HINT,
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Restore', 
            style: 'destructive',
            onPress: async () => {
              try {
                // Clear existing data
                await db.execAsync('DELETE FROM stock_movements');
                await db.execAsync('DELETE FROM count_sessions');
                await db.execAsync('DELETE FROM products');

                // Restore products
                for (const product of backup.data.products) {
                  await db.runAsync(
                    `INSERT INTO products (id, name, unit_label, buy_price, sell_price, current_qty, low_stock_threshold, is_active, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [product.id, product.name, product.unit_label, product.buy_price, product.sell_price, product.current_qty, product.low_stock_threshold || 5, product.is_active ?? 1, product.created_at, product.updated_at]
                  );
                }

                // Restore count sessions
                for (const session of backup.data.count_sessions) {
                  await db.runAsync(
                    `INSERT INTO count_sessions (id, started_at, completed_at, products_counted, total_products)
                     VALUES (?, ?, ?, ?, ?)`,
                    [session.id, session.started_at, session.completed_at, session.products_counted, session.total_products]
                  );
                }

                // Restore movements
                for (const movement of backup.data.stock_movements) {
                  await db.runAsync(
                    `INSERT INTO stock_movements (id, product_id, type, quantity, buy_price_at_time, sell_price_at_time, total_cost, notes, session_id, recorded_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [movement.id, movement.product_id, movement.type, movement.quantity, movement.buy_price_at_time ?? null, movement.sell_price_at_time ?? null, movement.total_cost ?? null, movement.notes ?? null, movement.session_id ?? null, movement.recorded_at]
                  );
                }

                // Reload products
                await refreshProducts();
                
                Alert.alert(strings.RESTORE_DONE, strings.RESTORE_DONE_HINT);
              } catch (error) {
                console.error('Restore error:', error);
                Alert.alert('Error', strings.ERROR_RESTORE);
              }
            }
          }
        ]
      );
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Error', strings.ERROR_RESTORE);
    }
  };

  // ==========================================
  // SCREEN: Loading
  // ==========================================
  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#4CAF50" />
        <Text style={styles.loadingText}>Starting ShopTrack...</Text>
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
          <Text style={styles.tagline}>Know your profit</Text>
        </View>

        <ScrollView style={styles.homeContent}>
          {/* How it works - show when no profit yet */}
          {lastProfit === null && products.length > 0 && (
            <View style={styles.howItWorksCard}>
              <Text style={styles.howItWorksTitle}>📊 How it works</Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>1.</Text> Add your products (name + prices)
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>2.</Text> Count your stock today
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>3.</Text> Count again in a few days
              </Text>
              <Text style={styles.howItWorksStep}>
                <Text style={styles.stepNumber}>4.</Text> See your profit here! ⬇️
              </Text>
              <Text style={styles.howItWorksNote}>
                ShopTrack calculates profit by comparing your stock counts.
                Less stock = items sold = profit earned.
              </Text>
            </View>
          )}

          {/* Profit display (if available) */}
          {lastProfit !== null && (
            <View style={styles.profitCard}>
              <Text style={styles.profitLabel}>Your Profit</Text>
              <Text style={styles.profitValue}>R{lastProfit.toFixed(0)}</Text>
              <Text style={styles.profitExplainer}>
                Based on stock sold since last count
              </Text>
              {/* Profit counts goods that left the shelf, including those taken
                  on credit. Say so here rather than let the owner assume the
                  cash is in the till. */}
              {credit && credit.total_outstanding > 0 && (
                <Text style={styles.profitOwedNote}>
                  {strings.CREDIT_NOT_IN_HAND(`R${credit.total_outstanding.toFixed(2)}`)}
                </Text>
              )}
            </View>
          )}

          {/* Quick stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>{products.length}</Text>
              <Text style={styles.statLabel}>Products</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statValue}>
                {products.reduce((sum, p) => sum + p.current_qty, 0)}
              </Text>
              <Text style={styles.statLabel}>Items in Stock</Text>
            </View>
          </View>

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
                {credit.customers_owing === 1
                  ? '1 person'
                  : `${credit.customers_owing} people`}
                {/* A broken promise beats general silence as a signal. */}
                {credit.customers_overdue > 0
                  ? ` · ${credit.customers_overdue} late`
                  : credit.customers_stale > 0
                    ? ` · ${credit.customers_stale} not paid in a while`
                    : ''}
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

          {/* Main actions */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => setScreen('count')}
            >
              <Text style={styles.primaryActionIcon}>📦</Text>
              <Text style={styles.primaryActionText}>Count Stock</Text>
              <Text style={styles.primaryActionSubtext}>
                {products.some(p => p.current_qty > 0) 
                  ? 'Count now to see your profit'
                  : 'First count = your baseline'
                }
              </Text>
            </TouchableOpacity>

            <View style={styles.secondaryActions}>
              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setScreen('stock_in')}
              >
                <Text style={styles.secondaryActionIcon}>➕</Text>
                <Text style={styles.secondaryActionText}>Add Stock</Text>
                <Text style={styles.secondaryActionHint}>When you buy</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setScreen('products')}
              >
                <Text style={styles.secondaryActionIcon}>📋</Text>
                <Text style={styles.secondaryActionText}>Products</Text>
                <Text style={styles.secondaryActionHint}>Add or edit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setScreen('credit')}
              >
                <Text style={styles.secondaryActionIcon}>📖</Text>
                <Text style={styles.secondaryActionText}>{strings.CREDIT_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.CREDIT_HOME_HINT}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setScreen('expenses')}
              >
                <Text style={styles.secondaryActionIcon}>🧾</Text>
                <Text style={styles.secondaryActionText}>{strings.EXPENSES_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.EXPENSES_HOME_HINT}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryAction}
                onPress={() => setScreen('cashup')}
              >
                <Text style={styles.secondaryActionIcon}>💰</Text>
                <Text style={styles.secondaryActionText}>{strings.CASHUP_HOME_BUTTON}</Text>
                <Text style={styles.secondaryActionHint}>{strings.CASHUP_HOME_HINT}</Text>
              </TouchableOpacity>
            </View>
            
            {/* Activity buttons - only show if there's history */}
            {products.some(p => p.current_qty > 0) && (
              <View style={styles.insightButtons}>
                <TouchableOpacity
                  style={styles.insightButton}
                  onPress={() => setScreen('activity')}
                >
                  <Text style={styles.insightButtonIcon}>📊</Text>
                  <Text style={styles.insightButtonText}>Recent Activity</Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.insightButton}
                  onPress={() => setScreen('weekly')}
                >
                  <Text style={styles.insightButtonIcon}>📅</Text>
                  <Text style={styles.insightButtonText}>This Week</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Low Stock Warning */}
          {products.filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5)).length > 0 && (
            <View style={styles.lowStockWarning}>
              <Text style={styles.lowStockTitle}>⚠️ Running Low</Text>
              {products
                .filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5))
                .slice(0, 3)
                .map(p => (
                  <Text key={p.id} style={styles.lowStockItem}>
                    {p.name}: {p.current_qty} left
                  </Text>
                ))
              }
            </View>
          )}

          {/* Empty state prompt */}
          {products.length === 0 && (
            <View style={styles.emptyPrompt}>
              <Text style={styles.emptyPromptTitle}>👋 Welcome to ShopTrack!</Text>
              <Text style={styles.emptyPromptText}>
                Track your shop's profit without complicated bookkeeping.
              </Text>
              <Text style={styles.emptyPromptHow}>
                Just count your stock regularly — ShopTrack figures out how much you sold and calculates your profit.
              </Text>
              <TouchableOpacity
                style={styles.emptyPromptButton}
                onPress={() => setScreen('add_product')}
              >
                <Text style={styles.emptyPromptButtonText}>
                  Add Your First Product
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Data Safety Section */}
          <View style={styles.dataSection}>
            <Text style={styles.dataSectionTitle}>Your Data</Text>
            
            <TouchableOpacity
              style={styles.dataButton}
              onPress={handleBackup}
            >
              <Text style={styles.dataButtonIcon}>💾</Text>
              <View style={styles.dataButtonContent}>
                <Text style={styles.dataButtonText}>Save a copy of your shop data</Text>
                <Text style={styles.dataButtonHint}>Keep it safe on WhatsApp or Google Drive</Text>
              </View>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.dataButton}
              onPress={handleRestore}
            >
              <Text style={styles.dataButtonIcon}>📂</Text>
              <View style={styles.dataButtonContent}>
                <Text style={styles.dataButtonText}>Restore from backup</Text>
                <Text style={styles.dataButtonHint}>Get your data back on a new phone</Text>
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
            <Text style={styles.backButton}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Products</Text>
          <TouchableOpacity onPress={() => setScreen('add_product')}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Search bar - only show if there are products */}
        {products.length > 0 && (
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
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

        {products.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No products yet</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>Add Product</Text>
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
                    {product.current_qty} {product.unit_label}
                    {product.sell_price ? ` • Sell: R${product.sell_price}` : ''}
                    {product.buy_price ? ` • Buy: R${product.buy_price}` : ''}
                  </Text>
                </View>
                <Text style={styles.productEditHint}>›</Text>
              </TouchableOpacity>
            ))}
            {products.filter(p => p.name.toLowerCase().includes(productSearch.toLowerCase())).length === 0 && (
              <Text style={styles.noSearchResults}>No products match "{productSearch}"</Text>
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
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Count Stock</Text>
            <View style={{ width: 50 }} />
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Add products first</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>Add Product</Text>
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
        onComplete={(profit: number) => {
          setLastProfit(profit);
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
              <Text style={styles.backButton}>← Back</Text>
            </TouchableOpacity>
            <Text style={styles.screenTitle}>Add Stock</Text>
            <View style={{ width: 50 }} />
          </View>
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>Add products first</Text>
            <TouchableOpacity
              style={styles.emptyStateButton}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyStateButtonText}>Add Product</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      );
    }

    return (
      <StockInScreen
        products={products}
        db={db}
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
  onSave, 
  onCancel 
}: { 
  db: SQLite.SQLiteDatabase;
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
      const now = Date.now();
      const sell = sellPrice ? parseFloat(sellPrice) : null;

      // Insert product with initial quantity
      const result = await db.runAsync(
        'INSERT INTO products (name, sell_price, buy_price, current_qty, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
        [
          name.trim(),
          sell,
          buyPrice ? parseFloat(buyPrice) : null,
          qty,
          now,
          now
        ]
      );

      // If quantity was provided, record it as the opening count
      if (qty > 0) {
        await db.runAsync(
          `INSERT INTO stock_movements (product_id, type, quantity, sell_price_at_time, recorded_at)
           VALUES (?, 'COUNT', ?, ?, ?)`,
          [result.lastInsertRowId, qty, sell, now]
        );
      }

      onSave();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Could not save product');
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Add Product</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>Product Name *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Coca-Cola 500ml"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoFocus
        />

        <Text style={styles.inputLabel}>Sell Price (optional)</Text>
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
        <Text style={styles.inputHint}>What you charge customers</Text>

        <Text style={styles.inputLabel}>Buy Price (optional)</Text>
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
        <Text style={styles.inputHint}>What you pay for it</Text>

        <Text style={styles.inputLabel}>Current Stock (optional)</Text>
        <TextInput
          style={styles.textInput}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Text style={styles.inputHint}>How many do you have right now?</Text>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : 'Add Product'}
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
  product,
  onSave, 
  onDelete,
  onCancel 
}: { 
  db: SQLite.SQLiteDatabase;
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
      await db.runAsync(
        'UPDATE products SET name = ?, sell_price = ?, buy_price = ?, updated_at = ? WHERE id = ?',
        [
          name.trim(),
          sellPrice ? parseFloat(sellPrice) : null,
          buyPrice ? parseFloat(buyPrice) : null,
          Date.now(),
          product.id
        ]
      );
      
      onSave();
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert('Error', 'Could not update product');
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Product',
      `Are you sure you want to delete "${product.name}"? This will also remove all its stock history.`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Delete', 
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete - set is_active to 0
              await db.runAsync(
                'UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?',
                [Date.now(), product.id]
              );
              onDelete();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert('Error', 'Could not delete product');
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
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Edit Product</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>Product Name *</Text>
        <TextInput
          style={styles.textInput}
          placeholder="e.g., Coca-Cola 500ml"
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>Sell Price</Text>
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
        <Text style={styles.inputHint}>What you charge customers</Text>

        <Text style={styles.inputLabel}>Buy Price</Text>
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
        <Text style={styles.inputHint}>What you pay for it</Text>

        <View style={styles.editProductInfo}>
          <Text style={styles.editProductInfoText}>
            Current stock: {product.current_qty} {product.unit_label}
          </Text>
          <Text style={styles.editProductInfoHint}>
            Use "Count Stock" to update quantity
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
            {saving ? 'Saving...' : 'Save Changes'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>Delete Product</Text>
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
  onCancel 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  strings: typeof STRINGS.en;
  onComplete: (profit: number) => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'counting' | 'results'>('counting');
  const [saving, setSaving] = useState(false);
  const [profit, setProfit] = useState(0);

  const countedCount = Object.entries(counts).filter(([_, v]) => v !== '').length;
  const isFirstCount = products.every(p => p.current_qty === 0);
  
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
      } catch (error) {
        console.error('Load confidence data error:', error);
      }
    };
    loadConfidenceData();
  }, [db]);

  const handleSave = async () => {
    setSaving(true);

    try {
      const now = Date.now();

      // Create count session
      const sessionResult = await db.runAsync(
        'INSERT INTO count_sessions (started_at, products_counted, total_products) VALUES (?, ?, ?)',
        [now, countedCount, products.length]
      );
      const sessionId = sessionResult.lastInsertRowId;

      let didStockIncrease = false;
      let hasUnusualChange = false;
      const counted: Product[] = [];

      // Write the counts first, then let the engine read them back. The
      // engine is the only thing that decides what "sold" and "profit" mean.
      for (const product of products) {
        const countStr = counts[product.id];
        if (countStr === '' || countStr === undefined) continue;

        const newQty = parseInt(countStr) || 0;
        const oldQty = product.current_qty;
        const change = oldQty - newQty;

        // Track if stock went up (restock without using Stock-In)
        if (change < 0) {
          didStockIncrease = true;
        }

        // Track unusual changes (Tier 3.1)
        if (oldQty > 0 && Math.abs(change) > UNUSUAL_THRESHOLD) {
          hasUnusualChange = true;
        }

        await recordCount(db, product, newQty, sessionId, now);
        counted.push(product);
      }

      // Complete the session
      await db.runAsync(
        'UPDATE count_sessions SET completed_at = ? WHERE id = ?',
        [now, sessionId]
      );

      // Profit since the previous count, per the engine.
      const movements = await loadMovements(db, now - THIRTY_DAYS_MS);
      const previousCountAt = movements
        .filter(m => m.type === 'COUNT' && m.recorded_at < now)
        .reduce((latest, m) => Math.max(latest, m.recorded_at), 0);

      const summary = calculatePeriodSummary(
        counted.map(toCoreProduct),
        movements,
        previousCountAt > 0 ? previousCountAt + 1 : now - THIRTY_DAYS_MS,
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
      Alert.alert('Error', 'Could not save count');
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
            {isFirstCount ? 'First Count Done!' : 'Count Saved!'}
          </Text>
          
          {isFirstCount ? (
            <>
              <Text style={styles.resultsSubtitle}>
                You've recorded your starting stock.
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
                    <Text style={styles.profitResultLabel}>Your Profit</Text>
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
            onPress={() => onComplete(profit)}
          >
            <Text style={styles.doneButtonText}>
              {isFirstCount ? 'Got it!' : 'Done'}
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
          <Text style={styles.backButton}>Cancel</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Count Stock</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.countInstructions}>
        <Text style={styles.countInstructionsTitle}>{strings.COUNT_HEADER}</Text>
        <Text style={styles.countInstructionsHint}>{strings.COUNT_HINT}</Text>
      </View>

      <Text style={styles.countProgress}>
        {countedCount} of {products.length} counted
      </Text>

      <ScrollView style={styles.countList}>
        {products.map((product) => (
          <View key={product.id} style={styles.countItem}>
            <View style={styles.countItemInfo}>
              <Text style={styles.countItemName}>{product.name}</Text>
              <Text style={styles.countItemPrev}>
                {product.current_qty === 0 
                  ? 'Not counted yet' 
                  : `Last: ${product.current_qty}`}
              </Text>
            </View>
            <TextInput
              style={styles.countInput}
              placeholder="0"
              placeholderTextColor="#CCCCCC"
              keyboardType="number-pad"
              value={counts[product.id] || ''}
              onChangeText={(val) => {
                setCounts(prev => ({ ...prev, [product.id]: val }));
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
          onPress={handleSave}
          disabled={countedCount === 0 || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? 'Saving...' : `Save Count (${countedCount})`}
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
  onComplete, 
  onCancel 
}: { 
  products: Product[];
  db: SQLite.SQLiteDatabase;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [saving, setSaving] = useState(false);

  const qty = parseInt(quantity) || 0;
  const totalCost = parseFloat(cost) || 0;
  const canSave = selectedProduct && qty > 0 && totalCost > 0;

  const handleSave = async () => {
    if (!selectedProduct || !canSave) return;
    
    setSaving(true);
    try {
      await recordStockIn(db, selectedProduct, qty, totalCost);

      Alert.alert(
        'Stock Added! ✓',
        `${qty} ${selectedProduct.unit_label} of ${selectedProduct.name} recorded.`,
        [{ text: 'Done', onPress: onComplete }]
      );
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert('Error', 'Could not save');
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
            <Text style={styles.backButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>Add Stock</Text>
          <View style={{ width: 50 }} />
        </View>

        <Text style={styles.sectionTitle}>What did you buy?</Text>

        <ScrollView style={styles.productList}>
          {products.map((product) => (
            <TouchableOpacity
              key={product.id}
              style={styles.productSelectItem}
              onPress={() => setSelectedProduct(product)}
            >
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productMeta}>
                {product.current_qty} {product.unit_label} in stock
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Entry form
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      
      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={() => setSelectedProduct(null)}>
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Add Stock</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.selectedProductBanner}>
        <Text style={styles.selectedProductName}>{selectedProduct.name}</Text>
        <Text style={styles.selectedProductMeta}>
          Currently: {selectedProduct.current_qty} {selectedProduct.unit_label}
        </Text>
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>How many did you buy?</Text>
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

        <Text style={styles.inputLabel}>Total cost?</Text>
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
            = R{(totalCost / qty).toFixed(2)} each
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
            {saving ? 'Saving...' : 'Save Stock-In'}
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
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Weekly Summary</Text>
        <View style={{ width: 50 }} />
      </View>

      {renderContent()}
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
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>Recent Activity</Text>
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
            <Text style={styles.topSellersTitle}>🏆 Top Sellers</Text>
            <Text style={styles.topSellersSubtitle}>Since last count</Text>
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
        <Text style={styles.activitySectionTitle}>Product Details</Text>
        
        {activity.map((item) => (
          <View key={item.product_id} style={styles.activityCard}>
            <Text style={styles.activityProductName}>{item.product_name}</Text>
            
            <View style={styles.activityRow}>
              <Text style={styles.activityLabel}>Current stock:</Text>
              <Text style={styles.activityValue}>{item.current_qty}</Text>
            </View>
            
            {item.last_counts.length >= 2 && (
              <>
                <View style={styles.activityRow}>
                  <Text style={styles.activityLabel}>Sold since last count:</Text>
                  <Text style={[
                    styles.activityValue,
                    item.sold_since_last > 0 && styles.activityValueGreen
                  ]}>
                    {item.sold_since_last > 0 ? item.sold_since_last : '—'}
                  </Text>
                </View>
                
                {item.profit_since_last > 0 && (
                  <View style={styles.activityRow}>
                    <Text style={styles.activityLabel}>Profit:</Text>
                    <Text style={[styles.activityValue, styles.activityValueGreen]}>
                      R{item.profit_since_last.toFixed(0)}
                    </Text>
                  </View>
                )}
              </>
            )}
            
            {item.last_counts.length > 0 && (
              <Text style={styles.activityHistory}>
                Last counts: {item.last_counts.join(' → ')}
              </Text>
            )}
            
            {item.last_counts.length === 0 && (
              <Text style={styles.activityNoData}>Not counted yet</Text>
            )}
          </View>
        ))}
        
        {activity.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>No activity yet</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

// ============================================
// STYLES
// ============================================

