/**
 * ============================================
 * PRODUCTS LIST SCREEN
 * ============================================
 *
 * The shop's active products, searchable. Tapping a product opens Edit.
 * When products exist but nothing has been counted yet, the screen leads
 * to the first count -- setup ends with a clear ready-to-count state.
 */

import React, { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import type { AppProduct } from '../../core/db';
import { formatMoney } from '../../core/currency';
import { styles } from '../styles';
import type { Strings } from '../../i18n';

export function ProductsListScreen({
  products,
  latestCountSessionId,
  strings,
  onBack,
  onAddProduct,
  onEditProduct,
  onStartCount,
}: {
  products: AppProduct[];
  latestCountSessionId: number | null;
  strings: Strings;
  onBack: () => void;
  onAddProduct: () => void;
  onEditProduct: (product: AppProduct) => void;
  onStartCount: () => void;
}) {
  const [productSearch, setProductSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(50);
  const filteredProducts = products.filter(
    product => product.name.toLowerCase().includes(productSearch.toLowerCase())
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onBack}>
          <Text style={styles.backButton}>{strings.BACK}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.PRODUCTS_LABEL}</Text>
        <TouchableOpacity onPress={onAddProduct}>
          <Text style={styles.addButton}>{strings.ADD}</Text>
        </TouchableOpacity>
      </View>

      {/* Search bar - only show if there are products */}
      {products.length > 0 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder={strings.SEARCH_PRODUCTS}
            placeholderTextColor="#999"
            value={productSearch}
            onChangeText={value => { setProductSearch(value); setVisibleCount(50); }}
          />
          {productSearch.length > 0 && (
            <TouchableOpacity
              style={styles.searchClear}
              onPress={() => setProductSearch('')}
            >
              <Text style={styles.searchClearText}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {products.length > 0 && latestCountSessionId == null && (
        <View style={styles.readyCard}>
          <View style={styles.readyCardText}>
            <Text style={styles.readyCardTitle}>{strings.READY_TO_TRACK}</Text>
            <Text style={styles.readyCardHint}>{strings.READY_TO_TRACK_HINT}</Text>
          </View>
          <TouchableOpacity testID="products-start-count" style={styles.readyCardButton} onPress={onStartCount}>
            <Text style={styles.readyCardButtonText}>{strings.START_COUNTING}</Text>
          </TouchableOpacity>
        </View>
      )}

      {products.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyStateText}>{strings.NO_PRODUCTS}</Text>
          <TouchableOpacity
            style={styles.emptyStateButton}
            onPress={onAddProduct}
          >
            <Text style={styles.emptyStateButtonText}>{strings.ADD_PRODUCT}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView style={styles.productList}>
          {filteredProducts
            .slice(0, visibleCount)
            .map((product) => (
            <TouchableOpacity
              key={product.id}
              style={styles.productItem}
              onPress={() => onEditProduct(product)}
            >
              <View style={styles.productItemContent}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productMeta}>
                  {strings.PRODUCT_META(
                    product.current_qty,
                    product.unit_label,
                    product.sell_price != null ? formatMoney(product.sell_price) : null,
                    product.buy_price != null ? formatMoney(product.buy_price) : null
                  )}
                </Text>
              </View>
              <Text style={styles.productEditHint}>›</Text>
            </TouchableOpacity>
          ))}
          {filteredProducts.length === 0 && (
            <Text style={styles.noSearchResults}>{strings.NO_PRODUCT_MATCH(productSearch)}</Text>
          )}
          {visibleCount < filteredProducts.length && (
            <TouchableOpacity style={styles.dataButton} onPress={() => setVisibleCount(value => value + 50)}>
              <Text style={styles.dataButtonText}>{strings.SHOW_MORE}</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
