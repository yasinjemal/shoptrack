import React, { useState } from 'react';
import {
  Alert,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';

import type { Strings } from '../../i18n';
import { color, radius, space } from '../theme';

export function BarcodeFinderButton({
  strings,
  onScanned,
}: {
  strings: Strings;
  onScanned: (barcode: string) => void;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [open, setOpen] = useState(false);
  const [locked, setLocked] = useState(false);

  const show = async () => {
    const granted = permission?.granted || (await requestPermission()).granted;
    if (!granted) {
      Alert.alert(strings.CAMERA_PERMISSION);
      return;
    }
    setLocked(false);
    setOpen(true);
  };

  const scan = ({ data }: BarcodeScanningResult) => {
    if (locked) return;
    setLocked(true);
    setOpen(false);
    onScanned(data.trim());
  };

  return (
    <>
      <TouchableOpacity style={scannerStyles.button} onPress={show} accessibilityRole="button">
        <Text style={scannerStyles.buttonText}>{strings.SCAN_BARCODE}</Text>
      </TouchableOpacity>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={scannerStyles.modal}>
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e', 'code128', 'qr'],
            }}
            onBarcodeScanned={locked ? undefined : scan}
          />
          <View style={scannerStyles.guide} pointerEvents="none" />
          <TouchableOpacity style={scannerStyles.close} onPress={() => setOpen(false)}>
            <Text style={scannerStyles.closeText}>{strings.CLOSE_SCANNER}</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </>
  );
}

const scannerStyles = StyleSheet.create({
  button: {
    minHeight: 48,
    paddingHorizontal: space.base,
    borderRadius: radius.md,
    backgroundColor: color.info,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: color.onAction, fontSize: 16, fontWeight: '700' },
  modal: { flex: 1, backgroundColor: color.ink },
  guide: {
    position: 'absolute',
    top: '30%',
    left: '10%',
    right: '10%',
    height: 180,
    borderWidth: 4,
    borderColor: color.onAction,
    borderRadius: radius.lg,
  },
  close: {
    position: 'absolute',
    left: space.xl,
    right: space.xl,
    bottom: space['3xl'],
    minHeight: 56,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: color.ink, fontSize: 18, fontWeight: '700' },
});
