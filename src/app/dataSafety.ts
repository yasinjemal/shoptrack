import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  createBackup,
  getSetting,
  parseBackupText,
  restoreBackup,
  setSetting,
} from '../core/db';
import {
  AutomaticCloudBackupCoordinator,
  planAutomaticCloudBackup,
  type AutomaticCloudBackupResult,
} from '../core/cloudBackupOutbox';
import { photoBackupMediaAdapter } from '../media/photoBackupAdapter';
import {
  isValidRecoveryPhrase,
  loadRememberedRecoveryPhrase,
  uploadEncryptedBackup,
  type CloudBackupStore,
} from '../net/cloudBackup';
import {
  backupFilesToDelete,
  createCrashRecord,
  dailyBackupFilename,
  parseCrashRecord,
  preRestoreBackupFilename,
  type CrashRecord,
} from '../core/safety';

export const LAST_CRASH_SETTING = 'last_crash';
export const LAST_SHARED_BACKUP_SETTING = 'last_shared_backup_at';
/** Device-local by design: restoring a backup must not silently create a second writer. */
export const AUTOMATIC_CLOUD_BACKUP_OPT_IN_KEY = 'shoptrack_auto_cloud_backup_opt_in_v1';
const PENDING_CRASH_KEY = 'shoptrack_pending_crash';
const AUTO_BACKUP_FOLDER = 'shoptrack-backups';
const PRE_RESTORE_BACKUP_RETENTION = 3;

type ErrorUtilsLike = {
  getGlobalHandler?: () => (error: Error, isFatal?: boolean) => void;
  setGlobalHandler?: (handler: (error: Error, isFatal?: boolean) => void) => void;
};

/** Install before React mounts, while preserving React Native's own handler. */
export function installGlobalCrashCapture(buildVersion: string): () => void {
  const errorUtils = (globalThis as typeof globalThis & { ErrorUtils?: ErrorUtilsLike }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return () => undefined;

  const previous = errorUtils.getGlobalHandler?.();
  const handler = (error: Error, isFatal = true) => {
    const record = createCrashRecord(error, buildVersion, Date.now(), isFatal);
    // Fatal handlers cannot delay process shutdown. AsyncStorage queues the
    // write; the next launch drains it into the backed-up settings table.
    void AsyncStorage.setItem(PENDING_CRASH_KEY, JSON.stringify(record));
    previous?.(error, isFatal);
  };
  errorUtils.setGlobalHandler(handler);
  return () => { if (previous) errorUtils.setGlobalHandler?.(previous); };
}

/** Move evidence from phone-local staging into SQLite so every backup has it. */
export async function flushPendingCrash(db: SQLiteDatabase): Promise<CrashRecord | null> {
  const raw = await AsyncStorage.getItem(PENDING_CRASH_KEY);
  const record = parseCrashRecord(raw);
  if (!record) {
    if (raw != null) await AsyncStorage.removeItem(PENDING_CRASH_KEY);
    return null;
  }
  await setSetting(db, LAST_CRASH_SETTING, JSON.stringify(record), record.occurred_at);
  await AsyncStorage.removeItem(PENDING_CRASH_KEY);
  return record;
}

export interface DailyBackupResult {
  uri: string;
  /** True only when this call wrote today's snapshot for the first time. */
  created: boolean;
}

/** One idempotent snapshot per local day, retaining the newest seven. */
export async function ensureDailyBackup(
  db: SQLiteDatabase,
  now = Date.now()
): Promise<DailyBackupResult> {
  // Web is a validation surface, not a pretend phone filesystem. Shared JSON
  // backup still works there; automatic device snapshots are native-only.
  if (Platform.OS === 'web') return { uri: '', created: false };
  const directory = new Directory(Paths.document, AUTO_BACKUP_FOLDER);
  directory.create({ idempotent: true, intermediates: true });

  const file = new File(directory, dailyBackupFilename(now));
  const created = !file.exists;
  if (created) file.write(JSON.stringify(await createBackup(db, photoBackupMediaAdapter)));

  const backupUris = directory.list()
    .filter(item => item instanceof File && item.uri.includes('shoptrack-auto-') && item.uri.endsWith('.json'))
    .map(item => item.uri);
  for (const uri of backupFilesToDelete(backupUris, 7)) new File(uri).delete();
  return { uri: file.uri, created };
}

/**
 * Persist a private, complete snapshot immediately before a destructive restore.
 *
 * A missing photo or failed file write is deliberately fatal to this step: the
 * caller must abort the restore instead of replacing the only recoverable copy
 * of the current shop. Android OS backup is disabled for the app, so these
 * customer-photo-bearing files remain inside ShopTrack's private storage.
 */
export async function createPreRestoreSafetySnapshot(
  db: SQLiteDatabase,
  now = Date.now()
): Promise<string> {
  if (Platform.OS === 'web') {
    throw new Error('Pre-restore safety snapshots require ShopTrack private device storage.');
  }

  const directory = new Directory(Paths.document, AUTO_BACKUP_FOLDER);
  directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, preRestoreBackupFilename(now));
  file.write(JSON.stringify(await createBackup(db, photoBackupMediaAdapter)));
  if (!file.exists || file.size <= 0) {
    throw new Error('ShopTrack could not verify the pre-restore safety snapshot.');
  }

  const snapshotUris = directory.list()
    .filter(item => item instanceof File
      && item.uri.includes('shoptrack-before-restore-')
      && item.uri.endsWith('.json'))
    .map(item => item.uri);
  for (const uri of backupFilesToDelete(snapshotUris, PRE_RESTORE_BACKUP_RETENTION)) {
    new File(uri).delete();
  }
  return file.uri;
}

