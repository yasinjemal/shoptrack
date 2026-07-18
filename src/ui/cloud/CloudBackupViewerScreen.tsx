import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { formatMoneyInCurrency } from '../../core/currency';
import type { RemoteShopSnapshot } from '../../core/remoteViewer';
import type { Strings } from '../../i18n';
import { ScreenHeader } from '../components/ScreenHeader';
import { registerHardwareBackOverride } from '../navigation';
import { border, color, elevation, numeric, radius, space, type } from '../theme';

const PAGE_SIZE = 50;

export function CloudBackupViewerScreen({
  snapshot,
  strings,
  onBack,
}: {
  snapshot: RemoteShopSnapshot;
  strings: Strings;
  onBack: () => void;
}) {
  const [productLimit, setProductLimit] = useState(PAGE_SIZE);
  const [customerLimit, setCustomerLimit] = useState(PAGE_SIZE);
  const [expenseLimit, setExpenseLimit] = useState(PAGE_SIZE);
  const [salesLimit, setSalesLimit] = useState(PAGE_SIZE);
  const money = (amount: number, decimals?: number) => (
    formatMoneyInCurrency(amount, snapshot.currencyCode, decimals)
  );

  useEffect(
    () => registerHardwareBackOverride(() => {
      onBack();
      return true;
    }),
    [onBack]
  );

  return (
    <SafeAreaView style={vs.container}>
      <StatusBar style="dark" />
      <ScreenHeader
        title={snapshot.shopName ?? strings.CLOUD_VIEWER_TITLE}
        leftLabel={strings.BACK}
        onLeft={onBack}
      />
      <ScrollView contentContainerStyle={vs.content}>
        <View style={vs.readOnlyBanner} accessibilityRole="summary">
          <Text style={vs.readOnlyTitle}>{strings.CLOUD_VIEWER_TITLE}</Text>
          <Text style={vs.readOnlyText}>{strings.CLOUD_VIEWER_READ_ONLY}</Text>
        </View>

        <Text style={vs.snapshotDate}>
          {strings.CLOUD_VIEWER_BACKUP_AT(
            snapshot.backupCreatedAt == null
              ? strings.NOT_AVAILABLE
              : strings.FORMAT_WHEN(snapshot.backupCreatedAt)
          )}
        </Text>

        <ViewerSection title={strings.CLOUD_VIEWER_OVERVIEW}>
          <Metric label={strings.PRODUCTS_LABEL} value={String(snapshot.products.length)} />
          <Metric
            label={strings.CLOUD_VIEWER_STOCK_VALUE}
            value={money(snapshot.stockSellingValue)}
          />
          <Metric
            label={strings.CREDIT_OUTSTANDING_LABEL}
            value={money(snapshot.totalOutstanding)}
            tone="amber"
          />
          <Metric
            label={strings.CLOUD_VIEWER_TOTAL_EXPENSES}
            value={money(snapshot.totalExpenses)}
            tone="red"
          />
          <Metric
            label={strings.CLOUD_VIEWER_TOTAL_TAKINGS}
            value={money(snapshot.totalSales)}
          />
          <Metric
            label={strings.CLOUD_VIEWER_ESTIMATED_PROFIT}
            value={money(snapshot.salesBookProfit)}
            tone="green"
          />
        </ViewerSection>

        {snapshot.latestCount && (
          <ViewerSection title={strings.YOUR_PROFIT}>
            <Text style={vs.rowMeta}>{strings.FORMAT_WHEN(snapshot.latestCount.completedAt)}</Text>
            {snapshot.latestCount.profit == null ? (
              <Text style={vs.empty}>{strings.COUNT_BASELINE}</Text>
            ) : (
              <>
                <Text style={vs.heroMoney}>{money(snapshot.latestCount.profit)}</Text>
                <Text style={vs.rowMeta}>
                  {strings.CLOUD_VIEWER_COUNT_RESULT(
                    snapshot.latestCount.unitsSold ?? 0,
                    money(snapshot.latestCount.revenue ?? 0)
                  )}
                </Text>
              </>
            )}
          </ViewerSection>
        )}

        {snapshot.latestCashUp && (
          <ViewerSection title={strings.CASHUP_HISTORY}>
            <Text style={vs.rowMeta}>{strings.FORMAT_WHEN(snapshot.latestCashUp.recordedAt)}</Text>
            <Metric label={strings.CASHUP_COUNTED} value={money(snapshot.latestCashUp.countedAmount)} />
            {!snapshot.latestCashUp.isOpening && (
              <>
                <Metric label={strings.CASHUP_EXPECTED} value={money(snapshot.latestCashUp.expectedAmount)} />
                <Text style={[
                  vs.cashVerdict,
                  snapshot.latestCashUp.difference < 0 && vs.redText,
                  snapshot.latestCashUp.difference > 0 && vs.amberText,
                ]}>
                  {snapshot.latestCashUp.difference === 0
                    ? strings.CASHUP_BALANCED
                    : snapshot.latestCashUp.difference < 0
                      ? `${strings.CASHUP_SHORT}: ${money(Math.abs(snapshot.latestCashUp.difference))}`
                      : `${strings.CASHUP_OVER}: ${money(snapshot.latestCashUp.difference)}`}
                </Text>
              </>
            )}
          </ViewerSection>
        )}

        <ViewerSection title={strings.PRODUCTS_LABEL}>
          {snapshot.products.length === 0 ? (
            <Empty strings={strings} />
          ) : snapshot.products.slice(0, productLimit).map(product => (
            <View key={product.id} style={vs.row}>
              <Text style={vs.rowTitle}>{product.name}</Text>
              <Text style={vs.rowMeta}>
                {strings.PRODUCT_META(
                  product.currentQuantity,
                  product.unitLabel,
                  product.sellPrice == null ? null : money(product.sellPrice),
                  product.buyPrice == null ? null : money(product.buyPrice)
                )}
              </Text>
            </View>
          ))}
          <More
            visible={productLimit < snapshot.products.length}
            label={strings.SHOW_MORE}
            onPress={() => setProductLimit(limit => limit + PAGE_SIZE)}
          />
        </ViewerSection>

        <ViewerSection title={strings.CREDIT_TITLE}>
          {snapshot.customers.length === 0 ? (
            <Empty strings={strings} />
          ) : snapshot.customers.slice(0, customerLimit).map(customer => (
            <View key={customer.id} style={vs.row}>
              <View style={vs.rowSplit}>
                <Text style={vs.rowTitle}>{customer.name}</Text>
                <Text style={[
                  vs.rowAmount,
                  customer.balance > 0 ? vs.amberText : customer.balance < 0 ? vs.redText : undefined,
                ]}>
                  {money(Math.abs(customer.balance))}
                </Text>
              </View>
              {customer.phone && <Text style={vs.rowMeta}>{customer.phone}</Text>}
              <Text style={vs.rowMeta}>
                {customer.balance > 0
                  ? strings.CREDIT_CURRENT_OWES(money(customer.balance))
                  : customer.balance < 0
                    ? strings.CREDIT_CURRENT_CHANGE(money(Math.abs(customer.balance)))
                    : strings.CREDIT_PAID_UP_TAG}
              </Text>
            </View>
          ))}
          <More
            visible={customerLimit < snapshot.customers.length}
            label={strings.SHOW_MORE}
            onPress={() => setCustomerLimit(limit => limit + PAGE_SIZE)}
          />
        </ViewerSection>

        <ViewerSection title={strings.EXPENSES_TITLE}>
          {snapshot.expenses.length === 0 ? (
            <Empty strings={strings} />
          ) : snapshot.expenses.slice(0, expenseLimit).map(expense => (
            <View key={expense.id} style={vs.row}>
              <View style={vs.rowSplit}>
                <Text style={vs.rowTitle}>{strings.CATEGORY_LABEL(expense.category)}</Text>
                <Text style={[vs.rowAmount, vs.redText]}>{money(expense.amount)}</Text>
              </View>
              <Text style={vs.rowMeta}>{strings.FORMAT_WHEN(expense.recordedAt)}</Text>
              {expense.notes && <Text style={vs.rowBody}>{expense.notes}</Text>}
            </View>
          ))}
          <More
            visible={expenseLimit < snapshot.expenses.length}
            label={strings.SHOW_MORE}
            onPress={() => setExpenseLimit(limit => limit + PAGE_SIZE)}
          />
        </ViewerSection>

        <ViewerSection title={strings.SALES_TITLE}>
          {snapshot.salesMonths.length === 0 ? (
            <Empty strings={strings} />
          ) : snapshot.salesMonths.slice(0, salesLimit).map(month => (
            <View key={month.month_key} style={vs.row}>
              <Text style={vs.rowTitle}>{month.month_key}</Text>
              <Text style={vs.rowBody}>
                {month.source === 'days'
                  ? strings.STAT_SALES_DAYS(
                      month.month_key,
                      money(month.sales),
                      money(month.profit),
                      month.days_recorded
                    )
                  : strings.STAT_SALES_MONTH(
                      month.month_key,
                      money(month.sales),
                      money(month.profit)
                    )}
              </Text>
            </View>
          ))}
          <More
            visible={salesLimit < snapshot.salesMonths.length}
            label={strings.SHOW_MORE}
            onPress={() => setSalesLimit(limit => limit + PAGE_SIZE)}
          />
        </ViewerSection>
      </ScrollView>
    </SafeAreaView>
  );
}

function ViewerSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={vs.section}>
      <Text style={vs.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'green' | 'red' | 'amber';
}) {
  return (
    <View style={vs.metric}>
      <Text style={vs.metricLabel}>{label}</Text>
      <Text style={[
        vs.metricValue,
        tone === 'green' && vs.greenText,
        tone === 'red' && vs.redText,
        tone === 'amber' && vs.amberText,
      ]}>
        {value}
      </Text>
    </View>
  );
}

function Empty({ strings }: { strings: Strings }) {
  return <Text style={vs.empty}>{strings.CLOUD_VIEWER_NO_ROWS}</Text>;
}

function More({
  visible,
  label,
  onPress,
}: {
  visible: boolean;
  label: string;
  onPress: () => void;
}) {
  if (!visible) return null;
  return (
    <TouchableOpacity
      style={vs.more}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
    >
      <Text style={vs.moreText}>{label}</Text>
    </TouchableOpacity>
  );
}

const vs = StyleSheet.create({
  container: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.base, gap: space.base, paddingBottom: space['3xl'] },
  readOnlyBanner: {
    padding: space.base,
    gap: space.xs,
    borderRadius: radius.lg,
    borderWidth: border.hairline,
    borderColor: color.infoBorder,
    backgroundColor: color.infoSoft,
  },
  readOnlyTitle: { ...type.h2, color: color.infoInk },
  readOnlyText: { ...type.body, color: color.infoInk },
  snapshotDate: { ...type.label, color: color.inkMuted },
  section: {
    padding: space.base,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
    ...elevation.card,
  },
  sectionTitle: { ...type.h2, color: color.ink },
  metric: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    borderBottomWidth: border.hairline,
    borderBottomColor: color.border,
  },
  metricLabel: { ...type.body, color: color.inkSecondary, flex: 1 },
  metricValue: { ...type.bodyStrong, ...numeric, color: color.ink },
  heroMoney: { ...type.display, ...numeric, color: color.greenInk },
  cashVerdict: { ...type.bodyStrong, color: color.greenInk },
  row: {
    gap: space.xs,
    paddingVertical: space.sm,
    borderBottomWidth: border.hairline,
    borderBottomColor: color.border,
  },
  rowSplit: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: space.md,
  },
  rowTitle: { ...type.bodyStrong, color: color.ink, flexShrink: 1 },
  rowAmount: { ...type.bodyStrong, ...numeric, color: color.ink },
  rowBody: { ...type.body, color: color.inkSecondary },
  rowMeta: { ...type.label, color: color.inkMuted },
  empty: { ...type.body, color: color.inkMuted, paddingVertical: space.sm },
  more: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: border.hairline,
    borderColor: color.borderStrong,
    borderRadius: radius.md,
  },
  moreText: { ...type.bodyStrong, color: color.infoInk },
  greenText: { color: color.greenInk },
  redText: { color: color.redInk },
  amberText: { color: color.amberInk },
});
