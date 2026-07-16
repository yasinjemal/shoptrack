/**
 * ============================================
 * EDIT PRODUCT SCREEN
 * ============================================
 *
 * Prices and name only. Quantity is deliberately not editable here: stock
 * changes through counting or stock-in, so the history always explains the
 * number. Delete is a soft delete -- history survives.
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
import { getCurrentCurrency } from '../../core/currency';

import { deactivateProduct, updateProduct, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';

export function EditProductScreen({
  db,
  strings,
  product,
  onSave,
  onDelete,
  onCancel,
}: {
  db: SQLiteDatabase;
  strings: Strings;
  product: AppProduct;
  onSave: () => void;
  onDelete: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(product.name);
  const [barcode, setBarcode] = useState(product.barcode ?? '');
  const [sellPrice, setSellPrice] = useState(product.sell_price?.toString() || '');
  const [buyPrice, setBuyPrice] = useState(product.buy_price?.toString() || '');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      await updateProduct(db, product.id, {
        name,
        barcode,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        buyPrice: buyPrice ? parseFloat(buyPrice) : null,
      });

      onSave();
    } catch (error) {
      console.error('Update error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_UPDATE_PRODUCT);
      setSaving(false);
    }
  };

  const handleDelete = () => {
    Alert.alert(
      strings.DELETE_PRODUCT,
      strings.DELETE_PRODUCT_CONFIRM(product.name),
      [
        { text: strings.CANCEL, style: 'cancel' },
        {
          text: strings.DELETE_PRODUCT,
          style: 'destructive',
          onPress: async () => {
            try {
              // Soft delete - set is_active to 0
              await deactivateProduct(db, product.id);
              onDelete();
            } catch (error) {
              console.error('Delete error:', error);
              Alert.alert(strings.ERROR_TITLE, strings.ERROR_DELETE_PRODUCT);
            }
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.EDIT_PRODUCT}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>{strings.BARCODE_OPTIONAL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="600..."
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={barcode}
          onChangeText={setBarcode}
        />
        <BarcodeFinderButton strings={strings} onScanned={setBarcode} />
        <Text style={styles.inputHint}>{strings.BARCODE_HINT}</Text>

        <Text style={styles.inputLabel}>{strings.SELL_PRICE}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={sellPrice}
            onChangeText={setSellPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.CUSTOMER_PAYS}</Text>

        <Text style={styles.inputLabel}>{strings.BUY_PRICE}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={buyPrice}
            onChangeText={setBuyPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.YOU_PAY}</Text>

        <View style={styles.editProductInfo}>
          <Text style={styles.editProductInfoText}>
            {strings.CURRENT_STOCK(product.current_qty, product.unit_label)}
          </Text>
          <Text style={styles.editProductInfoHint}>
            {strings.USE_COUNT_TO_UPDATE}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_CHANGES}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          onPress={handleDelete}
        >
          <Text style={styles.deleteButtonText}>{strings.DELETE_PRODUCT}</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
