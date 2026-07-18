/**
 * ============================================
 * ADD PRODUCT SCREEN
 * ============================================
 *
 * Name is the only required field. Prices are optional by design: an owner
 * setting up the shop should not be blocked because they cannot remember
 * what they paid for fish oil.
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
import { parseNonNegativeDecimal, parseNonNegativeWhole } from '../../core/userNumber';

import { addProduct } from '../../core/db';
import { styles } from '../styles';
import type { Strings } from '../../i18n';
import { lookupOpenFoodFactsProduct } from '../../net/openFoodFacts';
import { deletePhoto } from '../../media/photoStore';
import { BarcodeFinderButton } from '../components/BarcodeFinderButton';
import { KeyboardForm } from '../components/KeyboardForm';
import { PhotoField } from '../components/PhotoField';
import { ScreenHeader } from '../components/ScreenHeader';
import { color } from '../theme';

function discardDraftPhoto(path: string): void {
  try {
    deletePhoto(path);
  } catch (error) {
    console.warn('Draft product photo cleanup failed:', error);
  }
}

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
  const [lookingUpBarcode, setLookingUpBarcode] = useState(false);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const nameRef = useRef(name);
  const barcodeRef = useRef(barcode);
  const nameTouchedRef = useRef(false);
  const lookupTokenRef = useRef(0);
  const mountedRef = useRef(true);
  const draftPhotoRef = useRef<string | null>(null);
  const committingRef = useRef(false);
  const committedRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => () => {
    // A committed path belongs to the product. A write in flight may still
    // commit it, so its completion path owns cleanup instead of this unmount.
    if (!committedRef.current && !committingRef.current && draftPhotoRef.current) {
      discardDraftPhoto(draftPhotoRef.current);
      draftPhotoRef.current = null;
    }
  }, []);

  const sellPriceBlank = sellPrice.trim() === '';
  const buyPriceBlank = buyPrice.trim() === '';
  const quantityBlank = quantity.trim() === '';
  const parsedSellPrice = sellPriceBlank ? null : parseNonNegativeDecimal(sellPrice);
  const parsedBuyPrice = buyPriceBlank ? null : parseNonNegativeDecimal(buyPrice);
  const parsedQuantity = quantityBlank ? 0 : parseNonNegativeWhole(quantity);
  const numbersValid = (sellPriceBlank || parsedSellPrice !== null)
    && (buyPriceBlank || parsedBuyPrice !== null)
    && parsedQuantity !== null;
  const canSave = name.trim().length > 0 && numbersValid && !saving;

  const handleNameChange = (value: string) => {
    nameTouchedRef.current = true;
    nameRef.current = value;
    setName(value);
  };

  const handleBarcodeScanned = (scannedBarcode: string) => {
    // Keep scanning useful even when the catalogue service is offline: the
    // code belongs to the form immediately and lookup continues in parallel.
    barcodeRef.current = scannedBarcode;
    setBarcode(scannedBarcode);

    const lookupToken = ++lookupTokenRef.current;
    const nameWasUntouchedAndBlank =
      !nameTouchedRef.current && nameRef.current.trim() === '';
    setLookingUpBarcode(true);

    void lookupOpenFoodFactsProduct(scannedBarcode)
      .then(product => {
        if (
          !mountedRef.current
          || lookupToken !== lookupTokenRef.current
          || barcodeRef.current !== scannedBarcode
          || !product
          || !nameWasUntouchedAndBlank
          || nameTouchedRef.current
          || nameRef.current.trim() !== ''
        ) {
          return;
        }

        nameRef.current = product.name;
        setName(product.name);
      })
      .catch(() => {
        // A miss or network problem is deliberately silent; manual entry stays available.
      })
      .finally(() => {
        if (mountedRef.current && lookupToken === lookupTokenRef.current) {
          setLookingUpBarcode(false);
        }
      });
  };

  const handleBarcodeChange = (value: string) => {
    barcodeRef.current = value;
    // A manual edit supersedes any catalogue response for the scanned code.
    lookupTokenRef.current += 1;
    setLookingUpBarcode(false);
    setBarcode(value);
  };

  const handlePhotoChange = (nextPath: string | null) => {
    const previousDraft = draftPhotoRef.current;
    if (previousDraft && previousDraft !== nextPath) discardDraftPhoto(previousDraft);
    draftPhotoRef.current = nextPath;
    setPhotoPath(nextPath);
  };

  const handleCancel = () => {
    if (committingRef.current) return;
    const draft = draftPhotoRef.current;
    draftPhotoRef.current = null;
    if (draft) discardDraftPhoto(draft);
    onCancel();
  };

  const handleSave = async () => {
    if (!canSave || parsedQuantity == null) return;

    setSaving(true);
    committingRef.current = true;
    try {
      await addProduct(db, {
        name,
        barcode,
        photoPath,
        sellPrice: parsedSellPrice,
        buyPrice: parsedBuyPrice,
        quantity: parsedQuantity,
      });

      committedRef.current = true;
      draftPhotoRef.current = null;
      if (mountedRef.current) onSave();
    } catch (error) {
      console.error('Save error:', error);
      if (mountedRef.current) {
        Alert.alert(strings.ERROR_TITLE, strings.ERROR_SAVE_PRODUCT);
        setSaving(false);
      } else if (draftPhotoRef.current) {
        discardDraftPhoto(draftPhotoRef.current);
        draftPhotoRef.current = null;
      }
    } finally {
      committingRef.current = false;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />

      <ScreenHeader title={strings.ADD_PRODUCT} leftLabel={strings.CANCEL} onLeft={handleCancel} />

      <KeyboardForm style={styles.formContainer}>
        <Text style={styles.inputLabel}>{strings.WHAT_DO_YOU_SELL}</Text>
        <TextInput
          testID="add-product-name"
          style={styles.textInput}
          placeholder={strings.PRODUCT_EXAMPLE}
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.WHAT_DO_YOU_SELL}
          value={name}
          onChangeText={handleNameChange}
          autoFocus
        />

        <Text style={styles.inputLabel}>{strings.BARCODE_OPTIONAL}</Text>
        <TextInput
          style={styles.textInput}
          placeholder="600..."
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.BARCODE_OPTIONAL}
          keyboardType="number-pad"
          value={barcode}
          onChangeText={handleBarcodeChange}
        />
        <BarcodeFinderButton strings={strings} onScanned={handleBarcodeScanned} />
        {lookingUpBarcode && (
          <View
            testID="add-product-barcode-lookup"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={strings.BARCODE_LOOKING_UP}
            accessibilityLiveRegion="polite"
            accessibilityState={{ busy: true }}
          >
            <Text style={styles.inputHint}>{strings.BARCODE_LOOKING_UP}</Text>
          </View>
        )}
        <Text style={styles.inputHint}>{strings.BARCODE_HINT}</Text>

        <PhotoField
          strings={strings}
          purpose="product"
          label={strings.PHOTO_LABEL}
          photoPath={photoPath}
          onChange={handlePhotoChange}
          disabled={saving}
        />

        <Text style={styles.inputLabel}>{strings.SELL_PRICE_OPTIONAL}</Text>
        <View style={styles.priceInputRow}>
          <Text style={styles.currencyPrefix}>{getCurrentCurrency().symbol}</Text>
          <TextInput
            testID="add-product-sell-price"
            style={styles.priceInput}
            placeholder="0.00"
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.SELL_PRICE_OPTIONAL}
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
            placeholderTextColor={color.inkMuted}
            accessibilityLabel={strings.BUY_PRICE_OPTIONAL}
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
          placeholderTextColor={color.inkMuted}
          accessibilityLabel={strings.CURRENT_STOCK_OPTIONAL}
          keyboardType="number-pad"
          value={quantity}
          onChangeText={setQuantity}
        />
        <Text style={styles.inputHint}>{strings.HOW_MANY_NOW}</Text>

        <TouchableOpacity
          testID="add-product-save"
          style={[
            styles.saveButton,
            !canSave && styles.saveButtonDisabled,
          ]}
          onPress={handleSave}
          disabled={!canSave}
          accessibilityRole="button"
          accessibilityLabel={strings.ADD_PRODUCT}
          accessibilityState={{ disabled: !canSave, busy: saving }}
        >
          <Text style={styles.saveButtonText}>
            {saving ? strings.SAVING : strings.ADD_PRODUCT}
          </Text>
        </TouchableOpacity>
      </KeyboardForm>
    </SafeAreaView>
  );
}
