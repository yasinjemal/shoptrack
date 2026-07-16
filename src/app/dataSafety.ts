import AsyncStorage from '@react-native-async-storage/async-storage';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import { createBackup, getSetting, setSetting } from '../core/db';
import {
  backupFilesToDelete,
  createCrashRecord,
  dailyBackupFilename,
  parseCrashRecord,
  type CrashRecord,
} from '../core/safety';

export const LAST_CRASH_SETTING = 'last_crash';
export const LAST_SHARED_BACKUP_SETTING = 'last_shared_backup_at';
const PENDING_CRASH_KEY = 'shoptrack_pending_crash';
const AUTO_BACKUP_FOLDER = 'shoptrack-backups';

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

/** One idempotent snapshot per local day, retaining the newest seven. */
export async function ensureDailyBackup(db: SQLiteDatabase, now = Date.now()): Promise<string> {
  const directory = new Directory(Paths.document, AUTO_BACKUP_FOLDER);
  directory.create({ idempotent: true, intermediates: true });

  const file = new File(directory, dailyBackupFilename(now));
  if (!file.exists) file.write(JSON.stringify(await createBackup(db)));

  const backupUris = directory.list()
    .filter(item => item instanceof File && item.uri.includes('shoptrack-auto-') && item.uri.endsWith('.json'))
    .map(item => item.uri);
  for (const uri of backupFilesToDelete(backupUris, 7)) new File(uri).delete();
  return file.uri;
}

export async function lastSharedBackupAt(db: SQLiteDatabase): Promise<number | null> {
  const value = Number(await getSetting(db, LAST_SHARED_BACKUP_SETTING));
  return Number.isFinite(value) && value > 0 ? value : null;
}

