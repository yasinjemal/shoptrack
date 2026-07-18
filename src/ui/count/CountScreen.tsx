/**
 * ============================================
 * COUNT SCREEN
 * ============================================
 *
 * The core loop: enter what is on the shelf, review before saving, see what
 * the numbers mean. The Review step exists because a count is the one write
 * that changes profit -- a mistyped 100 must be caught before it lands.
 */

import React, { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  SafeAreaView,
  ScrollView,
  Share,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';

import { calculatePeriodSummary } from '../../core/calculations';
import { formatMoney } from '../../core/currency';
import {
  loadMovements,
  loadPreviouslyCountedProductIds,
  saveCountSession,
  toCoreProduct,
  undoCountSession,
  type AppProduct,
} from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { buildCountSummary } from '../../core/messages';
import { renderShareMessage } from '../../i18n/messages';
import { SpeakButton } from '../components/SpeakButton';
import { VoiceNumberButton } from '../components/VoiceNumberButton';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';
import { StaffAttribution } from '../components/StaffAttribution';
import { ScreenHeader } from '../components/ScreenHeader';
import { color } from '../theme';
import { registerHardwareBackOverride } from '../navigation';
import { resolvePhotoUri } from '../../media/photoStore';

export function CountScreen({
  products,
  db,
  strings,
  onComplete,
  onUndo,
  onCancel,
}: {
  products: AppProduct[];
  db: SQLiteDatabase;
  strings: Strings;
  onComplete: (profit: number | null) => void;
  onUndo: () => void;
  onCancel: () => void;
}) {
  const [counts, setCounts] = useState<Record<number, string>>({});
  const [step, setStep] = useState<'counting' | 'review' | 'results'>('counting');
  const [saving, setSaving] = useState(false);
  const [profit, setProfit] = useState(0);
  const [savedSessionId, setSavedSessionId] = useState<number | null>(null);
  const [previouslyCounted, setPreviouslyCounted] = useState<Set<number>>(new Set());
  const [foundProductId, setFoundProductId] = useState<number | null>(null);
  const [recordedBy, setRecordedBy] = useState<number | null>(null);
  const [staffRequired, setStaffRequired] = useState(false);

  const countedCount = Object.entries(counts).filter(([_, v]) => v !== '').length;
  const countedEntries = products.flatMap(product => {
    const value = counts[product.id];
    if (value == null || value === '') return [];
    return [{ product, quantity: Number(value) }];
  });
  const isFirstCount = countedEntries.length > 0 &&
    countedEntries.every(entry => !previouslyCounted.has(entry.product.id));

  // Calculate what changed for the results screen (Tier 3.1)
  const [totalSold, setTotalSold] = useState(0);
  const [stockIncreased, setStockIncreased] = useState(false);
  const [unusualChange, setUnusualChange] = useState(false);

  // Tier 3.2: Confidence tracking
  const [totalCountSessions, setTotalCountSessions] = useState(0);
  const [hasAnyStockIns, setHasAnyStockIns] = useState(false);

  // Threshold for unusual change warning
  const UNUSUAL_THRESHOLD = 50;

  // Tier 3.2: Load confidence data on mount
  useEffect(() => {
    const loadConfidenceData = async () => {
      try {
        const countResult = await db.getAllAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM count_sessions WHERE completed_at IS NOT NULL'
        );
        setTotalCountSessions(countResult[0]?.count || 0);

        const stockInResult = await db.getAllAsync<{ count: number }>(
          'SELECT COUNT(*) as count FROM stock_movements WHERE type = \'STOCK_IN\''
        );
        setHasAnyStockIns((stockInResult[0]?.count || 0) > 0);
        setPreviouslyCounted(new Set(await loadPreviouslyCountedProductIds(db)));
      } catch (error) {
        console.error('Load confidence data error:', error);
      }
    };
    loadConfidenceData();
  }, [db]);

  useEffect(() => registerHardwareBackOverride(() => {
    if (step === 'review') {
      setStep('counting');
      return true;
    }
    if (step === 'results') {
      onComplete(isFirstCount ? null : profit);
      return true;
    }
    return false;
  }), [isFirstCount, onComplete, profit, step]);

  const handleSave = async () => {
    if (countedEntries.length === 0) return;
    if (staffRequired && recordedBy == null) {
      Alert.alert(strings.STAFF_REQUIRED);
      return;
    }
    setSaving(true);

    try {
      const now = Date.now();
      let didStockIncrease = false;
      let hasUnusualChange = false;

      for (const entry of countedEntries) {
        const change = entry.product.current_qty - entry.quantity;

        // Track if stock went up (restock without using Stock-In)
        if (change < 0) {
          didStockIncrease = true;
        }

        // Track unusual changes (Tier 3.1)
        if (previouslyCounted.has(entry.product.id) && Math.abs(change) > UNUSUAL_THRESHOLD) {
          hasUnusualChange = true;
        }
      }

      const saved = await saveCountSession(
        db, countedEntries, products.length, now, { recordedBy }
      );
      setSavedSessionId(saved.sessionId);

      // Profit since the previous count, per the engine.
      const movements = await loadMovements(db);
      const previousCountAt = movements
        .filter(m => m.type === 'COUNT' && m.recorded_at < now)
        .reduce((latest, m) => Math.max(latest, m.recorded_at), 0);

      const summary = calculatePeriodSummary(
        countedEntries.map(entry => toCoreProduct(entry.product)),
        movements,
        previousCountAt > 0 ? previousCountAt + 1 : now,
        now
      );

      setProfit(summary.total_estimated_profit);
      setTotalSold(summary.total_units_sold);
      setStockIncreased(didStockIncrease);
      setUnusualChange(hasUnusualChange || summary.products_with_anomalies > 0);
      setTotalCountSessions(prev => prev + 1); // Tier 3.2: increment count
      setStep('results');
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_COUNT);
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (savedSessionId == null) return;
    setSaving(true);
    try {
      const undone = await undoCountSession(db, savedSessionId);
      if (!undone) {
        Alert.alert(strings.COUNT_UNDO_EXPIRED);
        return;
      }
      Alert.alert(strings.COUNT_UNDONE, strings.COUNT_UNDONE_HINT);
      onUndo();
    } catch (error) {
      console.error('Undo count error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_GENERIC);
    } finally {
      setSaving(false);
    }
  };

  // Results screen
  if (step === 'results') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <ScrollView contentContainerStyle={styles.resultsContainer}>
          <Text style={styles.resultsIcon}>{isFirstCount ? '🎉' : '✓'}</Text>
          <Text style={styles.resultsTitle}>
            {isFirstCount ? strings.FIRST_COUNT_DONE : strings.COUNT_SAVED}
          </Text>

          {isFirstCount ? (
            <>
              <Text style={styles.resultsSubtitle}>
                {strings.STARTING_STOCK_RECORDED}
              </Text>
              <View style={styles.nextStepBox}>
                <Text style={styles.nextStepText}>
                  {strings.FIRST_COUNT_HINT}
                </Text>
              </View>
            </>
          ) : (
            <>
              {/* PROFIT CASE: Stock went down = sales */}
              {totalSold > 0 && (
                <>
                  <View style={styles.profitResultCard}>
                    <Text style={styles.profitResultLabel}>{strings.YOUR_PROFIT}</Text>
                    <Text style={styles.profitResultValue}>{formatMoney(profit, 0)}</Text>
                    {/* Tier 3.2: Confidence signals */}
                    <Text style={styles.resultConfidenceCount}>
                      {strings.BASED_ON_COUNTS(totalCountSessions)}
                    </Text>
                    <Text style={styles.resultConfidenceLevel}>
                      {totalCountSessions >= 4 ? strings.CONFIDENCE_RELIABLE :
                       totalCountSessions >= 2 ? strings.CONFIDENCE_CLEARER :
                       strings.CONFIDENCE_EARLY}
                    </Text>
                  </View>
                  {/* Tier 3.1: Calm explanation */}
                  <Text style={styles.profitExplainerText}>
                    {strings.SOLD_SINCE(totalSold)}
                  </Text>
                  <SpeakButton
                    text={renderShareMessage(
                      buildCountSummary(totalSold, profit, totalCountSessions),
                      strings
                    )}
                    strings={strings}
                  />
                  {/* Tier 3.2: Missing stock-in acknowledgement */}
                  {!hasAnyStockIns && (
                    <Text style={styles.missingDataHintSmall}>
                      {strings.MISSING_STOCKIN}
                    </Text>
                  )}
                </>
              )}

              {/* STOCK INCREASED CASE: Added more than sold (Tier 3.1) */}
              {totalSold === 0 && stockIncreased && (
                <Text style={styles.profitExplainerText}>
                  {strings.STOCK_INCREASED}
                </Text>
              )}

              {/* NO CHANGE CASE (Tier 3.1) */}
              {totalSold === 0 && !stockIncreased && (
                <Text style={styles.profitExplainerText}>
                  {strings.NO_CHANGE}
                </Text>
              )}

              {/* UNUSUAL CHANGE WARNING (Tier 3.1) */}
              {unusualChange && (
                <Text style={styles.unusualChangeText}>
                  {strings.UNUSUAL_CHANGE}
                </Text>
              )}
            </>
          )}

          <TouchableOpacity
            testID="count-done"
            style={styles.doneButton}
            accessibilityRole="button"
            accessibilityLabel={isFirstCount ? strings.GOT_IT : strings.DONE}
            onPress={() => onComplete(isFirstCount ? null : profit)}
          >
            <Text style={styles.doneButtonText}>
              {isFirstCount ? strings.GOT_IT : strings.DONE}
            </Text>
          </TouchableOpacity>
          {!isFirstCount && (
            <TouchableOpacity
              style={styles.dataButton}
              accessibilityRole="button"
              accessibilityLabel={strings.SHARE}
              onPress={() => Share.share({
                message: renderShareMessage(
                  buildCountSummary(totalSold, profit, totalCountSessions),
                  strings
                ),
              })}
            >
              <Text style={styles.dataButtonText}>{strings.SHARE}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={styles.undoButton}
            accessibilityRole="button"
            accessibilityLabel={strings.COUNT_UNDO}
            accessibilityState={{ disabled: saving }}
            onPress={handleUndo}
            disabled={saving}
          >
            <Text style={styles.undoButtonText}>{strings.COUNT_UNDO}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (step === 'review') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScreenHeader
          title={strings.COUNT_REVIEW_TITLE}
          leftLabel={strings.COUNT_GO_BACK}
          onLeft={() => setStep('counting')}
        />
        <Text style={styles.reviewHint}>{strings.COUNT_REVIEW_HINT}</Text>
        <ScrollView style={styles.countList}>
          {countedEntries.map(({ product, quantity }) => {
            const first = !previouslyCounted.has(product.id);
            const change = quantity - product.current_qty;
            return (
              <View key={product.id} style={styles.reviewItem}>
                <Text style={styles.reviewItemName}>{product.name}</Text>
                <Text style={styles.reviewItemValue}>
                  {first
                    ? strings.COUNT_FIRST_VALUE(product.name, quantity)
                    : strings.COUNT_CHANGE_VALUE(product.name, product.current_qty, quantity)}
                </Text>
                {!first && Math.abs(change) > UNUSUAL_THRESHOLD && (
                  <Text style={styles.reviewWarning}>{strings.UNUSUAL_CHANGE}</Text>
                )}
              </View>
            );
          })}
        </ScrollView>
        <View style={styles.countBottomBar}>
          <TouchableOpacity
            testID="count-save"
            style={[styles.saveCountButton, saving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={strings.COUNT_SAVE_BUTTON}
            accessibilityState={{ disabled: saving, busy: saving }}
          >
            <Text style={styles.saveButtonText}>
              {saving ? strings.SAVING : strings.COUNT_SAVE_BUTTON}
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Counting screen
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.COUNT_STOCK} leftLabel={strings.CANCEL} onLeft={onCancel} />

      <View style={styles.countInstructions}>
        <Text style={styles.countInstructionsTitle}>{strings.COUNT_HEADER}</Text>
        <Text style={styles.countInstructionsHint}>{strings.COUNT_HINT}</Text>
      </View>

      <Text style={styles.countProgress}>
        {strings.COUNT_PROGRESS(countedCount, products.length)}
      </Text>

      <StaffAttribution
        db={db}
        strings={strings}
        onSelected={setRecordedBy}
        onRequirementChange={setStaffRequired}
      />

      <View style={{ paddingHorizontal: 16, gap: 8 }}>
        <BarcodeFinderButton
          strings={strings}
          onScanned={barcode => {
            const product = products.find(item => item.barcode === barcode);
            if (!product) Alert.alert(strings.BARCODE_NOT_FOUND);
            else setFoundProductId(product.id);
          }}
        />
        {foundProductId != null && (
          <TouchableOpacity onPress={() => setFoundProductId(null)}>
            <Text style={styles.backButton}>{strings.SHOW_ALL_PRODUCTS}</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView style={styles.countList}>
        {products.filter(product => foundProductId == null || product.id === foundProductId).map((product) => (
          <View key={product.id} style={styles.countItem}>
            {product.photo_path != null && (
              <Image
                testID={`count-product-photo-${product.id}`}
                source={{ uri: resolvePhotoUri(product.photo_path) }}
                style={styles.countProductThumbnail}
                resizeMode="cover"
                accessible
                accessibilityRole="image"
                accessibilityLabel={`${strings.PRODUCT_PHOTO}: ${product.name}`}
              />
            )}
            <View style={styles.countItemInfo}>
              <Text style={styles.countItemName}>{product.name}</Text>
              <Text style={styles.countItemPrev}>
                {previouslyCounted.has(product.id)
                  ? strings.LAST_COUNT(product.current_qty)
                  : strings.NOT_COUNTED_YET}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <TextInput
                testID={`count-input-${product.id}`}
                style={styles.countInput}
                placeholder="0"
                placeholderTextColor={color.inkMuted}
                keyboardType="number-pad"
                accessibilityLabel={product.name}
                value={counts[product.id] || ''}
                onChangeText={(val) => {
                  setCounts(prev => ({ ...prev, [product.id]: val.replace(/[^0-9]/g, '') }));
                }}
              />
              <VoiceNumberButton
                strings={strings}
                onValue={value => setCounts(prev => ({ ...prev, [product.id]: String(value) }))}
              />
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.countBottomBar}>
        <TouchableOpacity
          testID="count-review"
          style={[
            styles.saveCountButton,
            (countedCount === 0 || saving) && styles.saveButtonDisabled,
          ]}
          onPress={() => setStep('review')}
          disabled={countedCount === 0 || saving}
          accessibilityRole="button"
          accessibilityLabel={strings.COUNT_REVIEW_BUTTON(countedCount)}
          accessibilityState={{ disabled: countedCount === 0 || saving, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {strings.COUNT_REVIEW_BUTTON(countedCount)}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
