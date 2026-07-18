/**
 * ============================================
 * EDIT PRODUCT SCREEN
 * ============================================
 *
 * Prices and name only. Quantity is deliberately not editable here: stock
 * changes through counting or stock-in, so the history always explains the
 * number. Delete is a soft delete -- history survives.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getCurrentCurrency } from '../../core/currency';
import { parseNonNegativeDecimal } from '../../core/userNumber';

import { deactivateProduct, updateProduct, type AppProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';
import { KeyboardForm } from '../components/KeyboardForm';
import { PhotoField } from '../components/PhotoField';
import { ScreenHeader } from '../components/ScreenHeader';
import { color } from '../theme';
import { deletePhoto } from '../../media/photoStore';

function discardProductPhoto(path: string): void {
  try {
    deletePhoto(path);
  } catch (error) {
    // The database write is authoritative. A filesystem cleanup failure must
    // not make a successful save/delete look as though it failed.
    console.warn('Product photo cleanup failed:', error);
  }
}

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
  const [photoPath, setPhotoPath] = useState<string | null>(product.photo_path ?? null);
  const originalPhotoRef = useRef<string | null>(product.photo_path ?? null);
  const currentPhotoRef = useRef<string | null>(product.photo_path ?? null);
  const mountedRef = useRef(true);
  const operationRef = useRef(false);
  const finishedRef = useRef(false);

  useEffect(() => {
    const originalPhotoPath = originalPhotoRef.current;
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      const current = currentPhotoRef.current;
      if (
        !finishedRef.current
        && !operationRef.current
        && current
        && current !== originalPhotoPath
      ) {
        discardProductPhoto(current);
        currentPhotoRef.current = null;
      }
    };
  }, []);

  const sellPriceBlank = sellPrice.trim() === '';
  const buyPriceBlank = buyPrice.trim() === '';
  const parsedSellPrice = sellPriceBlank ? null : parseNonNegativeDecimal(sellPrice);
  const parsedBuyPrice = buyPriceBlank ? null : parseNonNegativeDecimal(buyPrice);
  const pricesValid = (sellPriceBlank || parsedSellPrice !== null)
    && (buyPriceBlank || parsedBuyPrice !== null);
  const canSave = name.trim().length > 0 && pricesValid && !saving;

  const handlePhotoChange = (nextPath: string | null) => {
    const current = currentPhotoRef.current;
    if (current && current !== originalPhotoRef.current && current !== nextPath) {
      discardProductPhoto(current);
    }
    currentPhotoRef.current = nextPath;
    setPhotoPath(nextPath);
  };

  const handleCancel = () => {
    if (operationRef.current) return;
    const current = currentPhotoRef.current;
    currentPhotoRef.current = originalPhotoRef.current;
    if (current && current !== originalPhotoRef.current) discardProductPhoto(current);
    onCancel();
  };

  const handleSave = async () => {
    if (!canSave) return;

    setSaving(true);
    operationRef.current = true;
    try {
      await updateProduct(db, product.id, {
        name,
        barcode,
        photoPath,
        sellPrice: parsedSellPrice,
        buyPrice: parsedBuyPrice,
      });

      finishedRef.current = true;
      currentPhotoRef.current = null;
      if (photoPath !== originalPhotoRef.current && originalPhotoRef.current) {
        discardProductPhoto(originalPhotoRef.current);
      }
      if (mountedRef.current) onSave();
    } catch (error) {
      console.error('Update error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_UPDATE_PRODUCT);
        setSaving(false);
      } else {
        const current = currentPhotoRef.current;
        if (current && current !== originalPhotoRef.current) discardProductPhoto(current);
        currentPhotoRef.current = null;
      }
    } finally {
      operationRef.current = false;
    }
  };

  const handleDelete = () => {
    if (saving || operationRef.current) return;
    Alert.alert(
      strings.DELETE_PRODUCT,
      strings.DELETE_PRODUCT_CONFIRM(product.name),
      [
        { text: strings.CANCEL, style: 'cancel' },
        {
          text: strings.DELETE_PRODUCT,
          style: 'destructive',
          onPress: async () => {
            operationRef.current = true;
            setSaving(true);
            try {
              // The row is cleared first; only then can either referenced file
              // be removed without risking a broken database reference.
              const deactivatedPath = await deactivateProduct(db, product.id);
              const draftPath = currentPhotoRef.current;
              finishedRef.current = true;
              currentPhotoRef.current = null;
              if (deactivatedPath) discardProductPhoto(deactivatedPath);
              if (draftPath && draftPath !== deactivatedPath) discardProductPhoto(draftPath);
              if (mountedRef.current) onDelete();
            } catch (error) {
              console.error('Delete error:', error);
              if (mountedRef.current) {
                Alert.alert(strings.ERROR_TITLE, strings.ERROR_DELETE_PRODUCT);
                setSaving(false);
              } else {
                const current = currentPhotoRef.current;
                if (current && current !== originalPhotoRef.current) discardProductPhoto(current);
                currentPhotoRef.current = null;
              }
            } finally {
              operationRef.current = false;
            }
          }
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.EDIT_PRODUCT} leftLabel={strings.CANCEL} onLeft={handleCancel} />

      <KeyboardForm style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.WHAT_DO_YOU_SELL}
          value={name}
          onChangeText={setName}
        />

        <Text style={styles.inputLabel}>{strings.BARCODE_OPTIONAL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="600..."
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.BARCODE_OPTIONAL}
          keyboardType="number-pad"
          value={barcode}
          onChangeText={setBarcode}
        />
        <BarcodeFinderButton strings={strings} onScanned={setBarcode} />
        <Text style={styles.inputHint}>{strings.BARCODE_HINT}</Text>

        <PhotoField
          strings={strings}
          purpose="product"
          label={strings.PHOTO_LABEL}
          photoPath={photoPath}
          onChange={handlePhotoChange}
          disabled={saving}
        />

        <Text style={styles.inputLabel}>{strings.SELL_PRICE}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.SELL_PRICE}
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
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.BUY_PRICE}
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
            !canSave && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.SAVE_CHANGES}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.SAVE_CHANGES}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.deleteButton}
          accessibilityRole="button"
          accessibilityLabel={strings.DELETE_PRODUCT}
          accessibilityState={{ disabled: saving }}
          onPress={handleDelete}
          disabled={saving}
        >
          <Text style={styles.deleteButtonText}>{strings.DELETE_PRODUCT}</Text>
        </TouchableOpacity>
      </KeyboardForm>
    </SafeAreaView>
  );
}
