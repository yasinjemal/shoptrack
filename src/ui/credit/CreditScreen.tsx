/**
 * ============================================
 * CREDIT BOOK SCREEN
 * ============================================
 *
 * The shop's book -- izikweletu. Who owes what, who paid.
 *
 * Design notes:
 * - The list is the screen. An owner opens this to answer one question:
 *   "who owes me money?" That answer is visible without tapping anything.
 * - Giving credit and taking payment are two taps from that list, because
 *   both happen with a customer standing at the counter.
 * - Ledger entries are never edited or deleted. A mistake is fixed by
 *   recording the opposite entry, so the book always adds up. A paid-up
 *   customer can be removed from the active list without touching history.
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
  Share,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  calculateCreditSummary,
  dueDateOptions,
  PAYMENT_METHODS,
  type CreditSummary,
  type CustomerBalance,
  type DueOptionKey,
  type PaymentMethod,
} from '../../core/credit';
import { paymentMethodLabel } from '../../core/countryPacks';
import {
  addCustomerToBook,
  deactivateCustomer,
  loadCreditEntries,
  loadCustomers,
  recordCreditEntry,
  setCustomerPhotoPath,
} from '../../core/db';
import { getPeriodBounds } from '../../core/calculations';
import { formatMoney, getCurrentCurrency } from '../../core/currency';
import { parseNonNegativeDecimal, parsePositiveDecimal } from '../../core/userNumber';
import { deletePhoto, resolvePhotoUri } from '../../media/photoStore';
import { styles } from '../styles';
import { creditStyles as cs } from './styles';
import { buildCreditReminder, buildPaymentReceipt } from '../../core/messages';
import { renderShareMessage } from '../../i18n/messages';
import { renderCreditStatement } from '../../i18n/statements';
import { SpeakButton } from '../components/SpeakButton';
import type { Strings } from '../../i18n';
import { ChoiceChip } from '../components/ChoiceChip';
import { KeyboardForm } from '../components/KeyboardForm';
import { LoadingState } from '../components/LoadingState';
import { ScreenHeader } from '../components/ScreenHeader';
import { PhotoField } from '../components/PhotoField';
import { registerHardwareBackOverride } from '../navigation';

type Mode =
  | { kind: 'list' }
  | { kind: 'add_customer' }
  | {
      kind: 'manage_customer';
      customer: CustomerBalance;
      photoPath: string | null;
    }
  | { kind: 'entry'; customer: CustomerBalance; type: 'CREDIT' | 'PAYMENT' };

export interface CreditStrings {
  BACK: string;
  ADD: string;
  CANCEL: string;
  ERROR_TITLE: string;
  CREDIT_TITLE: string;
  CREDIT_EMPTY: string;
  CREDIT_EMPTY_HINT: string;
  CREDIT_ALL_PAID: string;
  CREDIT_ALL_PAID_HINT: string;
  CREDIT_OUTSTANDING_LABEL: string;
  CREDIT_WEEK_SUMMARY: (given: string, paid: string) => string;
  CREDIT_STALE_TITLE: string;
  CREDIT_STALE_HINT: string;
  CREDIT_OVERDUE_TITLE: string;
  CREDIT_OVERDUE_HINT: string;
  CREDIT_ADD_CUSTOMER: string;
  CREDIT_MANAGE_CUSTOMER: string;
  CREDIT_REMOVE_CUSTOMER: string;
  CREDIT_REMOVE_CUSTOMER_CONFIRM: (name: string) => string;
  CREDIT_CUSTOMER_NAME: string;
  CREDIT_CUSTOMER_PHONE: string;
  CREDIT_PHONE_OPTIONAL: string;
  CUSTOMER_PHOTO: string;
  CREDIT_TAKING_NOW: string;
  CREDIT_TAKING_HINT: string;
  CREDIT_WHEN_PAY: string;
  CREDIT_DUE_OPTION: (key: DueOptionKey) => string;
  CREDIT_GIVE: string;
  CREDIT_RECEIVE: string;
  CREDIT_AMOUNT: string;
  CREDIT_NOTE: string;
  CREDIT_NOTE_HINT: string;
  CREDIT_SAVE: string;
  CREDIT_SAVING: string;
  CREDIT_DAYS_QUIET: (days: number) => string;
  CREDIT_DUE_IN: (days: number) => string;
  CREDIT_OVERDUE_BY: (days: number) => string;
  CREDIT_PAID_UP: string;
  CREDIT_PAID_UP_TAG: string;
  CREDIT_OWES_YOU_CHANGE: string;
  CREDIT_CURRENT_OWES: (amount: string) => string;
  CREDIT_CURRENT_CHANGE: (amount: string) => string;
  CREDIT_PAYMENT_METHOD: string;
  CREDIT_PAYMENT_METHOD_LABEL: (method: PaymentMethod) => string;
  CREDIT_PROJECTED_OWES: (name: string, amount: string) => string;
  CREDIT_PROJECTED_CHANGE: (amount: string) => string;
  SHARE_REMINDER: string;
  SHARE_RECEIPT: string;
  SHARE_CREDIT_REMINDER: (name: string, amount: string, days: number | null) => string;
  SHARE_CREDIT_OVERDUE: (name: string, amount: string, days: number) => string;
  SHARE_PAYMENT_RECEIPT: (name: string, amount: string, method: string, remaining: string, when: string) => string;
  SHARE_COUNT_SUMMARY: (units: number, profit: string, counts: number) => string;
  SHARE_CASHUP_VERDICT: (verdict: 'balanced' | 'short' | 'over') => string;
  SHARE_CASHUP_SUMMARY: (verdict: string, counted: string, expected: string, gap: string, digital: string) => string;
  SHARE_SIGNOFF: (shop: string) => string;
  FORMAT_WHEN: (ts: number) => string;
  READ_ALOUD: string;
  STOP_READING: string;
  SPEECH_LOCALE: string;
  ERROR_GENERIC: string;
}

export function CreditScreen({
  db,
  strings,
  onBack,
  onChanged,
}: {
  db: SQLiteDatabase;
  strings: CreditStrings;
  onBack: () => void;
  onChanged: () => void;
}) {
  const [summary, setSummary] = useState<CreditSummary | null>(null);
  const [customerPhotoPaths, setCustomerPhotoPaths] = useState<Map<number, string>>(new Map());
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const [customers, entries] = await Promise.all([
        loadCustomers(db),
        loadCreditEntries(db),
      ]);
      const week = getPeriodBounds('this_week');
      setCustomerPhotoPaths(new Map(
        customers.flatMap(customer =>
          customer.photo_path == null ? [] : [[customer.id, customer.photo_path] as const]
        )
      ));
      setSummary(calculateCreditSummary(customers, entries, week.start, week.end));
    } catch (error) {
      console.error('Load credit error:', error);
    } finally {
      setLoading(false);
    }
  }, [db]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  React.useEffect(() => {
    // Photo forms own Back while mounted so they can delete an uncommitted
    // draft before leaving. The parent remains the fallback for the list and
    // ledger-entry form.
    if (mode.kind === 'add_customer' || mode.kind === 'manage_customer') return;
    return registerHardwareBackOverride(() => {
      if (mode.kind === 'list') return false;
      setMode({ kind: 'list' });
      return true;
    });
  }, [mode.kind]);

  if (mode.kind === 'add_customer') {
    return (
      <AddCustomerScreen
        db={db}
        strings={strings}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => {
          await refresh();
          setMode({ kind: 'list' });
        }}
      />
    );
  }

  if (mode.kind === 'manage_customer') {
    return (
      <ManageCustomerScreen
        db={db}
        strings={strings}
        customer={mode.customer}
        initialPhotoPath={mode.photoPath}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={() => {
          void refresh();
          onChanged();
          setMode({ kind: 'list' });
        }}
        onDeactivated={() => {
          void refresh();
          onChanged();
          setMode({ kind: 'list' });
        }}
      />
    );
  }

  if (mode.kind === 'entry') {
    return (
      <RecordEntryScreen
        db={db}
        strings={strings}
        customer={mode.customer}
        type={mode.type}
        onCancel={() => setMode({ kind: 'list' })}
        onSaved={async () => {
          await refresh();
          onChanged();
          setMode({ kind: 'list' });
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader
        title={strings.CREDIT_TITLE}
        leftLabel={strings.BACK}
        onLeft={onBack}
        rightLabel={strings.ADD}
        onRight={() => setMode({ kind: 'add_customer' })}
      />

      {loading || !summary ? <LoadingState label={strings.CREDIT_TITLE} /> : (
        <ScrollView style={cs.list}>
          {/* Renders from everyone, NOT balances. Someone who owes nothing
              must stay visible and reachable -- otherwise a person vanishes the
              moment they are added and can never be given credit. */}
          {summary.everyone.length === 0 ? (
            <EmptyBook strings={strings} onAdd={() => setMode({ kind: 'add_customer' })} />
          ) : (
            <>
              {summary.total_outstanding > 0 && (
                <View style={cs.totalCard}>
                  <Text style={cs.totalLabel}>{strings.CREDIT_OUTSTANDING_LABEL}</Text>
                  <Text style={cs.totalAmount}>{formatMoney(summary.total_outstanding)}</Text>
                  <Text style={cs.totalHint}>
                    {strings.CREDIT_WEEK_SUMMARY(
                      formatMoney(summary.credit_given),
                      formatMoney(summary.payments_received)
                    )}
                  </Text>
                </View>
              )}

              {/* A broken promise is more actionable than silence, so it leads. */}
              {summary.overdue_debts.length > 0 && (
                <View style={cs.overdueCard}>
                  <Text style={cs.overdueTitle}>{strings.CREDIT_OVERDUE_TITLE}</Text>
                  {summary.overdue_debts.map(d => (
                    <Text key={d.customer_id} style={cs.overdueItem}>
                      • {d.customer_name} — {formatMoney(d.balance)},{' '}
                      {strings.CREDIT_OVERDUE_BY(d.days_overdue ?? 0)}
                    </Text>
                  ))}
                  <Text style={cs.overdueHint}>{strings.CREDIT_OVERDUE_HINT}</Text>
                </View>
              )}

              {summary.stale_debts.length > 0 && (
                <View style={cs.staleCard}>
                  <Text style={cs.staleTitle}>{strings.CREDIT_STALE_TITLE}</Text>
                  {summary.stale_debts.map(d => (
                    <Text key={d.customer_id} style={cs.staleItem}>
                      • {d.customer_name} — {formatMoney(d.balance)},{' '}
                      {strings.CREDIT_DAYS_QUIET(d.days_since_activity ?? 0)}
                    </Text>
                  ))}
                  <Text style={cs.staleHint}>{strings.CREDIT_STALE_HINT}</Text>
                </View>
              )}

              {summary.everyone.map(balance => (
                <CustomerRow
                  key={balance.customer_id}
                  balance={balance}
                  photoPath={customerPhotoPaths.get(balance.customer_id) ?? null}
                  strings={strings}
                  onGive={() => setMode({ kind: 'entry', customer: balance, type: 'CREDIT' })}
                  onReceive={() => setMode({ kind: 'entry', customer: balance, type: 'PAYMENT' })}
                  onManage={() => setMode({
                    kind: 'manage_customer',
                    customer: balance,
                    photoPath: customerPhotoPaths.get(balance.customer_id) ?? null,
                  })}
                  onRemind={() => {
                    if (balance.balance <= 0) return;
                    void Share.share({ message: renderShareMessage(buildCreditReminder(balance), strings) });
                  }}
                />
              ))}

              <View style={{ height: 32 }} />
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function EmptyBook({ strings, onAdd }: { strings: CreditStrings; onAdd: () => void }) {
  return (
    <View style={styles.emptyState}>
      <Text style={cs.emptyIcon}>📖</Text>
      <Text style={cs.emptyTitle}>{strings.CREDIT_EMPTY}</Text>
      <Text style={cs.emptyHint}>{strings.CREDIT_EMPTY_HINT}</Text>
      <TouchableOpacity
        style={styles.saveButton}
        accessibilityRole="button"
        accessibilityLabel={strings.CREDIT_ADD_CUSTOMER}
        onPress={onAdd}
      >
        <Text style={styles.saveButtonText}>{strings.CREDIT_ADD_CUSTOMER}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomerRow({
  balance,
  photoPath,
  strings,
  onGive,
  onReceive,
  onManage,
  onRemind,
}: {
  balance: CustomerBalance;
  photoPath: string | null;
  strings: CreditStrings;
  onGive: () => void;
  onReceive: () => void;
  onManage: () => void;
  onRemind: () => void;
}) {
  const owesShop = balance.balance > 0;
  const isSettled = balance.balance === 0;

  // Someone who owes nothing is shown quietly, but shown. They are how you give
  // credit to a regular again.
  return (
    <View style={[cs.customerCard, isSettled && cs.customerCardSettled]}>
      <View style={cs.customerSummaryRow}>
        {photoPath != null && (
          <Image
            source={{ uri: resolvePhotoUri(photoPath) }}
            style={cs.customerPhoto}
            resizeMode="cover"
            accessible
            accessibilityRole="image"
            accessibilityLabel={`${strings.CUSTOMER_PHOTO}: ${balance.customer_name}`}
          />
        )}
        <View style={cs.customerSummaryBody}>
          <View style={cs.customerHeader}>
            <Text style={cs.customerName}>{balance.customer_name}</Text>
            {isSettled ? (
              <Text style={cs.customerSettledTag}>{strings.CREDIT_PAID_UP_TAG}</Text>
            ) : (
              <Text style={[cs.customerBalance, !owesShop && cs.customerBalanceCredit]}>
                {formatMoney(Math.abs(balance.balance))}
              </Text>
            )}
          </View>

          <Text style={[cs.customerMeta, balance.is_overdue && cs.customerMetaOverdue]}>
            {describeMeta(balance, strings)}
          </Text>
        </View>
      </View>

      {!isSettled && (
        <SpeakButton
          text={renderCreditStatement(balance.statement, strings as Strings)}
          strings={strings}
        />
      )}

      <View style={cs.customerActions}>
        <TouchableOpacity
          style={cs.manageButton}
          accessibilityRole="button"
          accessibilityLabel={strings.CREDIT_MANAGE_CUSTOMER}
          onPress={onManage}
        >
          <Text style={cs.manageButtonText}>{strings.CREDIT_MANAGE_CUSTOMER}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={cs.giveButton}
          accessibilityRole="button"
          accessibilityLabel={strings.CREDIT_GIVE}
          onPress={onGive}
        >
          <Text style={cs.giveButtonText}>{strings.CREDIT_GIVE}</Text>
        </TouchableOpacity>
        {/* Nothing to collect from someone who is square. */}
        {!isSettled && (
          <TouchableOpacity
            style={cs.receiveButton}
            accessibilityRole="button"
            accessibilityLabel={strings.CREDIT_RECEIVE}
            onPress={onReceive}
          >
            <Text style={cs.receiveButtonText}>{strings.CREDIT_RECEIVE}</Text>
          </TouchableOpacity>
        )}
        {owesShop && (
          <TouchableOpacity
            style={cs.receiveButton}
            accessibilityRole="button"
            accessibilityLabel={strings.SHARE_REMINDER}
            onPress={onRemind}
          >
            <Text style={cs.receiveButtonText}>{strings.SHARE_REMINDER}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

/**
 * The single most useful line under a name. Ordered by what an owner would ask
 * first: are they late, when are they due, then how long it has been quiet.
 */
function describeMeta(balance: CustomerBalance, strings: CreditStrings): string {
  if (balance.balance === 0) return '';
  if (balance.balance < 0) return strings.CREDIT_OWES_YOU_CHANGE;

  if (balance.is_overdue) {
    return strings.CREDIT_OVERDUE_BY(balance.days_overdue ?? 0);
  }

  if (balance.due_at != null) {
    const days = Math.max(0, Math.ceil((balance.due_at - Date.now()) / (24 * 60 * 60 * 1000)));
    return strings.CREDIT_DUE_IN(days);
  }

  return balance.days_since_activity != null
    ? strings.CREDIT_DAYS_QUIET(balance.days_since_activity)
    : '';
}

function describeCurrent(balance: CustomerBalance, strings: CreditStrings): string {
  if (balance.balance === 0) return strings.CREDIT_PAID_UP;
  const amount = formatMoney(Math.abs(balance.balance));
  return balance.balance > 0
    ? strings.CREDIT_CURRENT_OWES(amount)
    : strings.CREDIT_CURRENT_CHANGE(amount);
}

function discardManagedCustomerPhoto(path: string | null): void {
  if (path == null) return;
  try {
    deletePhoto(path);
  } catch (error) {
    // SQL owns the logical reference. A best-effort filesystem cleanup must
    // not turn a completed save/deactivation into a user-visible failure.
    console.warn('Managed customer photo cleanup failed:', error);
  }
}

/**
 * Manage the one mutable piece of customer identity currently stored by the
 * app: their optional photo. Credit history remains append-only. Removing a
 * customer is available only when their live balance is exactly zero, and the
 * database repeats that check so stale UI can never hide an outstanding debt.
 */
function ManageCustomerScreen({
  db,
  strings,
  customer,
  initialPhotoPath,
  onCancel,
  onSaved,
  onDeactivated,
}: {
  db: SQLiteDatabase;
  strings: CreditStrings;
  customer: CustomerBalance;
  initialPhotoPath: string | null;
  onCancel: () => void;
  onSaved: () => void;
  onDeactivated: () => void;
}) {
  const [photoPath, setPhotoPath] = useState<string | null>(initialPhotoPath);
  const [saving, setSaving] = useState(false);
  const originalPhotoRef = React.useRef<string | null>(initialPhotoPath);
  const currentPhotoRef = React.useRef<string | null>(initialPhotoPath);
  const mountedRef = React.useRef(true);
  const operationRef = React.useRef(false);
  const finishedRef = React.useRef(false);

  const cleanupDraftPhoto = React.useCallback(() => {
    if (finishedRef.current || operationRef.current) return;
    const original = originalPhotoRef.current;
    const current = currentPhotoRef.current;
    currentPhotoRef.current = original;
    if (current != null && current !== original) {
      discardManagedCustomerPhoto(current);
    }
  }, []);

  const handlePhotoChange = React.useCallback((nextPath: string | null) => {
    const original = originalPhotoRef.current;
    if (!mountedRef.current) {
      if (nextPath != null && nextPath !== original) {
        discardManagedCustomerPhoto(nextPath);
      }
      return;
    }
    if (operationRef.current) {
      if (
        nextPath != null
        && nextPath !== original
        && nextPath !== currentPhotoRef.current
      ) {
        discardManagedCustomerPhoto(nextPath);
      }
      return;
    }

    const current = currentPhotoRef.current;
    if (current != null && current !== original && current !== nextPath) {
      discardManagedCustomerPhoto(current);
    }
    currentPhotoRef.current = nextPath;
    setPhotoPath(nextPath);
  }, []);

  const handleCancel = React.useCallback(() => {
    if (operationRef.current) return;
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
    if (operationRef.current) return true;
    handleCancel();
    return true;
  }), [handleCancel]);

  const cleanupFailedUnmountedDraft = () => {
    const original = originalPhotoRef.current;
    const failedDraftPath = currentPhotoRef.current;
    currentPhotoRef.current = original;
    if (failedDraftPath != null && failedDraftPath !== original) {
      discardManagedCustomerPhoto(failedDraftPath);
    }
  };

  const handleSave = async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    setSaving(true);
    let saved = false;
    const nextPath = currentPhotoRef.current;
    try {
      // The database reference changes first. Only after it commits is the
      // returned previous file safe to remove.
      const replacedPath = await setCustomerPhotoPath(
        db,
        customer.customer_id,
        nextPath
      );
      finishedRef.current = true;
      currentPhotoRef.current = null;
      if (replacedPath != null && replacedPath !== nextPath) {
        discardManagedCustomerPhoto(replacedPath);
      }
      saved = true;
    } catch (error) {
      console.error('Update customer photo error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
        setSaving(false);
      } else {
        cleanupFailedUnmountedDraft();
      }
    } finally {
      operationRef.current = false;
    }
    if (saved && mountedRef.current) onSaved();
  };

  const deactivate = async () => {
    // Repeat the visible-button condition before touching storage. The core
    // adapter independently recomputes the ledger balance in its transaction.
    if (customer.balance !== 0 || operationRef.current) return;
    operationRef.current = true;
    setSaving(true);
    let deactivated = false;
    try {
      const persistedPath = await deactivateCustomer(db, customer.customer_id);
      const draftPath = currentPhotoRef.current;
      finishedRef.current = true;
      currentPhotoRef.current = null;
      discardManagedCustomerPhoto(persistedPath);
      if (draftPath != null && draftPath !== persistedPath) {
        discardManagedCustomerPhoto(draftPath);
      }
      deactivated = true;
    } catch (error) {
      console.error('Deactivate customer error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
        setSaving(false);
      } else {
        cleanupFailedUnmountedDraft();
      }
    } finally {
      operationRef.current = false;
    }
    if (deactivated && mountedRef.current) onDeactivated();
  };

  const handleDeactivate = () => {
    if (customer.balance !== 0 || operationRef.current) return;
    Alert.alert(
      strings.CREDIT_REMOVE_CUSTOMER,
      strings.CREDIT_REMOVE_CUSTOMER_CONFIRM(customer.customer_name),
      [
        { text: strings.CANCEL, style: 'cancel' },
        {
          text: strings.CREDIT_REMOVE_CUSTOMER,
          style: 'destructive',
          onPress: () => { void deactivate(); },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      <ScreenHeader
        title={strings.CREDIT_MANAGE_CUSTOMER}
        leftLabel={strings.CANCEL}
        onLeft={handleCancel}
      />

      <KeyboardForm style={cs.form}>
        <View style={cs.manageCustomerIntro}>
          <Text style={cs.entryCustomer}>{customer.customer_name}</Text>
          <Text style={cs.entryCurrent}>
            {customer.balance === 0
              ? strings.CREDIT_PAID_UP_TAG
              : describeCurrent(customer, strings)}
          </Text>
        </View>

        <PhotoField
          strings={strings as Strings}
          purpose="customer"
          label={strings.CUSTOMER_PHOTO}
          photoPath={photoPath}
          onChange={handlePhotoChange}
          disabled={saving}
        />

        <TouchableOpacity
          style={[styles.saveButton, saving && styles.saveButtonDisabled]}
          onPress={() => { void handleSave(); }}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={strings.CREDIT_SAVE}
          accessibilityState={{ disabled: saving, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.CREDIT_SAVING : strings.CREDIT_SAVE}
          </Text>
        </TouchableOpacity>

        {customer.balance === 0 && (
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={handleDeactivate}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={strings.CREDIT_REMOVE_CUSTOMER}
            accessibilityState={{ disabled: saving }}
          >
            <Text style={styles.deleteButtonText}>{strings.CREDIT_REMOVE_CUSTOMER}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </KeyboardForm>
    </SafeAreaView>
  );
}

/**
 * Add someone to the book.
 *
 * Leads with what they are taking, because that is the actual moment: a
 * customer is at the counter with bread in their hand. The earlier version
 * captured only a name, which meant the owner had to add a person and then go
 * find them to attach the debt -- a step nobody would take, and one that did
 * not even work.
 *
 * Only the name is required. Amount, note, phone and the promised day are all
 * optional: any one of them being mandatory is a reason to skip recording the
 * debt at all, and a debt in the app beats a perfect record that never happens.
 */
function AddCustomerScreen({
  db,
  strings,
  onCancel,
  onSaved,
}: {
  db: SQLiteDatabase;
  strings: CreditStrings;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState<DueOptionKey | null>(null);
  const [saving, setSaving] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const photoPathRef = React.useRef<string | null>(null);
  const photoCommittedRef = React.useRef(false);
  const photoCommitInFlightRef = React.useRef(false);
  const mountedRef = React.useRef(true);

  const deleteDraftPhoto = React.useCallback((path: string | null) => {
    if (path == null) return;
    try {
      deletePhoto(path);
    } catch (error) {
      console.warn('Customer draft photo cleanup error:', error);
    }
  }, []);

  const cleanupDraftPhoto = React.useCallback(() => {
    // A write in flight owns the draft until its outcome is known. Deleting it
    // during unmount could leave a successful transaction pointing at no file.
    if (photoCommittedRef.current || photoCommitInFlightRef.current) return;
    const draftPath = photoPathRef.current;
    photoPathRef.current = null;
    deleteDraftPhoto(draftPath);
  }, [deleteDraftPhoto]);

  const handlePhotoChange = React.useCallback((nextPath: string | null) => {
    // PhotoField may finish a native picker after this form has already left.
    // Such a late result is still a draft and must not become an orphan.
    if (!mountedRef.current) {
      deleteDraftPhoto(nextPath);
      return;
    }
    if (photoCommitInFlightRef.current) {
      if (nextPath !== photoPathRef.current) deleteDraftPhoto(nextPath);
      return;
    }
    const previousPath = photoPathRef.current;
    if (previousPath !== nextPath) deleteDraftPhoto(previousPath);
    photoPathRef.current = nextPath;
    setPhotoPath(nextPath);
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

  // Recomputed per render so a screen left open overnight does not offer
  // yesterday's Friday.
  const options = dueDateOptions();
  const amountBlank = amount.trim() === '';
  const parsedValue = amountBlank ? null : parseNonNegativeDecimal(amount);
  const value = parsedValue ?? 0;
  const amountValid = amountBlank || parsedValue !== null;
  const canSave = name.trim().length > 0 && amountValid && !saving;

  const handleSave = async () => {
    if (!canSave || photoCommitInFlightRef.current) return;
    photoCommitInFlightRef.current = true;
    setSaving(true);
    try {
      const chosen = options.find(o => o.key === due);
      await addCustomerToBook(
        db,
        { name, phone: phone || null, photoPath },
        value > 0
          ? { amount: value, notes: notes || null, dueAt: chosen?.at ?? null }
          : undefined
      );
      photoCommittedRef.current = true;
      photoPathRef.current = null;
      onSaved();
    } catch (error) {
      console.error('Add customer error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
        setSaving(false);
      } else if (!photoCommittedRef.current) {
        const failedDraftPath = photoPathRef.current;
        photoPathRef.current = null;
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
        title={strings.CREDIT_ADD_CUSTOMER}
        leftLabel={strings.CANCEL}
        onLeft={handleCancel}
      />

      <KeyboardForm style={cs.form}>
        <Text style={styles.inputLabel}>{strings.CREDIT_CUSTOMER_NAME}</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="Thandi"
          autoFocus
          accessibilityLabel={strings.CREDIT_CUSTOMER_NAME}
        />

        <Text style={styles.inputLabel}>{strings.CREDIT_TAKING_NOW}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            accessibilityLabel={strings.CREDIT_TAKING_NOW}
          />
        </View>
        <Text style={styles.inputHint}>{strings.CREDIT_TAKING_HINT}</Text>

        {/* The rest only matters once there is a debt to describe. */}
        {value > 0 && (
          <>
            <Text style={styles.inputLabel}>{strings.CREDIT_NOTE}</Text>
            <TextInput
              style={styles.textInput}
              value={notes}
              onChangeText={setNotes}
              placeholder={strings.CREDIT_NOTE_HINT}
            />

            <Text style={styles.inputLabel}>{strings.CREDIT_WHEN_PAY}</Text>
            <View style={cs.dueGrid}>
              {options.map(o => (
                <ChoiceChip
                  key={o.key}
                  label={strings.CREDIT_DUE_OPTION(o.key)}
                  selected={due === o.key}
                  onPress={() => setDue(o.key)}
                />
              ))}
            </View>
          </>
        )}

        <Text style={styles.inputLabel}>{strings.CREDIT_CUSTOMER_PHONE}</Text>
        <TextInput
          style={styles.textInput}
          value={phone}
          onChangeText={setPhone}
          placeholder="072 000 0000"
          keyboardType="phone-pad"
          accessibilityLabel={strings.CREDIT_CUSTOMER_PHONE}
        />
        <Text style={styles.inputHint}>{strings.CREDIT_PHONE_OPTIONAL}</Text>

        <PhotoField
          strings={strings as Strings}
          purpose="customer"
          label={strings.CUSTOMER_PHOTO}
          photoPath={photoPath}
          onChange={handlePhotoChange}
          disabled={saving}
        />

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.CREDIT_SAVE}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.CREDIT_SAVING : strings.CREDIT_SAVE}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </KeyboardForm>
    </SafeAreaView>
  );
}

function RecordEntryScreen({
  db,
  strings,
  customer,
  type,
  onCancel,
  onSaved,
}: {
  db: SQLiteDatabase;
  strings: CreditStrings;
  customer: CustomerBalance;
  type: 'CREDIT' | 'PAYMENT';
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [due, setDue] = useState<DueOptionKey | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('CASH');
  const [saving, setSaving] = useState(false);

  const options = dueDateOptions();
  const parsedValue = parsePositiveDecimal(amount);
  const value = parsedValue ?? 0;
  const canSave = parsedValue !== null && !saving;

  // Show the owner where this leaves the account before they commit.
  const projected = type === 'CREDIT'
    ? customer.balance + value
    : customer.balance - value;

  const handleSave = async (shareReceipt = false) => {
    if (!canSave) return;
    setSaving(true);
    try {
      const chosen = options.find(o => o.key === due);
      await recordCreditEntry(
        db,
        customer.customer_id,
        type,
        value,
        notes || null,
        chosen?.at ?? null,
        Date.now(),
        type === 'PAYMENT' ? paymentMethod : null
      );
      if (shareReceipt && type === 'PAYMENT') {
        await Share.share({
          message: renderShareMessage(
            buildPaymentReceipt(
              customer.customer_name,
              value,
              paymentMethod,
              projected,
              Date.now()
            ),
            strings
          ),
        });
      }
      onSaved();
    } catch (error) {
      console.error('Record credit entry error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader
        title={type === 'CREDIT' ? strings.CREDIT_GIVE : strings.CREDIT_RECEIVE}
        leftLabel={strings.CANCEL}
        onLeft={onCancel}
      />

      <KeyboardForm style={cs.form}>
        <Text style={cs.entryCustomer}>{customer.customer_name}</Text>
        <Text style={cs.entryCurrent}>{describeCurrent(customer, strings)}</Text>

        <Text style={styles.inputLabel}>{strings.CREDIT_AMOUNT}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
            autoFocus
            accessibilityLabel={strings.CREDIT_AMOUNT}
          />
        </View>

        {value > 0 && (
          <Text style={styles.costSummary}>
            {projected > 0
              ? strings.CREDIT_PROJECTED_OWES(customer.customer_name, formatMoney(projected))
              : projected === 0
                ? strings.CREDIT_PAID_UP
                : strings.CREDIT_PROJECTED_CHANGE(formatMoney(Math.abs(projected)))}
          </Text>
        )}

        <Text style={styles.inputLabel}>{strings.CREDIT_NOTE}</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder={strings.CREDIT_NOTE_HINT}
        />

        {/* Only a debt can be promised. A payment has already happened. */}
        {type === 'CREDIT' && (
          <>
            <Text style={styles.inputLabel}>{strings.CREDIT_WHEN_PAY}</Text>
            <View style={cs.dueGrid}>
              {options.map(o => (
                <ChoiceChip
                  key={o.key}
                  label={strings.CREDIT_DUE_OPTION(o.key)}
                  selected={due === o.key}
                  onPress={() => setDue(o.key)}
                />
              ))}
            </View>
          </>
        )}

        {type === 'PAYMENT' && (
          <>
            <Text style={styles.inputLabel}>{strings.CREDIT_PAYMENT_METHOD}</Text>
            <View style={cs.dueGrid}>
              {PAYMENT_METHODS.map(method => (
                <ChoiceChip
                  key={method}
                  label={paymentMethodLabel(method, strings.CREDIT_PAYMENT_METHOD_LABEL(method))}
                  selected={paymentMethod === method}
                  onPress={() => setPaymentMethod(method)}
                />
              ))}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={() => handleSave(false)}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.CREDIT_SAVE}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.CREDIT_SAVING : strings.CREDIT_SAVE}
          </Text>
        </TouchableOpacity>

        {type === 'PAYMENT' && (
          <TouchableOpacity
            style={[styles.doneButton, !canSave && styles.saveButtonDisabled]}
            onPress={() => handleSave(true)}
            disabled={!canSave}
            accessibilityRole="button"
            accessibilityLabel={strings.SHARE_RECEIPT}
            accessibilityState={{ disabled: !canSave, busy: saving }}
          >
            <Text style={styles.doneButtonText}>{strings.SHARE_RECEIPT}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </KeyboardForm>
    </SafeAreaView>
  );
}
