/**
 * ============================================
 * WEEKLY SUMMARY SCREEN ("This Week")
 * ============================================
 *
 * Gross profit for the week, net once expenses exist, the top product, a
 * comparison to last week, money tied up in slow stock, and what mostly
 * sold. Confidence language scales with how often the owner counted.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calculatePeriodSummary, getPeriodBounds } from '../../core/calculations';
import { formatMoney } from '../../core/currency';
import {
  calculateExpenseSummary,
  calculateNetProfit,
  type NetProfit,
} from '../../core/expenses';
import { loadExpenses, loadMovements, toCoreProduct, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';

// How far back to load movements beyond the reporting period. The engine
// needs prior history to establish an opening quantity for each product.
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Tier 4.2: Slow stock item
interface SlowStockItem {
  name: string;
  value: number;
}

// Tier 4.4: Sales breakdown item
interface SalesBreakdownItem {
  name: string;
  percentage: number;
}

interface WeeklySummary {
  totalProfit: number;      // Gross: revenue - cost of goods sold
  net: NetProfit;           // Gross minus expenses recorded this week
  topProduct: { name: string; profit: number } | null;
  lastWeekProfit: number | null;
  isFirstWeek: boolean;
  hasCountsThisWeek: boolean;
  countThisWeek: number;  // Tier 3.2: for confidence signal
  hasStockIns: boolean;   // Tier 3.2: for missing data acknowledgement
  slowStockValue: number; // Tier 4.2: total value of slow-moving stock
  slowStockItems: SlowStockItem[]; // Tier 4.2: top slow items
  salesBreakdown: SalesBreakdownItem[]; // Tier 4.4: what you mostly sold
}

export function WeeklySummaryScreen({
  products,
  db,
  strings,
  onBack,
}: {
  products: AppProduct[];
  db: SQLiteDatabase;
  strings: Strings;
  onBack: () => void;
}) {
  const [summary, setSummary] = useState<WeeklySummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadWeeklySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadWeeklySummary = async () => {
    try {
      const thisWeek = getPeriodBounds('this_week');
      const lastWeek = getPeriodBounds('last_week');

      // One read covers both weeks plus the history the engine needs to
      // establish opening quantities.
      const movements = await loadMovements(db, lastWeek.start - THIRTY_DAYS_MS);
      const coreProducts = products.map(toCoreProduct);

      const thisWeekSummary = calculatePeriodSummary(
        coreProducts,
        movements,
        thisWeek.start,
        thisWeek.end
      );

      const countsThisWeek = movements.filter(
        m => m.type === 'COUNT' && m.recorded_at >= thisWeek.start
      );
      const hasCountsThisWeek = countsThisWeek.length > 0;

      // Tier 3.2: how many distinct count sessions happened this week
      const countSessionsThisWeek = await db.getAllAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM count_sessions
         WHERE completed_at IS NOT NULL AND completed_at >= ?`,
        [thisWeek.start]
      );
      const countThisWeek = countSessionsThisWeek[0]?.count || 0;

      // Tier 3.2: Check if any stock-ins exist this week
      const hasStockIns = movements.some(
        m => m.type === 'STOCK_IN' && m.recorded_at >= thisWeek.start
      );

      // First week means no counts recorded before this week started
      const isFirstWeek = !movements.some(
        m => m.type === 'COUNT' && m.recorded_at < thisWeek.start
      );

      // Only products with both prices produce a profit we can stand behind.
      const priced = new Set(
        products.filter(p => p.buy_price != null && p.sell_price != null).map(p => p.id)
      );
      const sellingMetrics = thisWeekSummary.products.filter(
        m => priced.has(m.product_id) && m.estimated_sold > 0
      );

      const totalProfit = sellingMetrics.reduce((sum, m) => sum + m.estimated_profit, 0);

      const topProduct = sellingMetrics.length > 0
        ? sellingMetrics.reduce((best, m) => (m.estimated_profit > best.estimated_profit ? m : best))
        : null;

      // Last week, for the comparison line
      let lastWeekProfit: number | null = null;
      if (!isFirstWeek) {
        const lastWeekSummary = calculatePeriodSummary(
          coreProducts,
          movements,
          lastWeek.start,
          lastWeek.end
        );
        const lastWeekTotal = lastWeekSummary.products
          .filter(m => priced.has(m.product_id) && m.estimated_sold > 0)
          .reduce((sum, m) => sum + m.estimated_profit, 0);

        if (lastWeekTotal > 0) {
          lastWeekProfit = lastWeekTotal;
        }
      }

      const soldThisWeekById = new Map(
        sellingMetrics.map(m => [m.product_id, m])
      );

      // Net profit for the same window. Expenses are cash-basis: they land in
      // the week they were paid. A month's rent paid on Monday therefore hits
      // that week in full, which is what actually happened to the till.
      const weekExpenses = calculateExpenseSummary(
        await loadExpenses(db, thisWeek.start),
        thisWeek.start,
        thisWeek.end
      );
      const net = calculateNetProfit(totalProfit, weekExpenses.total);

      // Tier 4.2: Calculate slow-moving stock (money tied up)
      const slowStockItems: SlowStockItem[] = [];
      let slowStockValue = 0;
      const SLOW_STOCK_THRESHOLD = 100; // Only show items worth 100+ in the selected currency

      for (const product of products) {
        // Skip products with no stock or no buy price
        if (product.current_qty <= 0 || !product.buy_price) continue;

        const stockValue = product.current_qty * product.buy_price;
        if (stockValue < SLOW_STOCK_THRESHOLD) continue;

        // Check if this product sold anything this week
        const soldThisWeek = soldThisWeekById.get(product.id);

        if (!soldThisWeek) {
          // This product didn't sell this week
          slowStockValue += stockValue;
          slowStockItems.push({
            name: product.name,
            value: Math.round(stockValue),
          });
        }
      }

      // Sort by value and take top 3
      slowStockItems.sort((a, b) => b.value - a.value);
      const topSlowItems = slowStockItems.slice(0, 3);

      // Tier 4.4: Calculate sales breakdown (what you mostly sold)
      const salesBreakdown: SalesBreakdownItem[] = [];
      const productSales = sellingMetrics.map(m => ({
        name: m.product_name,
        units: m.estimated_sold,
      }));
      const totalUnitsSold = productSales.reduce((sum, s) => sum + s.units, 0);

      // Calculate percentages and take top 3
      if (totalUnitsSold > 0) {
        productSales.sort((a, b) => b.units - a.units);
        productSales.slice(0, 3).forEach(item => {
          salesBreakdown.push({
            name: item.name,
            percentage: Math.round((item.units / totalUnitsSold) * 100),
          });
        });
      }

      setSummary({
        totalProfit,
        net,
        topProduct: topProduct
          ? { name: topProduct.product_name, profit: topProduct.estimated_profit }
          : null,
        lastWeekProfit,
        isFirstWeek,
        hasCountsThisWeek,
        countThisWeek,
        hasStockIns,
        slowStockValue: Math.round(slowStockValue),
        slowStockItems: topSlowItems,
        salesBreakdown,
      });

    } catch (error) {
      console.error('Load weekly summary error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#4CAF50" />
        </View>
      </SafeAreaView>
    );
  }

  // Render based on state
  const renderContent = () => {
    if (!summary) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyNoData}>{strings.ERROR_GENERIC}</Text>
        </View>
      );
    }

    // First week, no baseline yet
    if (summary.isFirstWeek && !summary.hasCountsThisWeek) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyFirstWeek}>
              {strings.WEEKLY_FIRST_WEEK}
            </Text>
            <Text style={styles.weeklyFirstWeekHint}>
              {strings.WEEKLY_FIRST_WEEK_HINT}
            </Text>
          </View>
        </View>
      );
    }

    // No counts this week
    if (!summary.hasCountsThisWeek) {
      return (
        <View style={styles.weeklyContent}>
          <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyNoData}>{strings.WEEKLY_NO_COUNTS}</Text>
            <Text style={styles.weeklyNoDataHint}>
              {strings.WEEKLY_NO_COUNTS_HINT}
            </Text>
          </View>
        </View>
      );
    }

    // Calculate comparison
    const comparison = summary.lastWeekProfit !== null
      ? summary.totalProfit - summary.lastWeekProfit
      : null;

    // Tier 3.2: Determine confidence level
    const getConfidenceLabel = () => {
      if (summary.countThisWeek >= 4) return strings.CONFIDENCE_RELIABLE;
      if (summary.countThisWeek >= 2) return strings.CONFIDENCE_CLEARER;
      return strings.CONFIDENCE_EARLY;
    };

    return (
      <View style={styles.weeklyContent}>
        <Text style={styles.weeklyHeading}>{strings.WEEKLY_HEADING}</Text>

        {/* Main profit */}
        <View style={styles.weeklyCard}>
          <Text style={styles.weeklyLabel}>{strings.WEEKLY_YOU_MADE}</Text>
          <Text style={styles.weeklyProfit}>{strings.WEEKLY_PROFIT(formatMoney(summary.totalProfit, 0))}</Text>

          {/* Tier 3.2: Confidence signals */}
          <Text style={styles.confidenceCount}>
            {strings.BASED_ON_COUNTS(summary.countThisWeek)}
          </Text>
          <Text style={styles.confidenceLevel}>
            {getConfidenceLabel()}
          </Text>
        </View>

        {/* Net profit: what the sales figure leaves once costs are paid.
            Shown only once expenses exist, otherwise it would just repeat the
            gross number and imply the owner keeps all of it. */}
        {summary.net.has_expense_data ? (
          <View style={styles.netCard}>
            <View style={styles.netRow}>
              <Text style={styles.netRowLabel}>{strings.NET_FROM_SALES}</Text>
              <Text style={styles.netRowValue}>{formatMoney(summary.net.gross_profit)}</Text>
            </View>
            <View style={styles.netRow}>
              <Text style={styles.netRowLabel}>{strings.NET_EXPENSES}</Text>
              <Text style={styles.netRowCost}>−{formatMoney(summary.net.expenses)}</Text>
            </View>
            <View style={styles.netDivider} />
            <View style={styles.netRow}>
              <Text style={styles.netKeptLabel}>
                {summary.net.is_loss ? strings.NET_LOSS : strings.NET_KEPT}
              </Text>
              <Text style={[styles.netKeptValue, summary.net.is_loss && styles.netKeptLoss]}>
                {formatMoney(Math.abs(summary.net.net_profit))}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.netNoExpenses}>{strings.NET_NO_EXPENSES}</Text>
        )}

        {/* Top product */}
        {summary.topProduct && (
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyLabel}>{strings.WEEKLY_TOP_PRODUCT}</Text>
            <Text style={styles.weeklyTopProduct}>
              {summary.topProduct.name} ({formatMoney(summary.topProduct.profit, 0)})
            </Text>
          </View>
        )}

        {/* Comparison to last week */}
        {comparison !== null && (
          <View style={styles.weeklyCard}>
            <Text style={styles.weeklyLabel}>{strings.WEEKLY_COMPARED}</Text>
            <Text style={[
              styles.weeklyComparison,
              comparison >= 0 ? styles.weeklyComparisonUp : styles.weeklyComparisonDown
            ]}>
              {comparison >= 0
                ? strings.WEEKLY_MORE(formatMoney(Math.abs(comparison), 0))
                : strings.WEEKLY_LESS(formatMoney(Math.abs(comparison), 0))}
            </Text>
          </View>
        )}

        {/* First week with data */}
        {summary.isFirstWeek && summary.hasCountsThisWeek && (
          <View style={styles.weeklyHintCard}>
            <Text style={styles.weeklyHint}>
              {strings.WEEKLY_KEEP_COUNTING}
            </Text>
          </View>
        )}

        {/* Tier 4.2: Money Tied Up in Slow Stock */}
        {summary.slowStockValue > 0 && summary.slowStockItems.length > 0 && (
          <View style={styles.slowStockCard}>
            <Text style={styles.slowStockTitle}>{strings.SLOW_STOCK_TITLE}</Text>
            <Text style={styles.slowStockValue}>~{formatMoney(summary.slowStockValue)}</Text>
            <View style={styles.slowStockList}>
              {summary.slowStockItems.map((item) => (
                <Text key={item.name} style={styles.slowStockItem}>
                  • {item.name} — {formatMoney(item.value)} ({strings.SLOW_STOCK_LABEL})
                </Text>
              ))}
            </View>
            <Text style={styles.slowStockHint}>{strings.SLOW_STOCK_HINT}</Text>
          </View>
        )}

        {/* Tier 4.4: Owner Memory - What you mostly sold */}
        {summary.salesBreakdown.length > 0 && (
          <View style={styles.ownerMemoryCard}>
            <Text style={styles.ownerMemoryTitle}>{strings.OWNER_MEMORY_TITLE}</Text>
            {summary.salesBreakdown.map((item) => (
              <Text key={item.name} style={styles.ownerMemoryItem}>
                • {item.name} ({item.percentage}%)
              </Text>
            ))}
          </View>
        )}

        {/* Tier 3.2: Missing data acknowledgement */}
        {!summary.hasStockIns && (
          <View style={styles.weeklyHintCard}>
            <Text style={styles.missingDataHint}>
              {strings.MISSING_STOCKIN}
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.WEEKLY_SUMMARY}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.weeklyScroll}>
        {renderContent()}
      </ScrollView>
    </SafeAreaView>
  );
}
