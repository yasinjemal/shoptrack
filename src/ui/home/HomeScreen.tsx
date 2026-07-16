/**
 * ============================================
 * HOME SCREEN
 * ============================================
 *
 * The answer screen: the hero profit figure, then every signal worth acting
 * on (a short till, the credit book, restock priority, running low), then
 * the actions, then data safety. The one animation in the app lives here --
 * the profit figure arrives rather than just being there.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Pressable,
  SafeAreaView,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { CASH_TOLERANCE } from '../../core/cashup';
import { formatMoney } from '../../core/currency';
import { summariseOutstanding, type CreditSummary } from '../../core/credit';
import { summariseSalesBook, type SalesHistory } from '../../core/sales';
import type { AppProduct, CashUp } from '../../core/db';
import { styles } from '../styles';
import { color, motion } from '../theme';
import type { Strings } from '../../i18n';
import type { Screen } from '../screens';
import { calculateReorderItems } from '../../core/reorder';

// Tier 4.1: Restock priority item
export interface RestockItem {
  name: string;
  reason: 'fast_low' | 'fast' | 'profit';
  score: number;
}

export function HomeScreen({
  products,
  lastProfit,
  credit,
  sales,
  lastCashUp,
  restockPriority,
  latestCountSessionId,
  latestCountAt,
  crashNotice,
  sharedBackupDue,
  strings,
  setScreen,
  onUndoLatestCount,
  onBackup,
  onRestore,
}: {
  products: AppProduct[];
  lastProfit: number | null;
  credit: CreditSummary | null;
  sales: SalesHistory | null;
  lastCashUp: CashUp | null;
  restockPriority: RestockItem[];
  latestCountSessionId: number | null;
  latestCountAt: number | null;
  crashNotice: boolean;
  sharedBackupDue: boolean;
  strings: Strings;
  setScreen: (screen: Screen) => void;
  onUndoLatestCount: () => void;
  onBackup: () => void;
  onRestore: () => void;
}) {
  // Entrance for the profit figure. Only opacity and transform are animated:
  // animating height or width re-lays-out every frame and drops frames on the
  // mid-range phones this runs on. useNativeDriver keeps it off the JS thread,
  // so it stays smooth even while the database is still being read.
  const profitFade = useRef(new Animated.Value(0)).current;
  const profitRise = useRef(new Animated.Value(8)).current;

  useEffect(() => {
    if (lastProfit === null) return;
    Animated.parallel([
      Animated.timing(profitFade, {
        toValue: 1,
        duration: motion.base,
        useNativeDriver: true,
      }),
      Animated.timing(profitRise, {
        toValue: 0,
        duration: motion.base,
        useNativeDriver: true,
      }),
    ]).start();
  }, [lastProfit, profitFade, profitRise]);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      {/* Header */}
      <View style={styles.homeHeader}>
        <Text style={styles.appName}>ShopTrack</Text>
        <Text style={styles.tagline}>{strings.APP_TAGLINE}</Text>
      </View>

      <ScrollView style={styles.homeContent}>
        {crashNotice && (
          <View style={styles.countReminderCard}>
            <Text style={styles.countReminderTitle}>{strings.CRASH_NOTICE_TITLE}</Text>
            <Text style={styles.countReminderHint}>{strings.CRASH_NOTICE_HINT}</Text>
          </View>
        )}
        {/* How it works - show when no profit yet */}
        {lastProfit === null && products.length > 0 && (
          <View style={styles.howItWorksCard}>
            <Text style={styles.howItWorksTitle}>{strings.HOW_TITLE}</Text>
            <Text style={styles.howItWorksStep}>
              <Text style={styles.stepNumber}>1.</Text> {strings.HOW_STEP_1}
            </Text>
            <Text style={styles.howItWorksStep}>
              <Text style={styles.stepNumber}>2.</Text> {strings.HOW_STEP_2}
            </Text>
            <Text style={styles.howItWorksStep}>
              <Text style={styles.stepNumber}>3.</Text> {strings.HOW_STEP_3}
            </Text>
            <Text style={styles.howItWorksStep}>
              <Text style={styles.stepNumber}>4.</Text> {strings.HOW_STEP_4}
            </Text>
            <Text style={styles.howItWorksNote}>{strings.HOW_NOTE}</Text>
          </View>
        )}

        {/* Profit display (if available).
            The one animation in the app. This number is the answer the owner
            opened ShopTrack for, so it arrives rather than just being there.
            Nothing else animates -- a screen where everything moves has no
            emphasis left to give. */}
        {lastProfit !== null && (
          <Animated.View
            style={[
              styles.profitCard,
              { opacity: profitFade, transform: [{ translateY: profitRise }] },
            ]}
          >
            <Text style={styles.profitLabel}>{strings.YOUR_PROFIT}</Text>
            <Text style={styles.profitValue}>{formatMoney(lastProfit, 0)}</Text>
            <Text style={styles.profitExplainer}>
              {strings.PROFIT_EXPLAINER}
            </Text>
            {/* Profit counts goods that left the shelf, including those taken
                on credit. Say so here rather than let the owner assume the
                cash is in the till. */}
            {credit && credit.total_outstanding > 0 && (
              <Text style={styles.profitOwedNote}>
                {strings.CREDIT_NOT_IN_HAND(formatMoney(credit.total_outstanding))}
              </Text>
            )}
          </Animated.View>
        )}

        {/* Quick stats */}
        {products.length > 0 && <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>{products.length}</Text>
            <Text style={styles.statLabel}>{strings.PRODUCTS_LABEL}</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statValue}>
              {products.reduce((sum, p) => sum + p.current_qty, 0)}
            </Text>
            <Text style={styles.statLabel}>{strings.ITEMS_IN_STOCK}</Text>
          </View>
        </View>}

        {/* Tier 3.3: Stock Value */}
        {products.some(p => p.current_qty > 0 && p.buy_price) && (
          <View style={styles.stockValueCard}>
            <Text style={styles.stockValueLabel}>{strings.STOCK_VALUE_LABEL}</Text>
            <Text style={styles.stockValueAmount}>
              ~{formatMoney(Math.round(products.reduce((sum, p) => {
                if (p.current_qty > 0 && p.buy_price) {
                  return sum + (p.current_qty * p.buy_price);
                }
                return sum;
              }, 0)), 0)}
            </Text>
            <Text style={styles.stockValueHint}>{strings.STOCK_VALUE_HINT}</Text>
            {products.some(p => p.current_qty > 0 && !p.buy_price) && (
              <Text style={styles.stockValueMissing}>{strings.STOCK_VALUE_MISSING_PRICES}</Text>
            )}
          </View>
        )}

        {/* A till that came up short last time. Surfaced on Home because it
            is the one number an owner will not go looking for, and the one
            most worth acting on. Opening floats have nothing to reconcile. */}
        {lastCashUp && !lastCashUp.is_opening && lastCashUp.difference < -CASH_TOLERANCE && (
          <TouchableOpacity
            style={styles.shortfallCard}
            onPress={() => setScreen('cashup')}
          >
            <Text style={styles.shortfallLabel}>{strings.CASHUP_SHORT}</Text>
            <Text style={styles.shortfallAmount}>
              {formatMoney(Math.abs(lastCashUp.difference))}
            </Text>
            <Text style={styles.shortfallHint}>{strings.CASHUP_HOME_SHORTFALL}</Text>
          </TouchableOpacity>
        )}

        {/* The owner's own book. Shown next to counted profit, never added to
            it: both answer "did I make money?", so summing them counts the
            same trading twice. See src/core/sales.ts. */}
        {sales && summariseSalesBook(sales) && (
          <Pressable
            style={({ pressed }) => [styles.salesCard, pressed && styles.salesCardPressed]}
            android_ripple={{ color: color.ripple }}
            onPress={() => setScreen('sales')}
          >
            <Text style={styles.salesCardLabel}>{strings.SALES_TOTAL_LABEL}</Text>
            <Text style={styles.salesCardAmount}>{formatMoney(sales.total_profit)}</Text>
            <Text style={styles.salesCardHint}>
              {strings.SALES_TOTAL_HINT(
                sales.months_recorded,
                `${sales.average_margin_pct.toFixed(0)}%`
              )}
            </Text>
          </Pressable>
        )}

        {/* Credit book: what's out in the community */}
        {credit && summariseOutstanding(credit) && (
          <TouchableOpacity
            style={styles.creditCard}
            onPress={() => setScreen('credit')}
          >
            <Text style={styles.creditCardLabel}>{strings.CREDIT_OUTSTANDING_LABEL}</Text>
            <Text style={styles.creditCardAmount}>
              {formatMoney(credit.total_outstanding)}
            </Text>
            <Text style={styles.creditCardHint}>
              {strings.CREDIT_HOME_STATUS(
                credit.customers_owing,
                credit.customers_overdue,
                credit.customers_stale
              )}
            </Text>
          </TouchableOpacity>
        )}

        {/* Tier 4.1: Restock Priority */}
        {restockPriority.length > 0 && (
          <View style={styles.restockPriorityCard}>
            <Text style={styles.restockPriorityTitle}>{strings.RESTOCK_TITLE}</Text>
            {restockPriority.map((item, index) => (
              <View key={item.name} style={styles.restockPriorityItem}>
                <Text style={styles.restockPriorityNumber}>{index + 1}.</Text>
                <Text style={styles.restockPriorityName}>{item.name}</Text>
                <Text style={styles.restockPriorityReason}>
                  — {item.reason === 'fast_low' ? strings.RESTOCK_FAST_LOW :
                     item.reason === 'fast' ? strings.RESTOCK_FAST :
                     strings.RESTOCK_PROFIT}
                </Text>
              </View>
            ))}
            <Text style={styles.restockPriorityHint}>{strings.RESTOCK_HINT}</Text>
            <TouchableOpacity
              style={styles.dataButton}
              onPress={() => {
                const lines = calculateReorderItems(products).map(item =>
                  strings.REORDER_LINE(item.name, item.current_qty, item.suggested_qty, item.unit_label)
                );
                void Share.share({ message: `${strings.REORDER_HEADER}\n\n${lines.join('\n')}` });
              }}
            >
              <Text style={styles.dataButtonText}>{strings.REORDER_SHARE}</Text>
            </TouchableOpacity>
          </View>
        )}

        {latestCountAt != null && Date.now() - latestCountAt >= 7 * 24 * 60 * 60 * 1000 && (
          <TouchableOpacity style={styles.countReminderCard} onPress={() => setScreen('count')}>
            <Text style={styles.countReminderTitle}>{strings.COUNT_REMINDER_TITLE}</Text>
            <Text style={styles.countReminderHint}>{strings.COUNT_REMINDER_HINT}</Text>
          </TouchableOpacity>
        )}

        {sharedBackupDue && (
          <TouchableOpacity style={styles.countReminderCard} onPress={onBackup}>
            <Text style={styles.countReminderTitle}>{strings.BACKUP_NUDGE_TITLE}</Text>
            <Text style={styles.countReminderHint}>{strings.BACKUP_NUDGE_HINT}</Text>
          </TouchableOpacity>
        )}

        {/* Main actions */}
        {products.length > 0 && <View style={styles.actionsContainer}>
          {/* Pressable, not TouchableOpacity: it gives a real Android ripple
              and a pressed state, so a tap feels acknowledged on a cheap
              phone where the screen itself lags. */}
          <Pressable
            testID="home-count-stock"
            style={({ pressed }) => [
              styles.primaryAction,
              pressed && styles.primaryActionPressed,
            ]}
            android_ripple={{ color: color.ripple }}
            onPress={() => setScreen('count')}
          >
            <Text style={styles.primaryActionIcon}>📦</Text>
            <Text style={styles.primaryActionText}>{strings.COUNT_STOCK}</Text>
            <Text style={styles.primaryActionSubtext}>
              {products.some(p => p.current_qty > 0)
                ? strings.COUNT_TO_PROFIT
                : strings.COUNT_BASELINE
              }
            </Text>
          </Pressable>

          <View style={styles.secondaryActions}>
            <Pressable
              testID="home-add-stock"
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('stock_in')}
            >
              <Text style={styles.secondaryActionIcon}>➕</Text>
              <Text style={styles.secondaryActionText}>{strings.ADD_STOCK}</Text>
              <Text style={styles.secondaryActionHint}>{strings.WHEN_YOU_BUY}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('products')}
            >
              <Text style={styles.secondaryActionIcon}>📋</Text>
              <Text style={styles.secondaryActionText}>{strings.PRODUCTS_LABEL}</Text>
              <Text style={styles.secondaryActionHint}>{strings.ADD_OR_EDIT}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('credit')}
            >
              <Text style={styles.secondaryActionIcon}>📖</Text>
              <Text style={styles.secondaryActionText}>{strings.CREDIT_HOME_BUTTON}</Text>
              <Text style={styles.secondaryActionHint}>{strings.CREDIT_HOME_HINT}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('expenses')}
            >
              <Text style={styles.secondaryActionIcon}>🧾</Text>
              <Text style={styles.secondaryActionText}>{strings.EXPENSES_HOME_BUTTON}</Text>
              <Text style={styles.secondaryActionHint}>{strings.EXPENSES_HOME_HINT}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('cashup')}
            >
              <Text style={styles.secondaryActionIcon}>💰</Text>
              <Text style={styles.secondaryActionText}>{strings.CASHUP_HOME_BUTTON}</Text>
              <Text style={styles.secondaryActionHint}>{strings.CASHUP_HOME_HINT}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('sales')}
            >
              <Text style={styles.secondaryActionIcon}>📗</Text>
              <Text style={styles.secondaryActionText}>{strings.SALES_HOME_BUTTON}</Text>
              <Text style={styles.secondaryActionHint}>{strings.SALES_HOME_HINT}</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryAction, pressed && styles.secondaryActionPressed]}
              android_ripple={{ color: color.ripple, borderless: false }}
              onPress={() => setScreen('health')}
            >
              <Text style={styles.secondaryActionIcon}>✓</Text>
              <Text style={styles.secondaryActionText}>{strings.HEALTH_TITLE}</Text>
              <Text style={styles.secondaryActionHint}>{strings.HEALTH_HINT}</Text>
            </Pressable>
          </View>

          {/* Activity buttons - only show if there's history */}
          {products.some(p => p.current_qty > 0) && (
            <View style={styles.insightButtons}>
              <TouchableOpacity
                style={styles.insightButton}
                onPress={() => setScreen('activity')}
              >
                <Text style={styles.insightButtonIcon}>📊</Text>
                <Text style={styles.insightButtonText}>{strings.RECENT_ACTIVITY}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.insightButton}
                onPress={() => setScreen('weekly')}
              >
                <Text style={styles.insightButtonIcon}>📅</Text>
                <Text style={styles.insightButtonText}>{strings.THIS_WEEK}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>}

        {/* Low Stock Warning */}
        {products.filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5)).length > 0 && (
          <View style={styles.lowStockWarning}>
            <Text style={styles.lowStockTitle}>{strings.RUNNING_LOW}</Text>
            {products
              .filter(p => p.current_qty > 0 && p.current_qty <= (p.low_stock_threshold || 5))
              .slice(0, 3)
              .map(p => (
                <Text key={p.id} style={styles.lowStockItem}>
                  {strings.STOCK_LEFT(p.name, p.current_qty)}
                </Text>
              ))
            }
          </View>
        )}

        {/* Empty state prompt */}
        {products.length === 0 && (
          <View style={styles.emptyPrompt}>
            <Text style={styles.emptyPromptTitle}>{strings.WELCOME_TITLE}</Text>
            <Text style={styles.emptyPromptText}>{strings.WELCOME_TEXT}</Text>
            <Text style={styles.emptyPromptHow}>{strings.WELCOME_HOW}</Text>
            <TouchableOpacity
              testID="home-add-first-product"
              style={styles.emptyPromptButton}
              onPress={() => setScreen('add_product')}
            >
              <Text style={styles.emptyPromptButtonText}>
                {strings.ADD_FIRST_PRODUCT}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {latestCountSessionId != null && latestCountAt != null &&
          Date.now() - latestCountAt <= 60 * 60 * 1000 && (
          <TouchableOpacity style={styles.homeUndoButton} onPress={onUndoLatestCount}>
            <Text style={styles.homeUndoText}>{strings.COUNT_UNDO}</Text>
          </TouchableOpacity>
        )}

        {/* Data Safety Section */}
        <View style={styles.dataSection}>
          <Text style={styles.dataSectionTitle}>{strings.YOUR_DATA}</Text>

          <TouchableOpacity
            style={styles.dataButton}
            onPress={onBackup}
          >
            <Text style={styles.dataButtonIcon}>💾</Text>
            <View style={styles.dataButtonContent}>
              <Text style={styles.dataButtonText}>{strings.SAVE_DATA}</Text>
              <Text style={styles.dataButtonHint}>{strings.SAVE_DATA_HINT}</Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.dataButton}
            onPress={onRestore}
          >
            <Text style={styles.dataButtonIcon}>📂</Text>
            <View style={styles.dataButtonContent}>
              <Text style={styles.dataButtonText}>{strings.RESTORE_DATA}</Text>
              <Text style={styles.dataButtonHint}>{strings.RESTORE_DATA_HINT}</Text>
            </View>
          </TouchableOpacity>

          {/* Language Toggle */}
          <TouchableOpacity
            testID="home-settings"
            style={styles.languageButton}
            onPress={() => setScreen('settings')}
          >
            <Text style={styles.languageButtonIcon}>🌐</Text>
            <Text style={styles.languageButtonLabel}>{strings.SETTINGS}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
