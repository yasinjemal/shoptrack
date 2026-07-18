import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';
import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import {
  cloudObjectIdForPhrase,
  decryptBackupJson,
  encryptBackupJson,
  normaliseRecoveryPhrase,
} from '../core/encryption';
import {
  createBackup,
  normaliseBackup,
  type BackupMediaReader,
  type ShopTrackBackup,
} from '../core/db';
import type { CloudBackupStore } from './cloudBackupStore';

export { HttpCloudBackupStore, type CloudBackupStore } from './cloudBackupStore';

const RECOVERY_PHRASE_KEY = 'shoptrack_cloud_recovery_phrase_v1';

export async function generateRecoveryPhrase(): Promise<string> {
  return entropyToMnemonic(await Crypto.getRandomBytesAsync(16), wordlist);
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normaliseRecoveryPhrase(phrase), wordlist);
}

export async function rememberRecoveryPhrase(phrase: string): Promise<void> {
  const normalised = normaliseRecoveryPhrase(phrase);
  if (!validateMnemonic(normalised, wordlist)) throw new Error('Recovery phrase is not valid.');
  if (Platform.OS === 'web') throw new Error('Secure recovery-phrase storage is not available on web.');
  await SecureStore.setItemAsync(RECOVERY_PHRASE_KEY, normalised);
}

export async function loadRememberedRecoveryPhrase(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  return SecureStore.getItemAsync(RECOVERY_PHRASE_KEY);
}

export async function forgetRecoveryPhrase(): Promise<void> {
  if (Platform.OS === 'web') return;
  await SecureStore.deleteItemAsync(RECOVERY_PHRASE_KEY);
}

export async function uploadEncryptedBackup(
  db: SQLiteDatabase,
  store: CloudBackupStore,
  phrase: string,
  mediaReader: BackupMediaReader
): Promise<{ objectId: string; createdAt: string }> {
  const backup = await createBackup(db, mediaReader);
  const envelope = await encryptBackupJson(
    JSON.stringify(backup),
    phrase,
    backup.backup_format_version,
    length => Crypto.getRandomBytesAsync(length)
  );
  const objectId = cloudObjectIdForPhrase(phrase);
  await store.put(objectId, envelope);
  return { objectId, createdAt: envelope.created_at };
}

/** Download and validate without mutating SQLite; the UI can confirm before restore. */
export async function downloadEncryptedBackup(
  store: CloudBackupStore,
  phrase: string
): Promise<ShopTrackBackup> {
  const envelope = await store.get(cloudObjectIdForPhrase(phrase));
  const json = await decryptBackupJson(envelope, phrase);
  try {
    return normaliseBackup(JSON.parse(json));
  } catch (error) {
    if (error instanceof Error) throw new Error(`Decrypted backup is invalid: ${error.message}`);
    throw new Error('Decrypted backup is invalid.');
  }
}
