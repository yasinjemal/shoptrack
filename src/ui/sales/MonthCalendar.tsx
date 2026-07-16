/**
 * ============================================
 * MONTH CALENDAR
 * ============================================
 *
 * Tap a month, its days open, type down the page.
 *
 * This replaced a flow where backfilling January to July meant seven separate
 * screens, each asking for one number. That is not how anyone reads a paper
 * book: they open it at January and work down the page.
 *
 * Design notes:
 * - Days are a LIST, not a 7-column grid. A grid looks like a calendar but you
 *   cannot type an amount into a 40pt square, and the owner is copying numbers
 *   down a page, not picking a date.
 * - Every day is on screen at once. No "next day" button, no confirmation per
 *   entry. Fill what you know, skip what you don't, save once.
 * - Blank is not zero. A day left empty is not recorded at all; a day typed as
 *   0 means the shop was closed. Only the second is a fact worth storing.
 * - Future days are not offered. Nobody took money next Tuesday.
 */

import React, { useMemo, useState } from 'react';
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

import {
  calculateMonth,
  dayNumber,
  daysInMonth,
  formatMonth,
  isFuture,
  isWeekend,
  monthKey,
  monthsOfYear,
  weekdayLabel,
  type SalesEntry,
} from '../../core/sales';
import { recordSalesDays } from '../../core/db';
import { styles } from '../styles';
import { color } from '../theme';
import { calendarStyles as cal } from './calendarStyles';
import type { SalesStrings } from './SalesScreen';

/**
 * Pick a month out of a year.
 *
 * Months that already have takings show them, so an owner working back through
 * their book can see where they got to without opening anything.
 */
