/**
 * ============================================
 * CASH UP SCREEN
 * ============================================
 *
 * Count the till. See whether the money that should be there, is.
 *
 * Design notes:
 * - The owner types what they counted BEFORE seeing the expected figure. If
 *   the app showed its guess first, the number typed back would be that guess.
 *   A till count that agrees with the app because the owner read it off the
 *   screen is worse than no count at all.
 * - The whole trail is shown afterwards, line by line. "You are R200 short" is
 *   an accusation unless the owner can see how the number was built. The sum
 *   is the argument.
 * - The first cash-up sets a starting float instead of reconciling, exactly
 *   like the first stock count sets a baseline. Same mental model.
 */

import React, { useState } from 'react';
import {
  Text,
  View,
  TouchableOpacity,
  SafeAreaView,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calculateExpectedCash,
  cashTurnover,
  reconcile,
  type CashFlowInputs,
  type CashUpResult,
  type ExpectedCash,
} from '../../core/cashup';
import {
  getLastCashUp,
  loadCashUps,
  loadCreditEntries,
  loadCustomers,
  loadExpenses,
  loadMovements,
  loadProducts,
  openingBalanceFrom,
  recordCashUp,
  stockPurchaseTotal,
  toCoreProduct,
  type CashUp,
} from '../../core/db';
import { calculatePeriodSummary } from '../../core/calculations';
import { calculateCreditSummary } from '../../core/credit';
import { calculateExpenseSummary } from '../../core/expenses';
import { styles } from '../styles';
import { cashUpStyles as cu } from './styles';

export interface CashUpStrings {
  ERROR_TITLE: string;
  CASHUP_TITLE: string;
  CASHUP_FIRST_TITLE: string;
  CASHUP_FIRST_HINT: string;
  CASHUP_QUESTION: string;
  CASHUP_HINT: string;
  CASHUP_SINCE: (when: string) => string;
  CASHUP_CHECK: string;
  CASHUP_CHECKING: string;
  CASHUP_SAVE: string;
  CASHUP_TRAIL_TITLE: string;
  CASHUP_LINE_OPENING: string;
  CASHUP_LINE_REVENUE: string;
  CASHUP_LINE_CREDIT: string;
  CASHUP_LINE_PAYMENTS: string;
  CASHUP_LINE_EXPENSES: string;
  CASHUP_LINE_STOCK: string;
  CASHUP_EXPECTED: string;
  CASHUP_COUNTED: string;
  CASHUP_BALANCED: string;
  CASHUP_SHORT: string;
  CASHUP_OVER: string;
  CASHUP_TAKE_OUT: string;
  CASHUP_TAKE_OUT_HINT: string;
  CASHUP_NO_COUNT_WARNING: string;
  CASHUP_DONE: string;
  CASHUP_HISTORY: string;
  CASHUP_CANCEL: string;
  CASHUP_FLOAT: string;
  CASHUP_STATEMENT_BALANCED: string;
  CASHUP_STATEMENT_OVER: (amount: string) => string;
  CASHUP_STATEMENT_SHORT_LARGE: (amount: string) => string;
  CASHUP_STATEMENT_SHORT_SMALL: (amount: string) => string;
  FORMAT_WHEN: (ts: number) => string;
  ERROR_GENERIC: string;
}

type Step =
  | { kind: 'loading' }
  | { kind: 'first' }
  | { kind: 'counting'; inputs: CashFlowInputs; since: number; hasCount: boolean }
  | { kind: 'result'; inputs: CashFlowInputs; trail: ExpectedCash; result: CashUpResult };

const LINE_KEYS = {
  opening: 'CASHUP_LINE_OPENING',
  revenue: 'CASHUP_LINE_REVENUE',
  credit_given: 'CASHUP_LINE_CREDIT',
  payments: 'CASHUP_LINE_PAYMENTS',
  expenses: 'CASHUP_LINE_EXPENSES',
  stock: 'CASHUP_LINE_STOCK',
} as const;

