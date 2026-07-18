import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import type { ImagePickerAsset, ImagePickerErrorResult, ImagePickerResult } from 'expo-image-picker';
import { Platform } from 'react-native';

import {
  MANAGED_PHOTO_DIRECTORY,
  createPendingPhotoRequest,
  createManagedPhotoPath,
  parsePendingPhotoRequest,
  planPhotoResize,
  validateManagedPhotoPath,
  type PhotoPurpose,
} from '../core/photo';

const JPEG_QUALITY = 0.75;
const PENDING_PHOTO_REQUEST_KEY = 'shoptrack_pending_photo_request_v1';

export type PhotoSource = 'camera' | 'library' | 'pending';
export type PhotoPermission = 'camera' | 'media-library';
export type PhotoStoreErrorCode =
  | 'unsupported-platform'
  | 'permission-request-failed'
  | 'picker-failed'
  | 'invalid-image'
  | 'processing-failed'
  | 'storage-failed';

export interface StoredPhoto {
  /** Portable path persisted in SQLite and backups. */
  logicalPath: string;
  /** Device-specific URI used only while rendering the photo. */
  uri: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
  size: number;
}

export type PhotoStoreResult =
  | { status: 'saved'; source: PhotoSource; photo: StoredPhoto }
  | { status: 'cancelled'; source: PhotoSource }
  | {
      status: 'permission-denied';
      source: Exclude<PhotoSource, 'pending'>;
      permission: PhotoPermission;
      canAskAgain: boolean;
    }
  | {
      status: 'error';
      source: PhotoSource;
      code: PhotoStoreErrorCode;
      /** Diagnostic only. UI should localize from `code`. */
      detail?: string;
      nativeCode?: string;
    };

function errorDetail(error: unknown): string | undefined {
  return error instanceof Error ? error.message : undefined;
}

function unsupported(source: PhotoSource): PhotoStoreResult {
  return { status: 'error', source, code: 'unsupported-platform' };
}

function photoDirectory(): Directory {
  return new Directory(Paths.document, MANAGED_PHOTO_DIRECTORY);
}

function managedPhotoFile(logicalPath: string): File {
  return new File(Paths.document, validateManagedPhotoPath(logicalPath));
}

function isUriInside(uri: string, directoryUri: string): boolean {
  const root = directoryUri.endsWith('/') ? directoryUri : `${directoryUri}/`;
  return uri.startsWith(root);
}

function deleteCacheFileBestEffort(uri: string | undefined, exceptUri?: string): void {
  if (!uri || uri === exceptUri) return;
  try {
    const cache = Paths.cache;
    if (!isUriInside(uri, cache.uri)) return;
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // Cache cleanup must never turn a completed save into a user-visible error.
  }
}

function allocateDestination(purpose: PhotoPurpose): { logicalPath: string; file: File } {
  const directory = photoDirectory();
  directory.create({ idempotent: true, intermediates: true });

  // A collision is extraordinarily unlikely, but checking also keeps copy
  // semantics deterministic if a native UUID source is ever mocked.
  for (let attempt = 0; attempt < 4; attempt++) {
    const logicalPath = createManagedPhotoPath(purpose, Crypto.randomUUID());
    const file = managedPhotoFile(logicalPath);
    if (!file.exists) return { logicalPath, file };
  }
  throw new Error('Could not allocate a unique managed photo path.');
}

function isImageAsset(asset: ImagePickerAsset): boolean {
  if (asset.type != null && asset.type !== 'image') return false;
  if (asset.mimeType != null && !asset.mimeType.toLowerCase().startsWith('image/')) return false;
  return true;
}

function isPickerError(
  result: ImagePickerResult | ImagePickerErrorResult
): result is ImagePickerErrorResult {
  return 'code' in result;
}

async function storeAsset(
  asset: ImagePickerAsset,
  purpose: PhotoPurpose,
  source: PhotoSource
): Promise<PhotoStoreResult> {
  if (!isImageAsset(asset)) {
    deleteCacheFileBestEffort(asset.uri);
    return { status: 'error', source, code: 'invalid-image' };
  }

  let resize;
  try {
    resize = planPhotoResize(asset.width, asset.height);
  } catch (error) {
    deleteCacheFileBestEffort(asset.uri);
    return { status: 'error', source, code: 'invalid-image', detail: errorDetail(error) };
  }

  let temporaryUri: string | undefined;
  let destination: File | undefined;
  let logicalPath: string | undefined;
  try {
    const context = ImageManipulator.manipulate(asset.uri);
    if (resize.resize) context.resize(resize.resize);
    const image = await context.renderAsync();
    const rendered = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: JPEG_QUALITY,
      base64: false,
    });
    temporaryUri = rendered.uri;

    let allocated;
    try {
      allocated = allocateDestination(purpose);
      destination = allocated.file;
      logicalPath = allocated.logicalPath;
      new File(rendered.uri).copy(destination);
      if (!destination.exists || destination.size <= 0) {
        throw new Error('The managed photo file is empty after copying.');
      }
    } catch (error) {
      if (destination?.exists) {
        try { destination.delete(); } catch { /* best-effort partial-save cleanup */ }
      }
      return { status: 'error', source, code: 'storage-failed', detail: errorDetail(error) };
    }

    return {
      status: 'saved',
      source,
      photo: {
        logicalPath,
        uri: destination.uri,
        mimeType: 'image/jpeg',
        width: rendered.width,
        height: rendered.height,
        size: destination.size,
      },
    };
  } catch (error) {
    return { status: 'error', source, code: 'processing-failed', detail: errorDetail(error) };
  } finally {
    deleteCacheFileBestEffort(temporaryUri, destination?.uri);
    deleteCacheFileBestEffort(asset.uri, destination?.uri);
  }
}

