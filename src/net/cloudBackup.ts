import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { SQLiteDatabase } from 'expo-sqlite';
import { entropyToMnemonic, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english.js';

import {
  cloudObjectIdForPhrase,
  decryptBackupJson,
  encryptBackupJson,
  normaliseRecoveryPhrase,
  type EncryptedBackupEnvelope,
} from '../core/encryption';
import {
  createBackup,
  normaliseBackup,
  type ShopTrackBackup,
} from '../core/db';

const RECOVERY_PHRASE_KEY = 'shoptrack_cloud_recovery_phrase_v1';

export interface CloudBackupStore {
  put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void>;
  get(objectId: string): Promise<unknown>;
}

/** Minimal backend-neutral object-store client. The payload is already encrypted. */
export class HttpCloudBackupStore implements CloudBackupStore {
  constructor(
    private readonly baseUrl: string,
    private readonly request: typeof fetch = fetch
  ) {}

  private url(objectId: string): string {
    return `${this.baseUrl.replace(/\/$/, '')}/${encodeURIComponent(objectId)}`;
  }

  async put(objectId: string, envelope: EncryptedBackupEnvelope): Promise<void> {
    const response = await this.request(this.url(objectId), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    });
    if (!response.ok) throw new Error(`Cloud backup upload failed (${response.status}).`);
  }

  async get(objectId: string): Promise<unknown> {
    const response = await this.request(this.url(objectId), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Cloud backup download failed (${response.status}).`);
    return response.json();
  }
}

export async function generateRecoveryPhrase(): Promise<string> {
  return entropyToMnemonic(await Crypto.getRandomBytesAsync(16), wordlist);
}

export function isValidRecoveryPhrase(phrase: string): boolean {
  return validateMnemonic(normaliseRecoveryPhrase(phrase), wordlist);
}

export async function rememberRecoveryPhrase(phrase: string): Promise<void> {
  const normalised = normaliseRecoveryPhrase(phrase);
  if (!validateMnemonic(normalised, wordlist)) throw new Error('Recovery phrase is not valid.');
  await SecureStore.setItemAsync(RECOVERY_PHRASE_KEY, normalised);
}

export async function loadRememberedRecoveryPhrase(): Promise<string | null> {
  return SecureStore.getItemAsync(RECOVERY_PHRASE_KEY);
}

export async function forgetRecoveryPhrase(): Promise<void> {
  await SecureStore.deleteItemAsync(RECOVERY_PHRASE_KEY);
}

export async function uploadEncryptedBackup(
  db: SQLiteDatabase,
  store: CloudBackupStore,
  phrase: string
): Promise<{ objectId: string; createdAt: string }> {
  const backup = await createBackup(db);
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