export function YearPicker({
  entries,
  strings,
  onPick,
  onCancel,
}: {
  entries: SalesEntry[];
  strings: SalesStrings;
  onPick: (monthKey: string) => void;
  onCancel: () => void;
}) {
  const now = Date.now();
  const thisYear = new Date(now).getFullYear();
  const [year, setYear] = useState(thisYear);

  const months = monthsOfYear(year);
  const current = monthKey(now);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={styles.backButton}>{strings.SALES_CANCEL}</Text>
        </Pressable>
        <Text style={styles.screenTitle}>{strings.SALES_PICK_MONTH}</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={cal.yearBar}>
        <Pressable style={cal.yearArrow} onPress={() => setYear(y => y - 1)} hitSlop={12}>
          <Text style={cal.yearArrowText}>‹</Text>
        </Pressable>
        <Text style={cal.yearLabel}>{year}</Text>
        <Pressable
          style={[cal.yearArrow, year >= thisYear && cal.yearArrowDisabled]}
          onPress={() => year < thisYear && setYear(y => y + 1)}
          disabled={year >= thisYear}
          hitSlop={12}
        >
          <Text style={cal.yearArrowText}>›</Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={cal.monthGrid}>
        {months.map(key => {
          // A month that has not happened cannot have takings.
          const future = key > current;
          const month = calculateMonth(key, entries);
          const filled = month.source !== 'none';

          return (
            <Pressable
              key={key}
              style={({ pressed }) => [
                cal.monthTile,
                filled && cal.monthTileFilled,
                future && cal.monthTileDisabled,
                pressed && !future && cal.monthTilePressed,
              ]}
              android_ripple={future ? undefined : { color: color.ripple }}
              onPress={() => !future && onPick(key)}
              disabled={future}
            >
              <Text style={[cal.monthTileName, future && cal.monthTileNameDisabled]}>
                {formatMonth(key).split(' ')[0]}
              </Text>
              {filled ? (
                <Text style={cal.monthTileAmount}>{formatMoney(month.sales, 0)}</Text>
              ) : (
                <Text style={cal.monthTileEmpty}>{future ? '' : '—'}</Text>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Fill in one month's days.
 *
 * Pre-filled with whatever is already recorded, so re-opening a month to fix
 * one day does not mean retyping the other thirty.
 */
export function MonthCalendar({
  db,
  monthKey: month,
  entries,
  defaultMargin,
  strings,
  onCancel,
  onSaved,
}: {
  db: SQLiteDatabase;
  monthKey: string;
  entries: SalesEntry[];
  defaultMargin: number;
  strings: SalesStrings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const now = Date.now();

  const days = useMemo(
    () => daysInMonth(month).filter(d => !isFuture(d, now)),
    [month, now]
  );

  // Seed from what is already saved. '' means "not recorded", which is
  // different from '0' meaning "we were closed".
  const [amounts, setAmounts] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const e of entries) {
      if (e.period === 'DAY' && e.period_key.startsWith(`${month}-`)) {
        seed[e.period_key] = String(e.amount);
      }
    }
    return seed;
  });

  const existingMargin = entries.find(
    e => e.period === 'DAY' && e.period_key.startsWith(`${month}-`)
  )?.margin_pct;
  const [margin, setMargin] = useState(String(existingMargin ?? defaultMargin));
  const [saving, setSaving] = useState(false);

  const marginPct = parseFloat(margin);
  const marginValid = !Number.isNaN(marginPct) && marginPct >= 0 && marginPct <= 100;

  // Only days actually typed in. Blank days are skipped, not zeroed.
  const filled = days
    .filter(d => (amounts[d] ?? '').trim() !== '')
    .map(d => ({ dayKey: d, amount: parseFloat(amounts[d]) || 0 }));

  const total = filled.reduce((sum, d) => sum + d.amount, 0);
  const keeps = marginValid ? total * (marginPct / 100) : 0;
  const canSave = filled.length > 0 && marginValid && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await recordSalesDays(db, month, filled, marginPct);
      onSaved();
    } catch (error) {
      console.error('Save month error:', error);
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
        <Text style={styles.screenTitle}>{formatMonth(month)}</Text>
        <View style={{ width: 50 }} />
      </View>

      {/* The running total sits above the list, not below it: it is the thing
          the owner checks against the bottom of their page. */}
      <View style={cal.runningTotal}>
        <Text style={cal.runningTotalLabel}>
          {strings.SALES_DAYS_FILLED(filled.length, days.length)}
        </Text>
        <Text style={cal.runningTotalAmount}>{formatMoney(total)}</Text>
        {total > 0 && marginValid && (
          <Text style={cal.runningTotalProfit}>{strings.SALES_WILL_KEEP(formatMoney(keeps))}</Text>
        )}
      </View>

      <ScrollView style={cal.dayList} keyboardShouldPersistTaps="handled">
        <Text style={cal.dayListHint}>{strings.SALES_FILL_HINT}</Text>

        {days.map(d => {
          const value = amounts[d] ?? '';
          const localDate = localCalendarDayLabel(d);
          return (
            <View key={d} style={[cal.dayRow, isWeekend(d) && cal.dayRowWeekend]}>
              <View style={cal.dayLabel}>
                <Text style={cal.dayNumber}>{dayNumber(d)}</Text>
                <Text style={cal.dayWeekday}>{weekdayLabel(d)}</Text>
                {localDate && <Text style={cal.dayWeekday}>{localDate}</Text>}
              </View>

              <View style={[cal.dayInputWrap, value !== '' && cal.dayInputWrapFilled]}>
                <Text style={cal.dayCurrency}>{getCurrentCurrency().symbol}</Text>
                <TextInput
                  style={cal.dayInput}
                  value={value}
                  onChangeText={t => setAmounts(a => ({ ...a, [d]: t }))}
                  placeholder="—"
                  placeholderTextColor={color.inkMuted}
                  keyboardType="decimal-pad"
                  returnKeyType="next"
                />
              </View>
            </View>
          );
        })}

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
        <Text style={styles.inputHint}>
          {strings.SALES_MARGIN_HINT(formatMoney(100, 0), formatMoney(20, 0), formatMoney(30, 0))}
        </Text>

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Pinned, because the list is 31 rows long and the owner should never
          have to scroll to the bottom to find Save. */}
      <View style={cal.saveBar}>
        <Pressable
          style={({ pressed }) => [
            cal.saveButton,
            !canSave && cal.saveButtonDisabled,
            pressed && canSave && cal.saveButtonPressed,
          ]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={cal.saveButtonText}>
            {saving ? strings.SALES_SAVING : strings.SALES_SAVE}
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