async function handlePickerResult(
  result: ImagePickerResult | ImagePickerErrorResult,
  purpose: PhotoPurpose,
  source: PhotoSource
): Promise<PhotoStoreResult> {
  if (isPickerError(result)) {
    return {
      status: 'error',
      source,
      code: 'picker-failed',
      detail: result.message,
      nativeCode: result.code,
    };
  }
  if (result.canceled) return { status: 'cancelled', source };
  const asset = result.assets[0];
  if (!asset) return { status: 'error', source, code: 'invalid-image' };
  return storeAsset(asset, purpose, source);
}

async function requestPermission(
  source: Exclude<PhotoSource, 'pending'>
): Promise<PhotoStoreResult | null> {
  const permission: PhotoPermission = source === 'camera' ? 'camera' : 'media-library';
  try {
    const response = source === 'camera'
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync(false);
    if (response.granted) return null;
    return {
      status: 'permission-denied',
      source,
      permission,
      canAskAgain: response.canAskAgain,
    };
  } catch (error) {
    return {
      status: 'error',
      source,
      code: 'permission-request-failed',
      detail: errorDetail(error),
    };
  }
}

export async function capturePhoto(purpose: PhotoPurpose): Promise<PhotoStoreResult> {
  if (Platform.OS === 'web') return unsupported('camera');
  const permissionResult = await requestPermission('camera');
  if (permissionResult) return permissionResult;
  try {
    await AsyncStorage.setItem(
      PENDING_PHOTO_REQUEST_KEY,
      JSON.stringify(createPendingPhotoRequest(purpose, Crypto.randomUUID(), Date.now()))
    );
  } catch (error) {
    return { status: 'error', source: 'camera', code: 'storage-failed', detail: errorDetail(error) };
  }
  try {
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
      base64: false,
      exif: false,
    });
    return await handlePickerResult(result, purpose, 'camera');
  } catch (error) {
    return { status: 'error', source: 'camera', code: 'picker-failed', detail: errorDetail(error) };
  } finally {
    await AsyncStorage.removeItem(PENDING_PHOTO_REQUEST_KEY).catch(() => undefined);
  }
}

export async function choosePhotoFromLibrary(purpose: PhotoPurpose): Promise<PhotoStoreResult> {
  if (Platform.OS === 'web') return unsupported('library');
  const permissionResult = await requestPermission('library');
  if (permissionResult) return permissionResult;
  try {
    await AsyncStorage.setItem(
      PENDING_PHOTO_REQUEST_KEY,
      JSON.stringify(createPendingPhotoRequest(purpose, Crypto.randomUUID(), Date.now()))
    );
  } catch (error) {
    return { status: 'error', source: 'library', code: 'storage-failed', detail: errorDetail(error) };
  }
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      selectionLimit: 1,
      quality: 1,
      base64: false,
      exif: false,
    });
    return await handlePickerResult(result, purpose, 'library');
  } catch (error) {
    return { status: 'error', source: 'library', code: 'picker-failed', detail: errorDetail(error) };
  } finally {
    await AsyncStorage.removeItem(PENDING_PHOTO_REQUEST_KEY).catch(() => undefined);
  }
}

/** Recover a picker result after Android destroys and recreates MainActivity. */
export async function recoverPendingPhoto(
  purpose: PhotoPurpose
): Promise<PhotoStoreResult | null> {
  if (Platform.OS !== 'android') return null;
  let storedRequest: string | null;
  try {
    storedRequest = await AsyncStorage.getItem(PENDING_PHOTO_REQUEST_KEY);
  } catch (error) {
    return { status: 'error', source: 'pending', code: 'storage-failed', detail: errorDetail(error) };
  }
  const request = parsePendingPhotoRequest(storedRequest);
  if (!request) {
    if (storedRequest != null) {
      await AsyncStorage.removeItem(PENDING_PHOTO_REQUEST_KEY).catch(() => undefined);
    }
    return null;
  }
  // After a full process restart, route state may reset. Never let the first
  // unrelated photo field relabel a product image as a customer ID or receipt.
  if (request.purpose !== purpose) return null;
  try {
    const result = await ImagePicker.getPendingResultAsync();
    if (result === null) return null;
    return handlePickerResult(result, purpose, 'pending');
  } catch (error) {
    return { status: 'error', source: 'pending', code: 'picker-failed', detail: errorDetail(error) };
  } finally {
    await AsyncStorage.removeItem(PENDING_PHOTO_REQUEST_KEY).catch(() => undefined);
  }
}

/** Resolve a logical database path without exposing any other document file. */
export function resolvePhotoUri(logicalPath: string): string {
  return managedPhotoFile(logicalPath).uri;
}

export function photoExists(logicalPath: string): boolean {
  return managedPhotoFile(logicalPath).exists;
}

/** Missing files are already deleted, making repeated cleanup safe. */
export function deletePhoto(logicalPath: string): void {
  const file = managedPhotoFile(logicalPath);
  if (file.exists) file.delete();
}
