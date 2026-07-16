/**
 * ============================================
 * EXPENSES SCREEN
 * ============================================
 *
 * What the shop paid out this month, and what that leaves.
 *
 * Design notes:
 * - Scoped to the month, not the week. Rent and electricity arrive monthly,
 *   so a weekly lens would show a huge number one week and nothing the next.
 * - Categories are tap-to-pick, not typed. Faster at the counter, and it keeps
 *   the totals meaningful.
 * - There is no "stock" category on purpose. Buying stock is already counted
 *   as cost by the profit engine; recording it here too would charge the owner
 *   twice. Deliveries belong in Stock In.
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
import { formatMoney, getCurrentCurrency } from '../../core/currency';

import {
  calculateExpenseSummary,
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  type Expense,
  type ExpenseCategory,
  type ExpenseSummary,
} from '../../core/expenses';
import { deleteExpense, loadExpenses, recordExpense } from '../../core/db';
import { getPeriodBounds } from '../../core/calculations';
import { styles } from '../styles';
import { expenseStyles as es } from './styles';

export interface ExpenseStrings {
  BACK: string;
  ADD: string;
  ERROR_TITLE: string;
  EXPENSES_TITLE: string;
  EXPENSES_EMPTY: string;
  EXPENSES_EMPTY_HINT: string;
  EXPENSES_MONTH_LABEL: string;
  EXPENSES_ADD: string;
  EXPENSES_AMOUNT: string;
  EXPENSES_CATEGORY: string;
  EXPENSES_NOTE: string;
  EXPENSES_NOTE_HINT: string;
  EXPENSES_SAVE: string;
  EXPENSES_SAVING: string;
  EXPENSES_NOT_STOCK: string;
  EXPENSES_DELETE_CONFIRM: string;
  EXPENSES_DELETE_CONFIRM_HINT: string;
  EXPENSES_DELETE: string;
  EXPENSES_CANCEL: string;
  CATEGORY_LABEL: (category: ExpenseCategory) => string;
  ERROR_GENERIC: string;
}

export function ExpensesScreen({
  db,
  strings,
  onBack,
  onChanged,
}: {
  db: SQLiteDatabase;
  strings: ExpenseStrings;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [summary, setSummary] = useState<ExpenseSummary | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const month = getPeriodBounds('this_month');
      const rows = await loadExpenses(db, month.start);
      setExpenses(rows);
      setSummary(calculateExpenseSummary(rows, month.start, month.end));
    } catch (error) {
      console.error('Load expenses error:', error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDelete = (expense: Expense) => {
    Alert.alert(
      strings.EXPENSES_DELETE_CONFIRM,
      strings.EXPENSES_DELETE_CONFIRM_HINT,
      [
        { text: strings.EXPENSES_CANCEL, style: 'cancel' },
        {
          text: strings.EXPENSES_DELETE,
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteExpense(db, expense.id);
              await refresh();
              onChanged();
            } catch (error) {
              console.error('Delete expense error:', error);
              Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
            }
          },
        },
      ]
    );
  };

  if (adding) {
    return (
      <AddExpenseScreen
        db={db}
        strings={strings}
        onCancel={() => setAdding(false)}
        onSaved={async () => {
          await refresh();
          onChanged();
          setAdding(false);
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.EXPENSES_TITLE}</Text>
        <TouchableOpacity onPress={() => setAdding(true)}>
          <Text style={styles.backButton}>{strings.ADD}</Text>
        </TouchableOpacity>
      </View>

      {loading || !summary ? null : expenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={es.emptyIcon}>🧾</Text>
          <Text style={es.emptyTitle}>{strings.EXPENSES_EMPTY}</Text>
          <Text style={es.emptyHint}>{strings.EXPENSES_EMPTY_HINT}</Text>
          <TouchableOpacity style={styles.saveButton} onPress={() => setAdding(true)}>
            <Text style={styles.saveButtonText}>{strings.EXPENSES_ADD}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={es.list}>
          <View style={es.totalCard}>
            <Text style={es.totalLabel}>{strings.EXPENSES_MONTH_LABEL}</Text>
            <Text style={es.totalAmount}>{formatMoney(summary.total)}</Text>
          </View>

          {summary.by_category.length > 1 && (
            <View style={es.breakdownCard}>
              {summary.by_category.map(c => (
                <View key={c.category} style={es.breakdownRow}>
                  <Text style={es.breakdownIcon}>{CATEGORY_ICONS[c.category]}</Text>
                  <Text style={es.breakdownName}>{strings.CATEGORY_LABEL(c.category)}</Text>
                  <Text style={es.breakdownShare}>{c.share}%</Text>
                  <Text style={es.breakdownAmount}>{formatMoney(c.total)}</Text>
                </View>
              ))}
            </View>
          )}

          {expenses.map(e => (
            <TouchableOpacity
              key={e.id}
              style={es.expenseRow}
              onLongPress={() => handleDelete(e)}
            >
              <Text style={es.expenseIcon}>{CATEGORY_ICONS[e.category]}</Text>
              <View style={es.expenseBody}>
                <Text style={es.expenseCategory}>{strings.CATEGORY_LABEL(e.category)}</Text>
                {e.notes ? <Text style={es.expenseNote}>{e.notes}</Text> : null}
              </View>
              <Text style={es.expenseAmount}>{formatMoney(e.amount)}</Text>
            </TouchableOpacity>
          ))}

          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function AddExpenseScreen({
  db,
  strings,
  onCancel,
  onSaved,
}: {
  db: SQLiteDatabase;
  strings: ExpenseStrings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [category, setCategory] = useState<ExpenseCategory | null>(null);
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const value = parseFloat(amount) || 0;
  const canSave = category !== null && value > 0 && !saving;

  const handleSave = async () => {
    if (!canSave || !category) return;
    setSaving(true);
    try {
      await recordExpense(db, category, value, notes || null);
      onSaved();
    } catch (error) {
      console.error('Record expense error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.EXPENSES_CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.EXPENSES_ADD}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={es.form}>
        <Text style={styles.inputLabel}>{strings.EXPENSES_CATEGORY}</Text>
        <View style={es.categoryGrid}>
          {EXPENSE_CATEGORIES.map(c => (
            <TouchableOpacity
              key={c}
              style={[es.categoryChip, category === c && es.categoryChipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={es.categoryChipIcon}>{CATEGORY_ICONS[c]}</Text>
              <Text style={[es.categoryChipText, category === c && es.categoryChipTextActive]}>
                {strings.CATEGORY_LABEL(c)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Said out loud, because an owner who logs deliveries here would be
            charged for their stock twice and see a loss that isn't real. */}
        <Text style={es.notStockHint}>{strings.EXPENSES_NOT_STOCK}</Text>

        <Text style={styles.inputLabel}>{strings.EXPENSES_AMOUNT}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.inputLabel}>{strings.EXPENSES_NOTE}</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder={strings.EXPENSES_NOTE_HINT}
        />

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.EXPENSES_SAVING : strings.EXPENSES_SAVE}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