/** The only production restore entry point: snapshot first, then replace data transactionally. */
export async function restoreBackupWithSafetySnapshot(
  db: SQLiteDatabase,
  backup: unknown,
  now = Date.now()
): Promise<string> {
  const snapshotUri = await createPreRestoreSafetySnapshot(db, now);
  await restoreBackup(db, backup, photoBackupMediaAdapter);
  return snapshotUri;
}

/** Restore the exact private snapshot returned by restoreBackupWithSafetySnapshot. */
export async function undoRestoreFromSafetySnapshot(
  db: SQLiteDatabase,
  snapshotUri: string
): Promise<void> {
  const file = new File(snapshotUri);
  if (!file.exists || file.size <= 0) {
    throw new Error('The pre-restore safety snapshot is missing.');
  }
  const backup = parseBackupText(await file.text());
  // Snapshot the newly-restored state too, so even Undo remains reversible.
  await restoreBackupWithSafetySnapshot(db, backup);
}

export interface AutomaticCloudBackupOptions {
  /** Comes from the explicit device-local owner control. Default is off. */
  optedIn: boolean;
  /** Plus is checked separately so an opt-in cannot bypass entitlement policy. */
  entitled: boolean;
  /** Null until a real authenticated object-store implementation is configured. */
  store: CloudBackupStore | null;
  /** Only a newly-created daily snapshot queues a new revision; launches retry pending work. */
  newSnapshot: boolean;
}

/**
 * Queue an encrypted upload after the local snapshot without delaying startup.
 *
 * This intentionally returns void: local SQLite and the seven-file snapshot
 * are the startup-critical path. The persistent outbox retains a failed push
 * for the next launch, while disabled/unconfigured builds perform no storage,
 * secure-store, encryption, or network work here.
 */
export function scheduleAutomaticCloudBackup(
  db: SQLiteDatabase,
  { optedIn, entitled, store, newSnapshot }: AutomaticCloudBackupOptions,
  onResult: (result: AutomaticCloudBackupResult) => void = result => {
    if (result.status === 'failed') console.error('Automatic cloud backup error:', result.error);
  }
): void {
  // Keep the production-disabled path synchronously inert. The coordinator
  // repeats both checks so tests and future callers cannot bypass the gate.
  const plan = planAutomaticCloudBackup({
    optedIn,
    entitled,
    storeConfigured: store != null,
    newSnapshot,
  });
  if (plan === 'disabled' || !store) return;

  const coordinator = new AutomaticCloudBackupCoordinator({
    storage: AsyncStorage,
    clock: Date.now,
    isOptedIn: () => optedIn && entitled,
    isStoreConfigured: () => store != null,
    loadRecoveryPhrase: loadRememberedRecoveryPhrase,
    isRecoveryPhraseValid: isValidRecoveryPhrase,
    upload: async phrase => {
      await uploadEncryptedBackup(db, store, phrase, photoBackupMediaAdapter);
    },
  });
  const attempt = plan === 'request' ? coordinator.requestPush() : coordinator.retryPending();
  void attempt.then(onResult);
}

export async function isAutomaticCloudBackupOptedIn(): Promise<boolean> {
  return (await AsyncStorage.getItem(AUTOMATIC_CLOUD_BACKUP_OPT_IN_KEY)) === '1';
}

export async function setAutomaticCloudBackupOptIn(
  optedIn: boolean
): Promise<void> {
  await AsyncStorage.setItem(AUTOMATIC_CLOUD_BACKUP_OPT_IN_KEY, optedIn ? '1' : '0');
}

export async function lastSharedBackupAt(db: SQLiteDatabase): Promise<number | null> {
  const value = Number(await getSetting(db, LAST_SHARED_BACKUP_SETTING));
  return Number.isFinite(value) && value > 0 ? value : null;
}
