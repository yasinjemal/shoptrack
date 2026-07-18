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
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { formatMoney, getCurrentCurrency } from '../../core/currency';
import { parsePositiveDecimal } from '../../core/userNumber';

import {
  calculateExpenseSummary,
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseSummary,
} from '../../core/expenses';
import {
  deleteExpense,
  loadExpenses,
  recordExpense,
  type AppExpense,
} from '../../core/db';
import { getPeriodBounds } from '../../core/calculations';
import type { Strings } from '../../i18n';
import { deletePhoto, resolvePhotoUri } from '../../media/photoStore';
import { styles } from '../styles';
import { expenseStyles as es } from './styles';
import { color } from '../theme';
import { ChoiceChip } from '../components/ChoiceChip';
import { KeyboardForm } from '../components/KeyboardForm';
import { LoadingState } from '../components/LoadingState';
import { ScreenHeader } from '../components/ScreenHeader';
import { PhotoField } from '../components/PhotoField';
import { registerHardwareBackOverride } from '../navigation';

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
  RECEIPT_PHOTO: string;
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
  const [expenses, setExpenses] = useState<AppExpense[]>([]);
  const [adding, setAdding] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);

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

  React.useEffect(() => {
    // AddExpenseScreen owns Back while mounted so draft receipt cleanup cannot
    // be bypassed by this list-level handler.
    if (adding) return;
    return registerHardwareBackOverride(() => {
      if (pendingDeleteId != null) {
        setPendingDeleteId(null);
        return true;
      }
      return false;
    });
  }, [adding, pendingDeleteId]);

  const handleDelete = async (expense: AppExpense) => {
    setDeletingId(expense.id);
    try {
      const deletedReceiptPath = await deleteExpense(db, expense.id);
      if (deletedReceiptPath != null) {
        try {
          // SQL owns the reference. The file is removed only after that
          // transaction succeeds; a missing file is already a clean state.
          deletePhoto(deletedReceiptPath);
        } catch (error) {
          console.warn('Receipt photo cleanup error:', error);
        }
      }
      await refresh();
      onChanged();
      setPendingDeleteId(null);
    } catch (error) {
      console.error('Delete expense error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    } finally {
      setDeletingId(null);
    }
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

      <ScreenHeader
        title={strings.EXPENSES_TITLE}
        leftLabel={strings.BACK}
        onLeft={onBack}
        rightLabel={strings.ADD}
        onRight={() => setAdding(true)}
      />

      {loading || !summary ? <LoadingState label={strings.EXPENSES_TITLE} /> : expenses.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={es.emptyIcon}>🧾</Text>
          <Text style={es.emptyTitle}>{strings.EXPENSES_EMPTY}</Text>
          <Text style={es.emptyHint}>{strings.EXPENSES_EMPTY_HINT}</Text>
          <TouchableOpacity
            style={styles.saveButton}
            accessibilityRole="button"
            accessibilityLabel={strings.EXPENSES_ADD}
            onPress={() => setAdding(true)}
          >
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
            <View key={e.id} style={es.expenseCard}>
              <View style={es.expenseRow}>
                {e.receipt_photo_path != null && (
                  <Image
                    source={{ uri: resolvePhotoUri(e.receipt_photo_path) }}
                    style={es.receiptPhoto}
                    resizeMode="cover"
                    accessible
                    accessibilityRole="image"
                    accessibilityLabel={`${strings.RECEIPT_PHOTO}: ${strings.CATEGORY_LABEL(e.category)}`}
                  />
                )}
                <Text style={es.expenseIcon} importantForAccessibility="no">
                  {CATEGORY_ICONS[e.category]}
                </Text>
                <View style={es.expenseBody}>
                  <Text style={es.expenseCategory}>{strings.CATEGORY_LABEL(e.category)}</Text>
                  {e.notes ? <Text style={es.expenseNote}>{e.notes}</Text> : null}
                  <Text style={es.expenseAmount}>{formatMoney(e.amount)}</Text>
                </View>
                <TouchableOpacity
                  style={es.removeButton}
                  accessibilityRole="button"
                  accessibilityLabel={`${strings.EXPENSES_DELETE}: ${strings.CATEGORY_LABEL(e.category)}`}
                  onPress={() => setPendingDeleteId(e.id)}
                >
                  <Text style={es.removeButtonText}>{strings.EXPENSES_DELETE}</Text>
                </TouchableOpacity>
              </View>

              {pendingDeleteId === e.id ? (
                <View style={es.confirmBox} accessibilityRole="alert">
                  <Text style={es.confirmTitle}>{strings.EXPENSES_DELETE_CONFIRM}</Text>
                  <Text style={es.confirmHint}>{strings.EXPENSES_DELETE_CONFIRM_HINT}</Text>
                  <View style={es.confirmActions}>
                    <TouchableOpacity
                      style={es.confirmCancel}
                      accessibilityRole="button"
                      onPress={() => setPendingDeleteId(null)}
                    >
                      <Text style={es.confirmCancelText}>{strings.EXPENSES_CANCEL}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={es.confirmDelete}
                      accessibilityRole="button"
                      accessibilityState={{ busy: deletingId === e.id, disabled: deletingId === e.id }}
                      disabled={deletingId === e.id}
                      onPress={() => handleDelete(e)}
                    >
                      <Text style={es.confirmDeleteText}>{strings.EXPENSES_DELETE}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
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
  const [receiptPhotoPath, setReceiptPhotoPath] = useState<string | null>(null);
  const receiptPhotoPathRef = React.useRef<string | null>(null);
  const photoCommittedRef = React.useRef(false);
  const photoCommitInFlightRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  const deleteDraftPhoto = React.useCallback((path: string | null) => {
    if (path == null) return;
    try {
      deletePhoto(path);
    } catch (error) {
      console.warn('Receipt draft photo cleanup error:', error);
    }
  }, []);

  const cleanupDraftPhoto = React.useCallback(() => {
    if (photoCommittedRef.current || photoCommitInFlightRef.current) return;
    const draftPath = receiptPhotoPathRef.current;
    receiptPhotoPathRef.current = null;
    deleteDraftPhoto(draftPath);
  }, [deleteDraftPhoto]);

  const handlePhotoChange = React.useCallback((nextPath: string | null) => {
    if (!mountedRef.current) {
      deleteDraftPhoto(nextPath);
      return;
    }
    if (photoCommitInFlightRef.current) {
      if (nextPath !== receiptPhotoPathRef.current) deleteDraftPhoto(nextPath);
      return;
    }
    const previousPath = receiptPhotoPathRef.current;
    if (previousPath !== nextPath) deleteDraftPhoto(previousPath);
    receiptPhotoPathRef.current = nextPath;
    setReceiptPhotoPath(nextPath);
  }, [deleteDraftPhoto]);

  const handleCancel = React.useCallback(() => {
    if (photoCommitInFlightRef.current) return;
    cleanupDraftPhoto();
    onCancel();
  }, [cleanupDraftPhoto, onCancel]);

  React.useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupDraftPhoto();
    };
  }, [cleanupDraftPhoto]);

  React.useEffect(() => registerHardwareBackOverride(() => {
    if (photoCommitInFlightRef.current) return true;
    handleCancel();
    return true;
  }), [handleCancel]);

  const parsedValue = parsePositiveDecimal(amount);
  const value = parsedValue ?? 0;
  const canSave = category !== null && parsedValue !== null && !saving;

  const handleSave = async () => {
    if (!canSave || !category || photoCommitInFlightRef.current) return;
    photoCommitInFlightRef.current = true;
    setSaving(true);
    try {
      await recordExpense(
        db,
        category,
        value,
        notes || null,
        Date.now(),
        receiptPhotoPath
      );
      photoCommittedRef.current = true;
      receiptPhotoPathRef.current = null;
      onSaved();
    } catch (error) {
      console.error('Record expense error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
        setSaving(false);
      } else if (!photoCommittedRef.current) {
        const failedDraftPath = receiptPhotoPathRef.current;
        receiptPhotoPathRef.current = null;
        deleteDraftPhoto(failedDraftPath);
      }
    } finally {
      photoCommitInFlightRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader
        title={strings.EXPENSES_ADD}
        leftLabel={strings.EXPENSES_CANCEL}
        onLeft={handleCancel}
      />

      <KeyboardForm style={es.form}>
        <Text style={styles.inputLabel}>{strings.EXPENSES_CATEGORY}</Text>
        <View style={es.categoryGrid}>
          {EXPENSE_CATEGORIES.map(c => (
            <ChoiceChip
              key={c}
              label={strings.CATEGORY_LABEL(c)}
              icon={CATEGORY_ICONS[c]}
              selected={category === c}
              onPress={() => setCategory(c)}
            />
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
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.EXPENSES_AMOUNT}
            keyboardType="decimal-pad"
          />
        </View>

        <Text style={styles.inputLabel}>{strings.EXPENSES_NOTE}</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder={strings.EXPENSES_NOTE_HINT}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.EXPENSES_NOTE}
        />

        <PhotoField
          strings={strings as Strings}
          purpose="receipt"
          label={strings.RECEIPT_PHOTO}
          photoPath={receiptPhotoPath}
          onChange={handlePhotoChange}
          disabled={saving}
        />

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.EXPENSES_SAVE}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.EXPENSES_SAVING : strings.EXPENSES_SAVE}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </KeyboardForm>
    </SafeAreaView>
  );
}
