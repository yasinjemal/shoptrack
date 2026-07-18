/**
 * ============================================
 * STOCK-IN SCREEN
 * ============================================
 *
 * Record a delivery: pick the product, say how many and what it cost.
 * Cost can be entered as a total or per item, because receipts come both
 * ways. Saving offers an immediate Undo -- deliveries are typed with a
 * bakkie idling outside.
 */

import React, { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { formatMoney, getCurrentCurrency } from '../../core/currency';
import { parseNonNegativeWhole, parsePositiveDecimal } from '../../core/userNumber';

import { recordStockIn, undoStockIn, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import { color } from '../theme';
import type { Strings } from '../../i18n';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';
import { KeyboardForm } from '../components/KeyboardForm';
import { ScreenHeader } from '../components/ScreenHeader';
import { registerHardwareBackOverride } from '../navigation';

export function StockInScreen({
  products,
  db,
  strings,
  onComplete,
  onCancel,
}: {
  products: AppProduct[];
  db: SQLiteDatabase;
  strings: Strings;
  onComplete: () => void;
  onCancel: () => void;
}) {
  const [selectedProduct, setSelectedProduct] = useState<AppProduct | null>(null);
  const [quantity, setQuantity] = useState('');
  const [cost, setCost] = useState('');
  const [costMode, setCostMode] = useState<'total' | 'each'>('total');
  const [productSearch, setProductSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMovementId, setSavedMovementId] = useState<number | null>(null);

  const parsedQty = parseNonNegativeWhole(quantity);
  const parsedCost = parsePositiveDecimal(cost);
  const qty = parsedQty ?? 0;
  const enteredCost = parsedCost ?? 0;
  const totalCost = costMode === 'each' ? enteredCost * qty : enteredCost;
  const canSave = selectedProduct !== null
    && parsedQty !== null
    && qty > 0
    && parsedCost !== null
    && Number.isFinite(totalCost)
    && totalCost > 0;

  React.useEffect(() => registerHardwareBackOverride(() => {
    if (savedMovementId != null) {
      onComplete();
      return true;
    }
    if (selectedProduct) {
      setSelectedProduct(null);
      setQuantity('');
      setCost('');
      return true;
    }
    return false;
  }), [onComplete, savedMovementId, selectedProduct]);

  const chooseProduct = (product: AppProduct) => {
    setSelectedProduct(product);
    if (product.buy_price != null) {
      setCostMode('each');
      setCost(product.buy_price.toFixed(2));
    } else {
      setCostMode('total');
      setCost('');
    }
  };

  const handleSave = async () => {
    if (!selectedProduct || !canSave) return;

    setSaving(true);
    try {
      const movementId = await recordStockIn(db, selectedProduct, qty, totalCost);
      setSavedMovementId(movementId);
      setSaving(false);
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_STOCK);
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (savedMovementId == null) return;
    setSaving(true);
    try {
      await undoStockIn(db, savedMovementId);
      onComplete();
    } catch (error) {
      console.error('Undo stock-in error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_UNDO_STOCK);
      setSaving(false);
    }
  };

  if (savedMovementId != null && selectedProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={styles.resultsContainer}>
          <Text accessibilityRole="header" style={styles.resultsTitle}>{strings.STOCK_ADDED}</Text>
          <Text style={styles.resultsSubtitle}>
            {strings.STOCK_ADDED_HINT(qty, selectedProduct.unit_label, selectedProduct.name)}
          </Text>
          <TouchableOpacity
            style={styles.doneButton}
            accessibilityRole="button"
            accessibilityLabel={strings.DONE}
            onPress={onComplete}
          >
            <Text style={styles.doneButtonText}>{strings.DONE}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.undoButton}
            accessibilityRole="button"
            accessibilityLabel={strings.UNDO}
            accessibilityState={{ disabled: saving }}
            disabled={saving}
            onPress={handleUndo}
          >
            <Text style={styles.undoButtonText}>{strings.UNDO}</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Product selection
  if (!selectedProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <ScreenHeader title={strings.ADD_STOCK} leftLabel={strings.CANCEL} onLeft={onCancel} />

        <Text style={styles.sectionTitle}>{strings.WHAT_DID_YOU_BUY}</Text>

        <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
          <BarcodeFinderButton
            strings={strings}
            onScanned={barcode => {
              const product = products.find(item => item.barcode === barcode);
              if (!product) Alert.alert(strings.BARCODE_NOT_FOUND);
              else chooseProduct(product);
            }}
          />
        </View>

        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={strings.SEARCH_PRODUCTS}
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.SEARCH_PRODUCTS}
            value={productSearch}
            onChangeText={setProductSearch}
          />
          {productSearch.length > 0 && (
            <TouchableOpacity
              style={styles.searchClear}
              accessibilityRole="button"
              accessibilityLabel={strings.CANCEL}
              onPress={() => setProductSearch('')}
            >
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>

        <ScrollView style={styles.productList}>
          {products
            .filter(product => product.name.toLowerCase().includes(productSearch.toLowerCase()))
            .map((product) => (
            <TouchableOpacity
              testID={`stockin-product-${product.id}`}
              key={product.id}
              style={styles.productSelectItem}
              accessibilityRole="button"
              accessibilityLabel={product.name}
              accessibilityHint={strings.IN_STOCK(product.current_qty, product.unit_label)}
              onPress={() => chooseProduct(product)}
            >
              <Text style={styles.productName}>{product.name}</Text>
              <Text style={styles.productMeta}>
                {strings.IN_STOCK(product.current_qty, product.unit_label)}
              </Text>
            </TouchableOpacity>
          ))}
          {products.filter(product =>
            product.name.toLowerCase().includes(productSearch.toLowerCase())
          ).length === 0 && (
            <Text style={styles.noSearchResults}>{strings.NO_PRODUCT_MATCH(productSearch)}</Text>
          )}
        </ScrollView>
      </SafeAreaView>
    );
  }

  // Entry form
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader
        title={strings.ADD_STOCK}
        leftLabel={strings.BACK}
        onLeft={() => {
          setSelectedProduct(null);
          setQuantity('');
          setCost('');
        }}
      />

      <View style={styles.selectedProductBanner}>
        <Text style={styles.selectedProductName}>{selectedProduct.name}</Text>
        <Text style={styles.selectedProductMeta}>
          {strings.CURRENTLY_IN_STOCK(selectedProduct.current_qty, selectedProduct.unit_label)}
        </Text>
      </View>

      <KeyboardForm style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.HOW_MANY_BOUGHT}</Text>
        <View style={styles.priceInputRow}>
          <TextInput
            testID="stockin-quantity"
            style={styles.quantityInput}
            placeholder="0"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.HOW_MANY_BOUGHT}
            keyboardType="number-pad"
            value={quantity}
            onChangeText={setQuantity}
            autoFocus
          />
          <Text style={styles.unitSuffix}>{selectedProduct.unit_label}</Text>
        </View>

        <View style={styles.costModeRow}>
          <TouchableOpacity
            style={[styles.costModeButton, costMode === 'total' && styles.costModeButtonActive]}
            accessibilityRole="radio"
            accessibilityLabel={strings.COST_MODE_TOTAL}
            accessibilityState={{ selected: costMode === 'total' }}
            onPress={() => setCostMode('total')}
          >
            <Text style={[styles.costModeText, costMode === 'total' && styles.costModeTextActive]}>
              {costMode === 'total' ? `✓ ${strings.COST_MODE_TOTAL}` : strings.COST_MODE_TOTAL}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.costModeButton, costMode === 'each' && styles.costModeButtonActive]}
            accessibilityRole="radio"
            accessibilityLabel={strings.COST_MODE_EACH}
            accessibilityState={{ selected: costMode === 'each' }}
            onPress={() => setCostMode('each')}
          >
            <Text style={[styles.costModeText, costMode === 'each' && styles.costModeTextActive]}>
              {costMode === 'each' ? `✓ ${strings.COST_MODE_EACH}` : strings.COST_MODE_EACH}
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.inputLabel}>
          {costMode === 'each' ? strings.COST_PER_ITEM : strings.TOTAL_COST}
        </Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={costMode === 'each' ? strings.COST_PER_ITEM : strings.TOTAL_COST}
            keyboardType="decimal-pad"
            value={cost}
            onChangeText={setCost}
          />
        </View>

        {qty > 0 && totalCost > 0 && (
          <Text style={styles.costSummary}>
            {costMode === 'each'
              ? strings.COST_TOTAL(qty, formatMoney(enteredCost), formatMoney(totalCost))
              : strings.COST_EACH(formatMoney(totalCost / qty))}
          </Text>
        )}

        <TouchableOpacity
          testID="stockin-save"
          style={[
            styles.saveButton,
            (!canSave || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave || saving}
          accessibilityRole="button"
          accessibilityLabel={strings.SAVE_STOCK_IN}
          accessibilityState={{ disabled: !canSave || saving, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_STOCK_IN}
          </Text>
        </TouchableOpacity>
      </KeyboardForm>
    </SafeAreaView>
  );
}
