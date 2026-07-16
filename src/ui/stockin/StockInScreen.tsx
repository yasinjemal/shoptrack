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

import { recordStockIn, undoStockIn, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';

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

  const qty = parseInt(quantity) || 0;
  const enteredCost = parseFloat(cost) || 0;
  const totalCost = costMode === 'each' ? enteredCost * qty : enteredCost;
  const canSave = selectedProduct && qty > 0 && totalCost > 0;

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

      Alert.alert(
        strings.STOCK_ADDED,
        strings.STOCK_ADDED_HINT(qty, selectedProduct.unit_label, selectedProduct.name),
        [
          {
            text: strings.UNDO,
            style: 'destructive',
            onPress: async () => {
              try {
                await undoStockIn(db, movementId);
                onComplete();
              } catch (error) {
                console.error('Undo stock-in error:', error);
                Alert.alert(strings.ERROR_TITLE, strings.ERROR_UNDO_STOCK);
                setSaving(false);
              }
            },
          },
          { text: strings.DONE, onPress: onComplete },
        ]
      );
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_STOCK);
      setSaving(false);
    }
  };

  // Product selection
  if (!selectedProduct) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />

        <View style={styles.screenHeader}>
          <TouchableOpacity onPress={onCancel}>
            <Text style={styles.backButton}>{strings.CANCEL}</Text>
          </TouchableOpacity>
          <Text style={styles.screenTitle}>{strings.ADD_STOCK}</Text>
          <View style={{ width: 50 }} />
        </View>

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
            placeholderTextColor="#999"
            value={productSearch}
            onChangeText={setProductSearch}
          />
          {productSearch.length > 0 && (
            <TouchableOpacity style={styles.searchClear} onPress={() => setProductSearch('')}>
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

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={() => {
          setSelectedProduct(null);
          setQuantity('');
          setCost('');
        }}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.ADD_STOCK}</Text>
        <View style={{ width: 50 }} />
      </View>

      <View style={styles.selectedProductBanner}>
        <Text style={styles.selectedProductName}>{selectedProduct.name}</Text>
        <Text style={styles.selectedProductMeta}>
          {strings.CURRENTLY_IN_STOCK(selectedProduct.current_qty, selectedProduct.unit_label)}
        </Text>
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.HOW_MANY_BOUGHT}</Text>
        <View style={styles.priceInputRow}>
          <TextInput
            testID="stockin-quantity"
            style={styles.quantityInput}
            placeholder="0"
            placeholderTextColor="#999"
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
            onPress={() => setCostMode('total')}
          >
            <Text style={[styles.costModeText, costMode === 'total' && styles.costModeTextActive]}>
              {strings.COST_MODE_TOTAL}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.costModeButton, costMode === 'each' && styles.costModeButtonActive]}
            onPress={() => setCostMode('each')}
          >
            <Text style={[styles.costModeText, costMode === 'each' && styles.costModeTextActive]}>
              {strings.COST_MODE_EACH}
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
            placeholderTextColor="#999"
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
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_STOCK_IN}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
