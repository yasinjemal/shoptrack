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

import {
  calculateSalesHistory,
  dayKey,
  formatMonth,
  monthKey,
  monthsBetween,
  DEFAULT_MARGIN_PCT,
  type MonthlySales,
  type SalesHistory,
  type SalesPeriod,
} from '../../core/sales';
import { clearMonthSummary, loadSalesEntries, recordSales } from '../../core/db';
import { styles } from '../styles';
import { color } from '../theme';
import { salesStyles as ss } from './styles';

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
  SALES_TOOK_MONTH: (month: string) => string;
  SALES_MARGIN: string;
  SALES_MARGIN_HINT: string;
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
}

type Mode =
  | { kind: 'list' }
  | { kind: 'today' }
  | { kind: 'backfill' };

export function SalesScreen({
  db,
  strings,
  onBack,
  onChanged,
}: {
  db: SQLiteDatabase;
  strings: SalesStrings;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [history, setHistory] = useState<SalesHistory | null>(null);
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(async () => {
    try {
      setHistory(calculateSalesHistory(await loadSalesEntries(db)));
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

  const done = async () => {
    await refresh();
    onChanged();
    setMode({ kind: 'list' });
  };

  if (mode.kind === 'today' || mode.kind === 'backfill') {
    return (
      <EntryScreen
        db={db}
        strings={strings}
        kind={mode.kind}
        lastMargin={history?.months[0]?.margin_pct ?? null}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={done}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{strings.SALES_TITLE}</Text>
        <View style={{ width: 50 }} />
      </View>

      {loading || !history ? null : (
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
                <Text style={ss.totalAmount}>R{history.total_profit.toFixed(2)}</Text>
                <Text style={ss.totalHint}>
                  {strings.SALES_TOTAL_HINT(
                    history.months_recorded,
                    `${history.average_margin_pct.toFixed(0)}%`
                  )}
                </Text>
              </View>

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
              onPress={() => setMode({ kind: 'today' })}
            >
              <Text style={ss.primaryButtonText}>{strings.SALES_TODAY}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [ss.secondaryButton, pressed && ss.secondaryButtonPressed]}
              android_ripple={{ color: color.ripple }}
              onPress={() => setMode({ kind: 'backfill' })}
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

function MonthRow({ month, strings }: { month: MonthlySales; strings: SalesStrings }) {
  return (
    <View style={ss.monthRow}>
      <View style={ss.monthBody}>
        <Text style={ss.monthName}>{formatMonth(month.month_key)}</Text>
        <Text style={ss.monthMeta}>
          R{month.sales.toFixed(2)} ·{' '}
          {month.source === 'days'
            ? strings.SALES_MONTH_DAYS(month.days_recorded)
            : strings.SALES_MONTH_TOTAL}
          {' · '}{month.margin_pct.toFixed(0)}%
        </Text>
      </View>
      <Text style={ss.monthProfit}>R{month.profit.toFixed(2)}</Text>
    </View>
  );
}

/**
 * One screen for both "today's takings" and "a month from the book". They ask
 * for the same two numbers; only the period differs.
 */
function EntryScreen({
  db,
  strings,
  kind,
  lastMargin,
  onCancel,
  onSaved,
}: {
  db: SQLiteDatabase;
  strings: SalesStrings;
  kind: 'today' | 'backfill';
  lastMargin: number | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const now = Date.now();
  const thisMonth = monthKey(now);

  // Offer the last 24 months, newest first. Enough for any paper book anyone
  // will actually type in, and it means January is two taps away in July.
  const [year, mon] = thisMonth.split('-').map(Number);
  const startYear = mon >= 12 ? year - 1 : year - 2;
  const options = monthsBetween(`${startYear}-${String(mon).padStart(2, '0')}`, thisMonth)
    .reverse()
    .slice(0, 24);

  const [month, setMonth] = useState(thisMonth);
  const [amount, setAmount] = useState('');
  // Default to what they said last time; the app never invents a margin
  // silently, but re-asking every day would be its own kind of rude.
  const [margin, setMargin] = useState(String(lastMargin ?? DEFAULT_MARGIN_PCT));
  const [saving, setSaving] = useState(false);

  const takings = parseFloat(amount) || 0;
  const marginPct = parseFloat(margin);
  const marginValid = !Number.isNaN(marginPct) && marginPct >= 0 && marginPct <= 100;
  const canSave = amount.trim() !== '' && takings >= 0 && marginValid && !saving;

  const keeps = marginValid ? takings * (marginPct / 100) : 0;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const period: SalesPeriod = kind === 'today' ? 'DAY' : 'MONTH';
      const key = kind === 'today' ? dayKey(now) : month;
      await recordSales(db, period, key, takings, marginPct, null, now);
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

      <View style={styles.screenHeader}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.backButton}>{strings.SALES_CANCEL}</Text>
        </Pressable>
        <Text style={styles.screenTitle}>
          {kind === 'today' ? strings.SALES_TODAY : strings.SALES_BACKFILL}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={ss.form} keyboardShouldPersistTaps="handled">
        {kind === 'backfill' && (
          <>
            <Text style={styles.inputLabel}>{strings.SALES_PICK_MONTH}</Text>
            <View style={ss.monthGrid}>
              {options.map(key => (
                <Pressable
                  key={key}
                  style={[ss.monthChip, month === key && ss.monthChipActive]}
                  onPress={() => setMonth(key)}
                >
                  <Text style={[ss.monthChipText, month === key && ss.monthChipTextActive]}>
                    {formatMonth(key)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </>
        )}

        <Text style={styles.inputLabel}>
          {kind === 'today' ? strings.SALES_TOOK_TODAY : strings.SALES_TOOK_MONTH(formatMonth(month))}
        </Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>R</Text>
          <TextInput
            style={styles.priceInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            autoFocus={kind === 'today'}
          />
        </View>

        <Text style={styles.inputLabel}>{strings.SALES_MARGIN}</Text>
        <View style={styles.priceInputRow}>
          <TextInput
            style={styles.priceInput}
            value={margin}
            onChangeText={setMargin}
            placeholder="25"
            keyboardType="number-pad"
          />
          <Text style={styles.currencyPrefix}>%</Text>
        </View>
        <Text style={styles.inputHint}>{strings.SALES_MARGIN_HINT}</Text>

        {takings > 0 && marginValid && (
          <Text style={styles.costSummary}>
            {strings.SALES_WILL_KEEP(`R${keeps.toFixed(2)}`)}
          </Text>
        )}

        {/* The margin is the owner's guess, so the answer is their guess too.
            Saying so is the difference between a tool and a fortune teller. */}
        <Text style={ss.marginNote}>{strings.SALES_MARGIN_IS_YOURS}</Text>

        <Pressable
          style={({ pressed }) => [
            styles.saveButton,
            !canSave && styles.saveButtonDisabled,
            pressed && canSave && ss.primaryButtonPressed,
          ]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SALES_SAVING : strings.SALES_SAVE}
          </Text>
        </Pressable>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