export function CashUpScreen({
  db,
  strings,
  onBack,
  onChanged,
}: {
  db: SQLiteDatabase;
  strings: CashUpStrings;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [step, setStep] = useState<Step>({ kind: 'loading' });
  const [history, setHistory] = useState<CashUp[]>([]);
  const [amount, setAmount] = useState('');
  const [takeOut, setTakeOut] = useState('');
  const [saving, setSaving] = useState(false);

  const load = React.useCallback(async () => {
    try {
      const last = await getLastCashUp(db);
      setHistory(await loadCashUps(db, 10));

      const opening = openingBalanceFrom(last);
      if (opening == null) {
        setStep({ kind: 'first' });
        return;
      }

      // The window runs from the last cash-up to now: that is exactly the
      // period the till has been accumulating over.
      const since = last!.recorded_at;
      const now = Date.now();

      const [products, movements, customers, entries, expenses, purchases] = await Promise.all([
        loadProducts(db),
        loadMovements(db),
        loadCustomers(db),
        loadCreditEntries(db),
        loadExpenses(db, since),
        stockPurchaseTotal(db, since, now),
      ]);

      const sales = calculatePeriodSummary(products.map(toCoreProduct), movements, since, now);
      const book = calculateCreditSummary(customers, entries, since, now, now);
      const costs = calculateExpenseSummary(expenses, since, now);

      // Revenue is inferred from stock counts. With no count in this window the
      // engine falls back to current_qty, and the sales figure is a guess --
      // which would surface as a phantom shortfall. Warn instead of pretending.
      const hasCount = movements.some(m => m.type === 'COUNT' && m.recorded_at > since);

      setStep({
        kind: 'counting',
        since,
        hasCount,
        inputs: {
          opening,
          revenue: sales.total_estimated_revenue,
          creditGiven: book.credit_given,
          paymentsReceived: book.payments_received,
          expenses: costs.total,
          stockPurchases: purchases,
        },
      });
    } catch (error) {
      console.error('Cash up load error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    }
  }, [db, strings.ERROR_GENERIC]);

  React.useEffect(() => {
    load();
  }, [load]);

  const counted = parseFloat(amount) || 0;
  const canSubmit = amount.trim() !== '' && counted >= 0 && !saving;

  const handleCheck = () => {
    if (step.kind !== 'counting' || !canSubmit) return;
    const trail = calculateExpectedCash(step.inputs);
    const result = reconcile(trail.expected, counted, cashTurnover(step.inputs));
    setStep({ kind: 'result', inputs: step.inputs, trail, result });
  };

  const handleSaveFirst = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      await recordCashUp(
        db,
        { counted, expected: 0, difference: 0 },
        { isOpening: true }
      );
      onChanged();
      onBack();
    } catch (error) {
      console.error('Cash up save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
      setSaving(false);
    }
  };

  const handleSaveResult = async () => {
    if (step.kind !== 'result') return;
    setSaving(true);
    try {
      await recordCashUp(db, step.result, { takenOut: parseFloat(takeOut) || 0 });
      onChanged();
      onBack();
    } catch (error) {
      console.error('Cash up save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
      setSaving(false);
    }
  };

  // ---- First ever cash-up: set the float, do not reconcile ----
  if (step.kind === 'first') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <Header title={strings.CASHUP_FIRST_TITLE} onBack={onBack} strings={strings} />

        <ScrollView style={cu.form}>
          <Text style={cu.question}>{strings.CASHUP_QUESTION}</Text>
          <Text style={cu.hint}>{strings.CASHUP_FIRST_HINT}</Text>

          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>R</Text>
            <TextInput
              style={styles.priceInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, !canSubmit && styles.saveButtonDisabled]}
            onPress={handleSaveFirst}
            disabled={!canSubmit}
          >
            <Text style={styles.saveButtonText}>
              {saving ? strings.CASHUP_CHECKING : strings.CASHUP_SAVE}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- Count the till. Expected is deliberately not shown yet. ----
  if (step.kind === 'counting') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <Header title={strings.CASHUP_TITLE} onBack={onBack} strings={strings} />

        <ScrollView style={cu.form}>
          <Text style={cu.question}>{strings.CASHUP_QUESTION}</Text>
          <Text style={cu.hint}>{strings.CASHUP_HINT}</Text>
          <Text style={cu.since}>{strings.CASHUP_SINCE(strings.FORMAT_WHEN(step.since))}</Text>

          {!step.hasCount && (
            <Text style={cu.warning}>{strings.CASHUP_NO_COUNT_WARNING}</Text>
          )}

          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>R</Text>
            <TextInput
              style={styles.priceInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <TouchableOpacity
            style={[styles.saveButton, !canSubmit && styles.saveButtonDisabled]}
            onPress={handleCheck}
            disabled={!canSubmit}
          >
            <Text style={styles.saveButtonText}>{strings.CASHUP_CHECK}</Text>
          </TouchableOpacity>

          {history.length > 0 && <History history={history} strings={strings} />}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ---- The verdict, with the whole sum shown ----
  if (step.kind === 'result') {
    const { result, trail } = step;
    const tone =
      result.verdict === 'balanced' ? cu.verdictOk
      : result.verdict === 'over' ? cu.verdictOver
      : cu.verdictShort;

    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <Header title={strings.CASHUP_TITLE} onBack={onBack} strings={strings} />

        <ScrollView style={cu.form}>
          <View style={[cu.verdictCard, tone]}>
            <Text style={cu.verdictIcon}>
              {result.verdict === 'balanced' ? '✓' : result.verdict === 'over' ? '↑' : '↓'}
            </Text>
            <Text style={cu.verdictLabel}>
              {result.verdict === 'balanced'
                ? strings.CASHUP_BALANCED
                : result.verdict === 'over'
                  ? strings.CASHUP_OVER
                  : strings.CASHUP_SHORT}
            </Text>
            {result.verdict !== 'balanced' && (
              <Text style={cu.verdictAmount}>R{Math.abs(result.difference).toFixed(2)}</Text>
            )}
            <Text style={cu.verdictStatement}>{describeResult(result, strings)}</Text>
          </View>

          {/* The sum is the argument: an owner told they are short deserves to
              see every line that produced the number. */}
          <Text style={cu.trailTitle}>{strings.CASHUP_TRAIL_TITLE}</Text>
          <View style={cu.trailCard}>
            {trail.lines.map(line => (
              <View key={line.key} style={cu.trailRow}>
                <Text style={cu.trailLabel}>{strings[LINE_KEYS[line.key]]}</Text>
                <Text
                  style={[
                    cu.trailAmount,
                    line.direction === 'out' && cu.trailAmountOut,
                    line.direction === 'in' && cu.trailAmountIn,
                  ]}
                >
                  {line.direction === 'out' ? '−' : line.direction === 'in' ? '+' : ''}
                  R{line.amount.toFixed(2)}
                </Text>
              </View>
            ))}

            <View style={cu.trailDivider} />

            <View style={cu.trailRow}>
              <Text style={cu.trailTotalLabel}>{strings.CASHUP_EXPECTED}</Text>
              <Text style={cu.trailTotalValue}>R{result.expected.toFixed(2)}</Text>
            </View>
            <View style={cu.trailRow}>
              <Text style={cu.trailTotalLabel}>{strings.CASHUP_COUNTED}</Text>
              <Text style={cu.trailTotalValue}>R{result.counted.toFixed(2)}</Text>
            </View>
          </View>

          <Text style={styles.inputLabel}>{strings.CASHUP_TAKE_OUT}</Text>
          <View style={styles.priceInputRow}>
            <Text style={styles.currencyPrefix}>R</Text>
            <TextInput
              style={styles.priceInput}
              value={takeOut}
              onChangeText={setTakeOut}
              placeholder="0.00"
              keyboardType="decimal-pad"
            />
          </View>
          <Text style={styles.inputHint}>{strings.CASHUP_TAKE_OUT_HINT}</Text>

          <TouchableOpacity
            style={[styles.saveButton, saving && styles.saveButtonDisabled]}
            onPress={handleSaveResult}
            disabled={saving}
          >
            <Text style={styles.saveButtonText}>
              {saving ? strings.CASHUP_CHECKING : strings.CASHUP_DONE}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <Header title={strings.CASHUP_TITLE} onBack={onBack} strings={strings} />
    </SafeAreaView>
  );
}

function Header({
  title,
  onBack,
  strings,
}: {
  title: string;
  onBack: () => void;
  strings: CashUpStrings;
}) {
  return (
    <View style={styles.screenHeader}>
      <TouchableOpacity onPress={onBack}>
        <Text style={styles.backButton}>{strings.CASHUP_CANCEL}</Text>
      </TouchableOpacity>
      <Text style={styles.screenTitle}>{title}</Text>
      <View style={{ width: 50 }} />
    </View>
  );
}

function describeResult(result: CashUpResult, strings: CashUpStrings): string {
  if (result.verdict === 'balanced') return strings.CASHUP_STATEMENT_BALANCED;
  const amount = `R${Math.abs(result.difference).toFixed(2)}`;
  if (result.verdict === 'over') return strings.CASHUP_STATEMENT_OVER(amount);
  return result.severity === 'large'
    ? strings.CASHUP_STATEMENT_SHORT_LARGE(amount)
    : strings.CASHUP_STATEMENT_SHORT_SMALL(amount);
}

function History({ history, strings }: { history: CashUp[]; strings: CashUpStrings }) {
  return (
    <View style={cu.historySection}>
      <Text style={cu.historyTitle}>{strings.CASHUP_HISTORY}</Text>
      {history.map(h => (
        <View key={h.id} style={cu.historyRow}>
          <Text style={cu.historyDate}>{strings.FORMAT_WHEN(h.recorded_at)}</Text>
          <Text style={cu.historyCounted}>R{h.counted_amount.toFixed(2)}</Text>
          {h.is_opening ? (
            <Text style={cu.historyOpening}>{strings.CASHUP_FLOAT}</Text>
          ) : (
            <Text
              style={[
                cu.historyDiff,
                h.difference < 0 && cu.historyDiffShort,
                h.difference > 0 && cu.historyDiffOver,
              ]}
            >
              {h.difference === 0
                ? '✓'
                : `${h.difference > 0 ? '+' : '−'}R${Math.abs(h.difference).toFixed(2)}`}
            </Text>
          )}
        </View>
      ))}
    </View>
  );
}
