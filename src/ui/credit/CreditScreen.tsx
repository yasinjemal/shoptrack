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
 * - Nothing is ever edited or deleted. A mistake is fixed by recording the
 *   opposite entry, so the book always adds up.
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
  loadCreditEntries,
  loadCustomers,
  recordCreditEntry,
} from '../../core/db';
import { getPeriodBounds } from '../../core/calculations';
import { formatMoney, getCurrentCurrency } from '../../core/currency';
import { styles } from '../styles';
import { creditStyles as cs } from './styles';
import { buildCreditReminder, buildPaymentReceipt } from '../../core/messages';
import { renderShareMessage } from '../../i18n/messages';
import { renderCreditStatement } from '../../i18n/statements';
import { SpeakButton } from '../components/SpeakButton';
import type { Strings } from '../../i18n';

type Mode =
  | { kind: 'list' }
  | { kind: 'add_customer' }
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
  CREDIT_CUSTOMER_NAME: string;
  CREDIT_CUSTOMER_PHONE: string;
  CREDIT_PHONE_OPTIONAL: string;
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
  const [mode, setMode] = useState<Mode>({ kind: 'list' });
  const [loading, setLoading] = useState(true);

  const refresh = React.useCallback(async () => {
    try {
      const [customers, entries] = await Promise.all([
        loadCustomers(db),
        loadCreditEntries(db),
      ]);
      const week = getPeriodBounds('this_week');
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

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.CREDIT_TITLE}</Text>
        <TouchableOpacity onPress={() => setMode({ kind: 'add_customer' })}>
          <Text style={styles.backButton}>{strings.ADD}</Text>
        </TouchableOpacity>
      </View>

      {loading || !summary ? null : (
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
                  strings={strings}
                  onGive={() => setMode({ kind: 'entry', customer: balance, type: 'CREDIT' })}
                  onReceive={() => setMode({ kind: 'entry', customer: balance, type: 'PAYMENT' })}
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
      <TouchableOpacity style={styles.saveButton} onPress={onAdd}>
        <Text style={styles.saveButtonText}>{strings.CREDIT_ADD_CUSTOMER}</Text>
      </TouchableOpacity>
    </View>
  );
}

function CustomerRow({
  balance,
  strings,
  onGive,
  onReceive,
  onRemind,
}: {
  balance: CustomerBalance;
  strings: CreditStrings;
  onGive: () => void;
  onReceive: () => void;
  onRemind: () => void;
}) {
  const owesShop = balance.balance > 0;
  const isSettled = balance.balance === 0;

  // Someone who owes nothing is shown quietly, but shown. They are how you give
  // credit to a regular again.
  return (
    <View style={[cs.customerCard, isSettled && cs.customerCardSettled]}>
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

      {!isSettled && (
        <SpeakButton
          text={renderCreditStatement(balance.statement, strings as Strings)}
          strings={strings}
        />
      )}

      <View style={cs.customerActions}>
        <TouchableOpacity style={cs.giveButton} onPress={onGive}>
          <Text style={cs.giveButtonText}>{strings.CREDIT_GIVE}</Text>
        </TouchableOpacity>
        {/* Nothing to collect from someone who is square. */}
        {!isSettled && (
          <TouchableOpacity style={cs.receiveButton} onPress={onReceive}>
            <Text style={cs.receiveButtonText}>{strings.CREDIT_RECEIVE}</Text>
          </TouchableOpacity>
        )}
        {owesShop && (
          <TouchableOpacity style={cs.receiveButton} onPress={onRemind}>
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

  // Recomputed per render so a screen left open overnight does not offer
  // yesterday's Friday.
  const options = dueDateOptions();
  const value = parseFloat(amount) || 0;
  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const chosen = options.find(o => o.key === due);
      await addCustomerToBook(
        db,
        { name, phone: phone || null },
        value > 0
          ? { amount: value, notes: notes || null, dueAt: chosen?.at ?? null }
          : undefined
      );
      onSaved();
    } catch (error) {
      console.error('Add customer error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
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
        <Text style={styles.screenTitle}>{strings.CREDIT_ADD_CUSTOMER}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={cs.form} keyboardShouldPersistTaps="handled">
        <Text style={styles.inputLabel}>{strings.CREDIT_CUSTOMER_NAME}</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="Thandi"
          autoFocus
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
                <TouchableOpacity
                  key={o.key}
                  style={[cs.dueChip, due === o.key && cs.dueChipActive]}
                  onPress={() => setDue(o.key)}
                >
                  <Text style={[cs.dueChipText, due === o.key && cs.dueChipTextActive]}>
                    {strings.CREDIT_DUE_OPTION(o.key)}
                  </Text>
                </TouchableOpacity>
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
        />
        <Text style={styles.inputHint}>{strings.CREDIT_PHONE_OPTIONAL}</Text>

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.CREDIT_SAVING : strings.CREDIT_SAVE}
          </Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
      </ScrollView>
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
  const value = parseFloat(amount) || 0;
  const canSave = value > 0 && !saving;

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

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>
          {type === 'CREDIT' ? strings.CREDIT_GIVE : strings.CREDIT_RECEIVE}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={cs.form}>
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
                <TouchableOpacity
                  key={o.key}
                  style={[cs.dueChip, due === o.key && cs.dueChipActive]}
                  onPress={() => setDue(o.key)}
                >
                  <Text style={[cs.dueChipText, due === o.key && cs.dueChipTextActive]}>
                    {strings.CREDIT_DUE_OPTION(o.key)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {type === 'PAYMENT' && (
          <>
            <Text style={styles.inputLabel}>{strings.CREDIT_PAYMENT_METHOD}</Text>
            <View style={cs.dueGrid}>
              {PAYMENT_METHODS.map(method => (
                <TouchableOpacity
                  key={method}
                  style={[cs.dueChip, paymentMethod === method && cs.dueChipActive]}
                  onPress={() => setPaymentMethod(method)}
                >
                  <Text style={[cs.dueChipText, paymentMethod === method && cs.dueChipTextActive]}>
                    {paymentMethodLabel(method, strings.CREDIT_PAYMENT_METHOD_LABEL(method))}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={() => handleSave(false)}
          disabled={!canSave}
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
          >
            <Text style={styles.doneButtonText}>{strings.SHARE_RECEIPT}</Text>
          </TouchableOpacity>
        )}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
