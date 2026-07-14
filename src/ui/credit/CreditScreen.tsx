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
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateCreditSummary, type CreditSummary, type CustomerBalance } from '../../core/credit';
import { addCustomer, loadCreditEntries, loadCustomers, recordCreditEntry } from '../../core/db';
import { getPeriodBounds } from '../../core/calculations';
import { styles } from '../styles';
import { creditStyles as cs } from './styles';

type Mode =
  | { kind: 'list' }
  | { kind: 'add_customer' }
  | { kind: 'entry'; customer: CustomerBalance; type: 'CREDIT' | 'PAYMENT' };

export interface CreditStrings {
  CREDIT_TITLE: string;
  CREDIT_EMPTY: string;
  CREDIT_EMPTY_HINT: string;
  CREDIT_ALL_PAID: string;
  CREDIT_ALL_PAID_HINT: string;
  CREDIT_OUTSTANDING_LABEL: string;
  CREDIT_WEEK_SUMMARY: (given: string, paid: string) => string;
  CREDIT_STALE_TITLE: string;
  CREDIT_STALE_HINT: string;
  CREDIT_ADD_CUSTOMER: string;
  CREDIT_CUSTOMER_NAME: string;
  CREDIT_CUSTOMER_PHONE: string;
  CREDIT_PHONE_OPTIONAL: string;
  CREDIT_GIVE: string;
  CREDIT_RECEIVE: string;
  CREDIT_AMOUNT: string;
  CREDIT_NOTE: string;
  CREDIT_NOTE_HINT: string;
  CREDIT_SAVE: string;
  CREDIT_SAVING: string;
  CREDIT_DAYS_QUIET: (days: number) => string;
  CREDIT_PAID_UP: string;
  CREDIT_OWES_YOU_CHANGE: string;
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
          <Text style={styles.backButton}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.CREDIT_TITLE}</Text>
        <TouchableOpacity onPress={() => setMode({ kind: 'add_customer' })}>
          <Text style={styles.backButton}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading || !summary ? null : (
        <ScrollView style={cs.list}>
          {summary.balances.length === 0 ? (
            <EmptyBook strings={strings} onAdd={() => setMode({ kind: 'add_customer' })} />
          ) : (
            <>
              <View style={cs.totalCard}>
                <Text style={cs.totalLabel}>{strings.CREDIT_OUTSTANDING_LABEL}</Text>
                <Text style={cs.totalAmount}>R{summary.total_outstanding.toFixed(2)}</Text>
                <Text style={cs.totalHint}>
                  {strings.CREDIT_WEEK_SUMMARY(
                    `R${summary.credit_given.toFixed(2)}`,
                    `R${summary.payments_received.toFixed(2)}`
                  )}
                </Text>
              </View>

              {summary.stale_debts.length > 0 && (
                <View style={cs.staleCard}>
                  <Text style={cs.staleTitle}>{strings.CREDIT_STALE_TITLE}</Text>
                  {summary.stale_debts.map(d => (
                    <Text key={d.customer_id} style={cs.staleItem}>
                      • {d.customer_name} — R{d.balance.toFixed(2)},{' '}
                      {strings.CREDIT_DAYS_QUIET(d.days_since_activity ?? 0)}
                    </Text>
                  ))}
                  <Text style={cs.staleHint}>{strings.CREDIT_STALE_HINT}</Text>
                </View>
              )}

              {summary.balances.map(balance => (
                <CustomerRow
                  key={balance.customer_id}
                  balance={balance}
                  strings={strings}
                  onGive={() => setMode({ kind: 'entry', customer: balance, type: 'CREDIT' })}
                  onReceive={() => setMode({ kind: 'entry', customer: balance, type: 'PAYMENT' })}
                />
              ))}
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
}: {
  balance: CustomerBalance;
  strings: CreditStrings;
  onGive: () => void;
  onReceive: () => void;
}) {
  // A negative balance means the shop owes them change -- say so rather than
  // showing a minus sign the owner has to decode.
  const owesShop = balance.balance > 0;

  return (
    <View style={cs.customerCard}>
      <View style={cs.customerHeader}>
        <Text style={cs.customerName}>{balance.customer_name}</Text>
        <Text style={[cs.customerBalance, !owesShop && cs.customerBalanceCredit]}>
          R{Math.abs(balance.balance).toFixed(2)}
        </Text>
      </View>

      <Text style={cs.customerMeta}>
        {!owesShop
          ? strings.CREDIT_OWES_YOU_CHANGE
          : balance.days_since_activity != null
            ? strings.CREDIT_DAYS_QUIET(balance.days_since_activity)
            : ''}
      </Text>

      <View style={cs.customerActions}>
        <TouchableOpacity style={cs.giveButton} onPress={onGive}>
          <Text style={cs.giveButtonText}>{strings.CREDIT_GIVE}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={cs.receiveButton} onPress={onReceive}>
          <Text style={cs.receiveButtonText}>{strings.CREDIT_RECEIVE}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
  const [saving, setSaving] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await addCustomer(db, name, phone || null);
      onSaved();
    } catch (error) {
      console.error('Add customer error:', error);
      Alert.alert('Error', strings.ERROR_GENERIC);
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
        <Text style={styles.screenTitle}>{strings.CREDIT_ADD_CUSTOMER}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={cs.form}>
        <Text style={styles.inputLabel}>{strings.CREDIT_CUSTOMER_NAME}</Text>
        <TextInput
          style={styles.textInput}
          value={name}
          onChangeText={setName}
          placeholder="Thandi"
          autoFocus
        />

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
  const [saving, setSaving] = useState(false);

  const value = parseFloat(amount) || 0;
  const canSave = value > 0 && !saving;

  // Show the owner where this leaves the account before they commit.
  const projected = type === 'CREDIT'
    ? customer.balance + value
    : customer.balance - value;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await recordCreditEntry(db, customer.customer_id, type, value, notes || null);
      onSaved();
    } catch (error) {
      console.error('Record credit entry error:', error);
      Alert.alert('Error', strings.ERROR_GENERIC);
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
        <Text style={styles.screenTitle}>
          {type === 'CREDIT' ? strings.CREDIT_GIVE : strings.CREDIT_RECEIVE}
        </Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={cs.form}>
        <Text style={cs.entryCustomer}>{customer.customer_name}</Text>
        <Text style={cs.entryCurrent}>{customer.statement}</Text>

        <Text style={styles.inputLabel}>{strings.CREDIT_AMOUNT}</Text>
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

        {value > 0 && (
          <Text style={styles.costSummary}>
            {projected > 0
              ? `${customer.customer_name} will owe R${projected.toFixed(2)}`
              : projected === 0
                ? strings.CREDIT_PAID_UP
                : `You will owe R${Math.abs(projected).toFixed(2)} in change`}
          </Text>
        )}

        <Text style={styles.inputLabel}>{strings.CREDIT_NOTE}</Text>
        <TextInput
          style={styles.textInput}
          value={notes}
          onChangeText={setNotes}
          placeholder={strings.CREDIT_NOTE_HINT}
        />

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={!canSave}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.CREDIT_SAVING : strings.CREDIT_SAVE}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
