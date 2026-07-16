/**
 * ============================================
 * ADD PRODUCT SCREEN
 * ============================================
 *
 * Name is the only required field. Prices are optional by design: an owner
 * setting up the shop should not be blocked because they cannot remember
 * what they paid for fish oil.
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

import { addProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';

export function AddProductScreen({
  db,
  strings,
  onSave,
  onCancel,
}: {
  db: SQLiteDatabase;
  strings: Strings;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [barcode, setBarcode] = useState('');
  const [sellPrice, setSellPrice] = useState('');
  const [buyPrice, setBuyPrice] = useState('');
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      const qty = quantity ? parseInt(quantity, 10) : 0;
      await addProduct(db, {
        name,
        barcode,
        sellPrice: sellPrice ? parseFloat(sellPrice) : null,
        buyPrice: buyPrice ? parseFloat(buyPrice) : null,
        quantity: qty,
      });

      onSave();
    } catch (error) {
      console.error('Save error:', error);
      Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_PRODUCT);
      setSaving(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <View style={styles.screenHeader}>
        <TouchableOpacity onPress={onCancel}>
          <Text style={styles.backButton}>{strings.CANCEL}</Text>
        </TouchableOpacity>
        <Text style={styles.screenTitle}>{strings.ADD_PRODUCT}</Text>
        <View style={{ width: 50 }} />
      </View>

      <ScrollView style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          testID="add-product-name"
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor="#999"
          value={name}
          onChangeText={setName}
          autoFocus
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

        <Text style={styles.inputLabel}>{strings.SELL_PRICE_OPTIONAL}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            testID="add-product-sell-price"
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={sellPrice}
            onChangeText={setSellPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.CUSTOMER_PAYS}</Text>

        <Text style={styles.inputLabel}>{strings.BUY_PRICE_OPTIONAL}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            testID="add-product-buy-price"
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor="#999"
            keyboardType="decimal-pad"
            value={buyPrice}
            onChangeText={setBuyPrice}
          />
        </View>
        <Text style={styles.inputHint}>{strings.YOU_PAY}</Text>

        <Text style={styles.inputLabel}>{strings.CURRENT_STOCK_OPTIONAL}</Text>
        <TextInput
          testID="add-product-quantity"
          style={styles.textInput}
          placeholder="0"
          placeholderTextColor="#999"
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Text style={styles.inputHint}>{strings.HOW_MANY_NOW}</Text>

        <TouchableOpacity
          testID="add-product-save"
          style={[
            styles.saveButton,
            (!name.trim() || saving) && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!name.trim() || saving}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.ADD_PRODUCT}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}
