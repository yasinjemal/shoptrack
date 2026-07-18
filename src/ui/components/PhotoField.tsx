import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Image,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import type { PhotoPurpose } from '../../core/photo';
import type { Strings } from '../../i18n';
import {
  capturePhoto,
  choosePhotoFromLibrary,
  deletePhoto,
  recoverPendingPhoto,
  resolvePhotoUri,
  type PhotoStoreResult,
} from '../../media/photoStore';
import { styles } from '../styles';

export function PhotoField({
  strings,
  purpose,
  label,
  photoPath,
  onChange,
  disabled = false,
}: {
  strings: Strings;
  purpose: PhotoPurpose;
  label: string;
  photoPath: string | null;
  onChange: (nextPath: string | null) => void;
  disabled?: boolean;
}) {
  // The field owns a picker result only until it hands the logical path to its
  // parent. This distinction lets an in-flight result be discarded safely if
  // navigation unmounts the form, without ever deleting a parent-owned path.
  const [busy, setBusy] = useState(true);
  const mountedRef = useRef(true);
  const requestTokenRef = useRef<object>({});
  const onChangeRef = useRef(onChange);
  const stringsRef = useRef(strings);
  const purposeRef = useRef(purpose);
  onChangeRef.current = onChange;
  stringsRef.current = strings;
  purposeRef.current = purpose;
  const photoUri = useMemo(
    () => photoPath == null ? null : resolvePhotoUri(photoPath),
    [photoPath]
  );
  const actionsDisabled = disabled || busy;

  const discardUndeliveredResult = (result: PhotoStoreResult): void => {
    if (result.status !== 'saved') return;
    try {
      deletePhoto(result.photo.logicalPath);
    } catch (error) {
      console.warn('Undelivered photo cleanup failed:', error);
    }
  };

  const handleResult = useCallback((
    result: PhotoStoreResult,
    token: object,
    requestedPurpose: PhotoPurpose
  ) => {
    const stillCurrent = mountedRef.current
      && token === requestTokenRef.current
      && requestedPurpose === purposeRef.current;
    if (!stillCurrent) {
      discardUndeliveredResult(result);
      return;
    }

    const currentStrings = stringsRef.current;
    if (result.status === 'saved') {
      // Ownership transfers at this call. After it returns, only the parent
      // may replace, discard or commit this path.
      onChangeRef.current(result.photo.logicalPath);
      return;
    }
    if (result.status === 'permission-denied') {
      Alert.alert(
        currentStrings.PHOTO_PERMISSION_TITLE,
        result.permission === 'camera'
          ? currentStrings.PHOTO_CAMERA_PERMISSION
          : currentStrings.PHOTO_LIBRARY_PERMISSION
      );
      return;
    }
    if (result.status === 'error') {
      Alert.alert(currentStrings.ERROR_TITLE, currentStrings.PHOTO_SAVE_ERROR);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const requestedPurpose = purpose;
    const token = {};
    requestTokenRef.current = token;
    setBusy(true);

    // Android can recreate MainActivity while a system picker is open. Claim
    // that result before enabling a second picker request.
    void recoverPendingPhoto(requestedPurpose)
      .then(result => {
        if (result != null) handleResult(result, token, requestedPurpose);
      })
      .catch(() => {
        if (mountedRef.current && token === requestTokenRef.current) {
          const currentStrings = stringsRef.current;
          Alert.alert(currentStrings.ERROR_TITLE, currentStrings.PHOTO_SAVE_ERROR);
        }
      })
      .finally(() => {
        if (mountedRef.current && token === requestTokenRef.current) setBusy(false);
      });

    return () => {
      mountedRef.current = false;
      requestTokenRef.current = {};
    };
  }, [handleResult, purpose]);

  const acquire = async (source: 'camera' | 'library') => {
    if (actionsDisabled) return;
    const requestedPurpose = purpose;
    const token = {};
    requestTokenRef.current = token;
    setBusy(true);
    try {
      const result = source === 'camera'
        ? await capturePhoto(requestedPurpose)
        : await choosePhotoFromLibrary(requestedPurpose);
      handleResult(result, token, requestedPurpose);
    } catch {
      if (mountedRef.current && token === requestTokenRef.current) {
        const currentStrings = stringsRef.current;
        Alert.alert(currentStrings.ERROR_TITLE, currentStrings.PHOTO_SAVE_ERROR);
      }
    } finally {
      if (mountedRef.current && token === requestTokenRef.current) setBusy(false);
    }
  };

  return (
    <View style={styles.photoField}>
      <Text style={styles.inputLabel}>{label}</Text>
      {photoUri != null && (
        <Image
          testID={`${purpose}-photo-preview`}
          source={{ uri: photoUri }}
          style={styles.photoFieldPreview}
          resizeMode="cover"
          accessible
          accessibilityRole="image"
          accessibilityLabel={label}
        />
      )}
      <Text style={styles.photoFieldActionLabel}>
        {photoPath == null ? strings.PHOTO_ADD : strings.PHOTO_CHANGE}
      </Text>
      <View style={styles.photoFieldActions}>
        <TouchableOpacity
          testID={`${purpose}-photo-take`}
          style={[styles.photoFieldButton, actionsDisabled && styles.saveButtonDisabled]}
          onPress={() => { void acquire('camera'); }}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel={strings.PHOTO_TAKE}
          accessibilityState={{ disabled: actionsDisabled, busy }}
        >
          <Text style={styles.photoFieldButtonText}>{strings.PHOTO_TAKE}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          testID={`${purpose}-photo-choose`}
          style={[styles.photoFieldButton, actionsDisabled && styles.saveButtonDisabled]}
          onPress={() => { void acquire('library'); }}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel={strings.PHOTO_CHOOSE}
          accessibilityState={{ disabled: actionsDisabled, busy }}
        >
          <Text style={styles.photoFieldButtonText}>{strings.PHOTO_CHOOSE}</Text>
        </TouchableOpacity>
      </View>
      {photoPath != null && (
        <TouchableOpacity
          testID={`${purpose}-photo-remove`}
          style={styles.photoFieldRemove}
          onPress={() => onChange(null)}
          disabled={actionsDisabled}
          accessibilityRole="button"
          accessibilityLabel={strings.PHOTO_REMOVE}
          accessibilityState={{ disabled: actionsDisabled }}
        >
          <Text style={styles.photoFieldRemoveText}>{strings.PHOTO_REMOVE}</Text>
        </TouchableOpacity>
      )}
      <Text style={styles.photoFieldHint}>
        {purpose === 'customer'
          ? strings.CUSTOMER_PHOTO_PRIVATE_HINT
          : strings.PHOTO_PRIVATE_HINT}
      </Text>
    </View>
  );
}
