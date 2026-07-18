/**
 * ============================================
 * ACTIVITY SCREEN (HISTORY)
 * ============================================
 *
 * Recent movement per product: the last counts, what sold between them,
 * and what that earned. Also the silent-loss detector -- products priced
 * below what they cost.
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calculateProductMetrics } from '../../core/calculations';
import { formatMoney } from '../../core/currency';
import { loadMovements, loadRecentProductCounts, toCoreProduct, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { LoadingState } from '../components/LoadingState';
import { ScreenHeader } from '../components/ScreenHeader';

interface ActivityItem {
  product_id: number;
  product_name: string;
  last_counts: number[];
  sold_since_last: number;
  profit_since_last: number;
  current_qty: number;
  sell_price: number | null;
  buy_price: number | null;
}

// Tier 4.3: Loss item
interface LossItem {
  name: string;
  buyPrice: number;
  sellPrice: number;
}

export function ActivityScreen({
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
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [topSellers, setTopSellers] = useState<ActivityItem[]>([]);
  const [lossItems, setLossItems] = useState<LossItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(50);

  useEffect(() => {
    loadActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadActivity = async () => {
    try {
      const activityData: ActivityItem[] = [];
      const countsByProduct = await loadRecentProductCounts(db, 3);
      const earliestNeeded = [...countsByProduct.values()]
        .filter(counts => counts.length >= 2)
        .reduce((earliest, counts) => Math.min(earliest, counts[1].recorded_at), Date.now());
      const movements = await loadMovements(db, earliestNeeded);

      for (const product of products) {
        const counts = countsByProduct.get(product.id) ?? [];

        const lastCounts = counts.map(c => c.quantity);

        // Calculate sold since last count
        let soldSinceLast = 0;
        let profitSinceLast = 0;

        // Measure between the two most recent counts. Going through the engine
        // means stock-ins landing between them are accounted for, instead of
        // reading as negative sales.
        if (counts.length >= 2) {
          const metrics = calculateProductMetrics(
            toCoreProduct(product),
            movements,
            counts[1].recorded_at + 1,
            counts[0].recorded_at
          );
          soldSinceLast = metrics.estimated_sold;
          if (product.sell_price != null && product.buy_price != null && soldSinceLast > 0) {
            profitSinceLast = metrics.estimated_profit;
          }
        }

        activityData.push({
          product_id: product.id,
          product_name: product.name,
          last_counts: lastCounts,
          sold_since_last: soldSinceLast,
          profit_since_last: profitSinceLast,
          current_qty: product.current_qty,
          sell_price: product.sell_price,
          buy_price: product.buy_price,
        });
      }

      setActivity(activityData);

      // Top 3 sellers by profit
      const sorted = [...activityData]
        .filter(a => a.profit_since_last > 0)
        .sort((a, b) => b.profit_since_last - a.profit_since_last)
        .slice(0, 3);
      setTopSellers(sorted);

      // Tier 4.3: Detect products selling at a loss
      const losses: LossItem[] = [];
      for (const product of products) {
        if (product.buy_price && product.sell_price && product.sell_price < product.buy_price) {
          losses.push({
            name: product.name,
            buyPrice: product.buy_price,
            sellPrice: product.sell_price,
          });
        }
      }
      setLossItems(losses.slice(0, 3)); // Show max 3

    } catch (error) {
      console.error('Load activity error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <LoadingState label={strings.RECENT_ACTIVITY} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.RECENT_ACTIVITY} leftLabel={strings.BACK} onLeft={onBack} />

      <ScrollView style={styles.activityContent}>
        {/* Tier 4.3: Silent Loss Detector */}
        {lossItems.length > 0 && (
          <View style={styles.lossCard}>
            <Text style={styles.lossTitle}>{strings.LOSS_TITLE}</Text>
            {lossItems.map((item) => (
              <Text key={item.name} style={styles.lossItem}>
                • {item.name} — bought at {formatMoney(item.buyPrice)}, sold at {formatMoney(item.sellPrice)}
              </Text>
            ))}
            <Text style={styles.lossHint}>{strings.LOSS_HINT}</Text>
          </View>
        )}

        {/* Top Sellers Card */}
        {topSellers.length > 0 && (
          <View style={styles.topSellersCard}>
            <Text style={styles.topSellersTitle}>{strings.TOP_SELLERS}</Text>
            <Text style={styles.topSellersSubtitle}>{strings.SINCE_LAST_COUNT}</Text>
            {topSellers.map((item, index) => (
              <View key={item.product_id} style={styles.topSellerRow}>
                <Text style={styles.topSellerRank}>{index + 1}.</Text>
                <Text style={styles.topSellerName}>{item.product_name}</Text>
                <Text style={styles.topSellerProfit}>{formatMoney(item.profit_since_last, 0)}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Activity by product */}
        <Text style={styles.activitySectionTitle}>{strings.PRODUCT_DETAILS}</Text>

        {activity.slice(0, visibleCount).map((item) => (
          <View key={item.product_id} style={styles.activityCard}>
            <Text style={styles.activityProductName}>{item.product_name}</Text>

            <View style={styles.activityRow}>
              <Text style={styles.activityLabel}>{strings.CURRENT_STOCK_ACTIVITY}</Text>
              <Text style={styles.activityValue}>{item.current_qty}</Text>
            </View>

            {item.last_counts.length >= 2 && (
              <>
                <View style={styles.activityRow}>
                  <Text style={styles.activityLabel}>{strings.SOLD_SINCE_LAST}</Text>
                  <Text style={[
                    styles.activityValue,
                    item.sold_since_last > 0 && styles.activityValueGreen
                  ]}>
                    {item.sold_since_last > 0 ? item.sold_since_last : '—'}
                  </Text>
                </View>

                {item.profit_since_last > 0 && (
                  <View style={styles.activityRow}>
                    <Text style={styles.activityLabel}>{strings.PROFIT_LABEL}</Text>
                    <Text style={[styles.activityValue, styles.activityValueGreen]}>
                      {formatMoney(item.profit_since_last, 0)}
                    </Text>
                  </View>
                )}
              </>
            )}

            {item.last_counts.length > 0 && (
              <Text style={styles.activityHistory}>
                {strings.LAST_COUNTS(item.last_counts)}
              </Text>
            )}

            {item.last_counts.length === 0 && (
              <Text style={styles.activityNoData}>{strings.NOT_COUNTED_YET}</Text>
            )}
          </View>
        ))}

        {visibleCount < activity.length && (
          <TouchableOpacity style={styles.dataButton} onPress={() => setVisibleCount(value => value + 50)}>
            <Text style={styles.dataButtonText}>{strings.SHOW_MORE}</Text>
          </TouchableOpacity>
        )}

        {activity.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyStateText}>{strings.NO_ACTIVITY}</Text>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
