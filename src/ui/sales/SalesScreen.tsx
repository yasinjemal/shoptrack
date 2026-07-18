/**
 * ============================================
 * SALES BOOK SCREEN
 * ============================================
 *
 * What the till took, and what the owner kept of it — including for the months
 * before they ever installed ShopTrack.
 *
 * Design notes:
 * - The month list IS the screen. "What did I make in January?" is the question
 *   this exists to answer, and the answer is visible without tapping anything.
 * - Backfilling is one month at a time, biggest first. Nobody is going to type
 *   180 individual days out of a paper book, so a whole month is one number.
 * - The margin is asked once and remembered. It is the owner's own estimate, so
 *   the screen says so rather than presenting it as the app's calculation.
 * - This never adds itself to counted profit. They are two estimates of the
 *   same money; see src/core/sales.ts.
 */

import React, { useState } from 'react';
import {
  Text,
  View,
  Pressable,
  SafeAreaView,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { formatMoney, getCurrentCurrency } from '../../core/currency';
import { localCalendarDayLabel } from '../../core/localDate';
import { parseNonNegativeDecimal } from '../../core/userNumber';

import {
  calculateSalesHistory,
  dayKey,
  formatMonth,
  DEFAULT_MARGIN_PCT,
  type MonthlySales,
  type SalesChange,
  type SalesEntry,
  type SalesHistory,
  type SalesStatistics,
} from '../../core/sales';
import { clearMonthSummary, loadSalesEntries, recordSales } from '../../core/db';
import { MonthCalendar, YearPicker } from './MonthCalendar';
import { styles } from '../styles';
import { color } from '../theme';
import { salesStyles as ss } from './styles';
import { KeyboardForm } from '../components/KeyboardForm';
import { LoadingState } from '../components/LoadingState';
import { ScreenHeader } from '../components/ScreenHeader';
import { registerHardwareBackOverride } from '../navigation';

export interface SalesStrings {
  BACK: string;
  ADD: string;
  ERROR_TITLE: string;
  ERROR_GENERIC: string;

  SALES_TITLE: string;
  SALES_EMPTY: string;
  SALES_EMPTY_HINT: string;
  SALES_TOTAL_LABEL: string;
  SALES_TOTAL_HINT: (months: number, margin: string) => string;
  SALES_TODAY: string;
  SALES_BACKFILL: string;
  SALES_TOOK_TODAY: string;
  SALES_DAYS_FILLED: (filled: number, total: number) => string;
  SALES_FILL_HINT: string;
  SALES_MARGIN: string;
  SALES_MARGIN_HINT: (hundred: string, low: string, high: string) => string;
  SALES_MARGIN_IS_YOURS: string;
  SALES_WILL_KEEP: (amount: string) => string;
  SALES_PICK_MONTH: string;
  SALES_SAVE: string;
  SALES_SAVING: string;
  SALES_CANCEL: string;
  SALES_MONTH_DAYS: (days: number) => string;
  SALES_MONTH_TOTAL: string;
  SALES_CONFLICT: string;
  SALES_CONFLICT_FIX: string;
  SALES_NOT_COUNTED_PROFIT: string;
  SALES_STATS_TITLE: string;
  SALES_STATS_FOR: (month: string) => string;
  SALES_STATS_BEST_DAY: string;
  SALES_STATS_QUIETEST_DAY: string;
  SALES_STATS_NO_DAILY: string;
  SALES_STATS_MONTH_CHANGE: string;
  SALES_STATS_VS_MONTH: (change: string, month: string) => string;
  SALES_STATS_NO_PREVIOUS_MONTH: string;
  SALES_STATS_YTD: string;
  SALES_STATS_YTD_COVERAGE: (recorded: number, elapsed: number, month: string) => string;
  SALES_STATS_VS_YEAR: (change: string, year: number, recorded: number) => string;
  SALES_STATS_NO_PREVIOUS_YEAR: string;
}

type Mode =
  | { kind: 'list' }
  | { kind: 'today' }
  // Backfill is two steps now: pick a month, then fill its days. It used to be
  // one screen per month, which meant seven screens of typing to enter January
  // through July -- and nothing like how anyone reads a paper book.
  | { kind: 'pick_month' }
  | { kind: 'fill_month'; monthKey: string };

export function SalesScreen({
  db,
  strings,
  onBack,
  onChanged,
  todayOnly = false,
}: {
  db: SQLiteDatabase;
  strings: SalesStrings;
  onBack: () => void;
  onChanged: () => void;
  /**
   * Worker mode, reached from Home while the owner lock is on: straight to
   * today's takings, no history, no profit, and no margin question -- the
   * margin is the owner's number, silently reused from the last entry.
   */
  todayOnly?: boolean;
}) {
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [entries, setEntries] = useState<SalesEntry[]>([]);
  const [mode, setMode] = useState<Mode>(todayOnly ? { kind: 'today' } : { kind: 'list' });
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const rows = await loadSalesEntries(db);
      setEntries(rows);
      setHistory(calculateSalesHistory(rows));
    } catch (error) {
      console.error('Load sales error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    } finally {
      setLoading(false);
    }
  }, [db, strings.ERROR_TITLE, strings.ERROR_GENERIC]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => registerHardwareBackOverride(() => {
    if (mode.kind === 'list' || (mode.kind === 'today' && todayOnly)) return false;
    if (mode.kind === 'fill_month') setMode({ kind: 'pick_month' });
    else setMode({ kind: 'list' });
    return true;
  }), [mode.kind, todayOnly]);

  const done = async () => {
    await refresh();
    onChanged();
    if (todayOnly) onBack();
    else setMode({ kind: 'list' });
  };

  const lastMargin = history?.months[0]?.margin_pct ?? null;

  if (mode.kind === 'today') {
    // In worker mode, wait for the load so the entry silently reuses the
    // owner's last margin instead of falling back to the default.
    if (todayOnly && loading) return null;
    return (
      <EntryScreen
        db={db}
        strings={strings}
        lastMargin={lastMargin}
        hideMargin={todayOnly}
        onCancel={todayOnly ? onBack : () => setMode({ kind: 'list' })}
        onSaved={done}
      />
    );
  }

  if (mode.kind === 'pick_month') {
    return (
      <YearPicker
        entries={entries}
        strings={strings}
        onPick={key => setMode({ kind: 'fill_month', monthKey: key })}
        onCancel={() => setMode({ kind: 'list' })}
      />
    );
  }

  if (mode.kind === 'fill_month') {
    return (
      <MonthCalendar
        db={db}
        monthKey={mode.monthKey}
        entries={entries}
        defaultMargin={lastMargin ?? DEFAULT_MARGIN_PCT}
        strings={strings}
        onCancel={() => setMode({ kind: 'pick_month' })}
        onSaved={done}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.SALES_TITLE} leftLabel={strings.BACK} onLeft={onBack} />

      {loading || !history ? <LoadingState label={strings.SALES_TITLE} /> : (
        <ScrollView style={ss.list}>
          {history.months_recorded === 0 ? (
            <View style={styles.emptyState}>
              <Text style={ss.emptyIcon}>📗</Text>
              <Text style={ss.emptyTitle}>{strings.SALES_EMPTY}</Text>
              <Text style={ss.emptyHint}>{strings.SALES_EMPTY_HINT}</Text>
            </View>
          ) : (
            <>
              {/* The answer to "what have I made?", all the way back. */}
              <View style={ss.totalCard}>
                <Text style={ss.totalLabel}>{strings.SALES_TOTAL_LABEL}</Text>
                <Text style={ss.totalAmount}>{formatMoney(history.total_profit)}</Text>
                <Text style={ss.totalHint}>
                  {strings.SALES_TOTAL_HINT(
                    history.months_recorded,
                    `${history.average_margin_pct.toFixed(0)}%`
                  )}
                </Text>
              </View>

              {history.statistics && (
                <SalesStatisticsCard statistics={history.statistics} strings={strings} />
              )}

              {history.conflicts.length > 0 && (
                <View style={ss.conflictCard}>
                  <Text style={ss.conflictTitle}>{strings.SALES_CONFLICT}</Text>
                  {history.conflicts.map(c => (
                    <Pressable
                      key={c.month_key}
                      onPress={async () => {
                        await clearMonthSummary(db, c.month_key);
                        await refresh();
                        onChanged();
                      }}
                    >
                      <Text style={ss.conflictItem}>
                        • {formatMonth(c.month_key)} — {strings.SALES_CONFLICT_FIX}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

              {history.months.map(m => (
                <MonthRow key={m.month_key} month={m} strings={strings} />
              ))}

              {/* Counted profit and book profit are two estimates of the same
                  money. Said out loud so nobody adds them together. */}
              <Text style={ss.footnote}>{strings.SALES_NOT_COUNTED_PROFIT}</Text>
            </>
          )}

          <View style={ss.actions}>
            <Pressable
              style={({ pressed }) => [ss.primaryButton, pressed && ss.primaryButtonPressed]}
              android_ripple={{ color: color.ripple }}
              accessibilityRole="button"
              accessibilityLabel={strings.SALES_TODAY}
              onPress={() => setMode({ kind: 'today' })}
            >
              <Text style={ss.primaryButtonText}>{strings.SALES_TODAY}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [ss.secondaryButton, pressed && ss.secondaryButtonPressed]}
              android_ripple={{ color: color.ripple }}
              accessibilityRole="button"
              accessibilityLabel={strings.SALES_BACKFILL}
              onPress={() => setMode({ kind: 'pick_month' })}
            >
              <Text style={ss.secondaryButtonText}>{strings.SALES_BACKFILL}</Text>
            </Pressable>
          </View>

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function SalesStatisticsCard({
  statistics,
  strings,
}: {
  statistics: SalesStatistics;
  strings: SalesStrings;
}) {
  const { highest_day: highest, lowest_day: lowest, month_over_month: monthChange } = statistics;
  const ytd = statistics.year_to_date;

  return (
    <View style={ss.statisticsCard}>
      <Text style={ss.statisticsTitle}>{strings.SALES_STATS_TITLE}</Text>
      <Text style={ss.statisticsPeriod}>
        {strings.SALES_STATS_FOR(formatMonth(statistics.month_key))}
      </Text>

      {highest && lowest ? (
        <View style={ss.statisticsDays}>
          <View style={ss.statisticsDay}>
            <Text style={ss.statisticsLabel}>{strings.SALES_STATS_BEST_DAY}</Text>
            <Text style={ss.statisticsValue}>{formatMoney(highest.sales)}</Text>
            <Text style={ss.statisticsDetail}>{formatSalesDay(highest.day_key)}</Text>
          </View>
          <View style={ss.statisticsDay}>
            <Text style={ss.statisticsLabel}>{strings.SALES_STATS_QUIETEST_DAY}</Text>
            <Text style={ss.statisticsValue}>{formatMoney(lowest.sales)}</Text>
            <Text style={ss.statisticsDetail}>{formatSalesDay(lowest.day_key)}</Text>
          </View>
        </View>
      ) : (
        <Text style={ss.statisticsHint}>{strings.SALES_STATS_NO_DAILY}</Text>
      )}

      <View style={ss.statisticsSection}>
        <Text style={ss.statisticsLabel}>{strings.SALES_STATS_MONTH_CHANGE}</Text>
        <Text style={ss.statisticsDetail}>
          {monthChange
            ? strings.SALES_STATS_VS_MONTH(
                formatSignedChange(monthChange.sales_change),
                formatMonth(monthChange.previous.month_key),
              )
            : strings.SALES_STATS_NO_PREVIOUS_MONTH}
        </Text>
      </View>

      <View style={ss.statisticsSection}>
        <Text style={ss.statisticsLabel}>{strings.SALES_STATS_YTD}</Text>
        <Text style={ss.statisticsValue}>{formatMoney(ytd.current.sales)}</Text>
        <Text style={ss.statisticsDetail}>
          {strings.SALES_STATS_YTD_COVERAGE(
            ytd.current.months_recorded,
            ytd.through_month,
            formatMonth(statistics.month_key),
          )}
        </Text>
        <Text style={ss.statisticsDetail}>
          {ytd.previous && ytd.sales_change
            ? strings.SALES_STATS_VS_YEAR(
                formatSignedChange(ytd.sales_change),
                ytd.previous.year,
                ytd.previous.months_recorded,
              )
            : strings.SALES_STATS_NO_PREVIOUS_YEAR}
        </Text>
      </View>
    </View>
  );
}

function formatSalesDay(key: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const gregorian = new Date(year, month - 1, day).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
  const local = localCalendarDayLabel(key);
  return local ? `${gregorian} · ${local}` : gregorian;
}

function formatSignedChange(change: SalesChange): string {
  if (change.direction === 'same') return formatMoney(0);
  const sign = change.direction === 'up' ? '+' : '−';
  const percentage = change.percent == null
    ? ''
    : ` (${sign}${Math.abs(change.percent).toFixed(1)}%)`;
  return `${sign}${formatMoney(Math.abs(change.amount))}${percentage}`;
}

function MonthRow({ month, strings }: { month: MonthlySales; strings: SalesStrings }) {
  return (
    <View style={ss.monthRow}>
      <View style={ss.monthBody}>
        <Text style={ss.monthName}>{formatMonth(month.month_key)}</Text>
        <Text style={ss.monthMeta}>
          {formatMoney(month.sales)} ·{' '}
          {month.source === 'days'
            ? strings.SALES_MONTH_DAYS(month.days_recorded)
            : strings.SALES_MONTH_TOTAL}
          {' · '}{month.margin_pct.toFixed(0)}%
        </Text>
      </View>
      <Text style={ss.monthProfit}>{formatMoney(month.profit)}</Text>
    </View>
  );
}

/**
 * One screen for both "today's takings" and "a month from the book". They ask
 * for the same two numbers; only the period differs.
 */
/**
 * Today's takings. One number, one margin, done.
 *
 * Past months no longer come through here -- they open a calendar instead, so
 * this screen has exactly one job.
 */
function EntryScreen({
  db,
  strings,
  lastMargin,
  onCancel,
  onSaved,
  hideMargin = false,
}: {
  db: SQLiteDatabase;
  strings: SalesStrings;
  lastMargin: number | null;
  onCancel: () => void;
  onSaved: () => void;
  /** Worker mode: the margin (and the profit it implies) is the owner's business. */
  hideMargin?: boolean;
}) {
  const now = Date.now();

  const [amount, setAmount] = useState('');
  // Default to what they said last time; the app never invents a margin
  // silently, but re-asking every day would be its own kind of rude.
  const [margin, setMargin] = useState(String(lastMargin ?? DEFAULT_MARGIN_PCT));
  const [saving, setSaving] = useState(false);

  const parsedTakings = parseNonNegativeDecimal(amount);
  const parsedMargin = parseNonNegativeDecimal(margin);
  const takings = parsedTakings ?? 0;
  const marginPct = parsedMargin ?? 0;
  const marginValid = parsedMargin !== null && marginPct <= 100;
  const canSave = parsedTakings !== null && marginValid && !saving;

  const keeps = marginValid ? takings * (marginPct / 100) : 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await recordSales(db, 'DAY', dayKey(now), takings, marginPct, null, now);
      onSaved();
    } catch (error) {
      console.error('Record sales error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.SALES_TODAY} leftLabel={strings.SALES_CANCEL} onLeft={onCancel} />

      <KeyboardForm style={ss.form}>
        <Text style={styles.inputLabel}>{strings.SALES_TOOK_TODAY}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            autoFocus
            accessibilityLabel={strings.SALES_TOOK_TODAY}
          />
        </View>

        {!hideMargin && (
          <>
            <Text style={styles.inputLabel}>{strings.SALES_MARGIN}</Text>
            <View style={styles.priceInputRow}>
              <TextInput
                style={styles.priceInput}
                value={margin}
                onChangeText={setMargin}
                placeholder="25"
                keyboardType="number-pad"
                accessibilityLabel={strings.SALES_MARGIN}
              />
              <Text style={styles.currencyPrefix}>%</Text>
            </View>
            <Text style={styles.inputHint}>
              {strings.SALES_MARGIN_HINT(formatMoney(100, 0), formatMoney(20, 0), formatMoney(30, 0))}
            </Text>

            {takings > 0 && marginValid && (
              <Text style={styles.costSummary}>
                {strings.SALES_WILL_KEEP(formatMoney(keeps))}
              </Text>
            )}

            {/* The margin is the owner's guess, so the answer is their guess too.
                Saying so is the difference between a tool and a fortune teller. */}
            <Text style={ss.marginNote}>{strings.SALES_MARGIN_IS_YOURS}</Text>
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && styles.saveButtonDisabled,
            pressed && canSave && ss.primaryButtonPressed,
          ]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.SALES_SAVE}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SALES_SAVING : strings.SALES_SAVE}
          </Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </KeyboardForm>
    </SafeAreaView>
  );
}
