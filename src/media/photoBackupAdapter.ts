import * as Crypto from 'expo-crypto';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  MEDIA_RESTORE_TOKEN_SETTING,
  type BackupMediaAsset,
  type BackupMediaReader,
  type RestoreMediaAdapter,
  type StagedMediaRestore,
} from '../core/db';
import {
  MANAGED_PHOTO_DIRECTORY,
  isManagedJpegBytes,
  isValidPhotoUniqueId,
  parseManagedPhotoPath,
} from '../core/photo';

type RestoreState = 'staged' | 'commit-started' | 'committed' | 'rolled-back' | 'finalized';

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const RESTORE_JOURNAL_FILE = 'shoptrack-media-restore-journal-v1.json';

interface RestoreJournal {
  version: 1;
  token: string;
  stagingName: string;
  rollbackName: string;
  hadActiveRoot: boolean;
}

function managedRoot(): Directory {
  return new Directory(Paths.document, MANAGED_PHOTO_DIRECTORY);
}

function siblingDirectory(name: string): Directory {
  return new Directory(Paths.document, name);
}

function removeDirectoryIfPresent(directory: Directory): void {
  if (directory.exists) directory.delete();
}

function journalFile(): File {
  return new File(Paths.document, RESTORE_JOURNAL_FILE);
}

function removeJournalIfPresent(): void {
  const file = journalFile();
  if (file.exists) file.delete();
}

function parseRestoreJournal(raw: string): RestoreJournal | null {
  try {
    const value = JSON.parse(raw) as Partial<RestoreJournal>;
    if (
      value.version !== 1
      || !isValidPhotoUniqueId(value.token)
      || value.stagingName !== `${MANAGED_PHOTO_DIRECTORY}-restore-${value.token}`
      || value.rollbackName !== `${MANAGED_PHOTO_DIRECTORY}-rollback-${value.token}`
      || typeof value.hadActiveRoot !== 'boolean'
    ) return null;
    return value as RestoreJournal;
  } catch {
    return null;
  }
}

function allocateArtifactNames(): { token: string; stagingName: string; rollbackName: string } {
  for (let attempt = 0; attempt < 4; attempt++) {
    const id = Crypto.randomUUID();
    const stagingName = `${MANAGED_PHOTO_DIRECTORY}-restore-${id}`;
    const rollbackName = `${MANAGED_PHOTO_DIRECTORY}-rollback-${id}`;
    if (!siblingDirectory(stagingName).exists && !siblingDirectory(rollbackName).exists) {
      return { token: id, stagingName, rollbackName };
    }
  }
  throw new Error('Could not allocate a unique ShopTrack media restore directory.');
}

function parsedFilename(path: unknown): string {
  const parsed = parseManagedPhotoPath(path);
  if (!parsed) {
    throw new Error('Backup media path is not a ShopTrack-managed JPEG path.');
  }
  return `${parsed.purpose}-${parsed.uniqueId}.jpg`;
}

async function readMedia(path: string): Promise<{ mime_type: 'image/jpeg'; base64: string }> {
  // Re-parse at the file-system boundary even when the path originated in
  // SQLite. This is the last guard before joining user-controlled data to a URI.
  parsedFilename(path);
  const file = new File(Paths.document, path);
  if (!file.exists || file.size <= 0) {
    throw new Error(`Backup media is missing or empty: ${path}`);
  }

  if (!isManagedJpegBytes(await file.bytes())) {
    throw new Error(`Backup media is not a valid-sized JPEG: ${path}`);
  }

  const base64 = await file.base64();
  if (base64.length === 0 || base64.length % 4 !== 0 || !BASE64.test(base64)) {
    throw new Error(`Backup media could not be encoded as canonical base64: ${path}`);
  }
  return { mime_type: 'image/jpeg', base64 };
}

async function stageRestore(assets: readonly BackupMediaAsset[]): Promise<StagedMediaRestore> {
  const filenames = new Set<string>();
  const parsedAssets = assets.map(asset => {
    const filename = parsedFilename(asset.path);
    if (asset.mime_type !== 'image/jpeg') {
      throw new Error(`Backup media must be image/jpeg: ${asset.path}`);
    }
    if (asset.base64.length === 0 || asset.base64.length % 4 !== 0 || !BASE64.test(asset.base64)) {
      throw new Error(`Backup media has invalid base64: ${asset.path}`);
    }
    if (filenames.has(filename)) {
      throw new Error(`Backup media path is duplicated: ${asset.path}`);
    }
    filenames.add(filename);
    return { asset, filename };
  });

  if (journalFile().exists) {
    throw new Error('An interrupted ShopTrack media restore must be recovered before starting another.');
  }
  const { token, stagingName, rollbackName } = allocateArtifactNames();
  const hadActiveRoot = managedRoot().exists;
  const staging = siblingDirectory(stagingName);
  staging.create({ intermediates: true });

  try {
    journalFile().write(JSON.stringify({
      version: 1,
      token,
      stagingName,
      rollbackName,
      hadActiveRoot,
    } satisfies RestoreJournal));

    for (const { asset, filename } of parsedAssets) {
      const file = new File(staging, filename);
      // Decode into a sibling staging root. The live root remains untouched
      // until core's SQLite transaction asks commit() to activate this set.
      file.write(asset.base64, { encoding: 'base64' });
      if (!file.exists || file.size <= 0) {
        throw new Error(`Restored media is empty after decoding: ${asset.path}`);
      }
      if (!isManagedJpegBytes(await file.bytes())) {
        throw new Error(`Restored media is not a valid-sized JPEG: ${asset.path}`);
      }
    }
  } catch (error) {
    removeDirectoryIfPresent(siblingDirectory(stagingName));
    removeJournalIfPresent();
    throw error;
  }

  let state: RestoreState = 'staged';

  return {
    recoveryToken: token,
    async commit(): Promise<void> {
      if (state === 'committed') return;
      if (state !== 'staged') {
        throw new Error('The staged ShopTrack media restore cannot be committed in its current state.');
      }
      state = 'commit-started';

      const active = managedRoot();
      const rollback = siblingDirectory(rollbackName);
      const pending = siblingDirectory(stagingName);
      if (!pending.exists) throw new Error('The staged ShopTrack media directory is missing.');

      // Keep the previous complete root beside the new one until SQLite has
      // committed. rollback() can therefore undo a staged or activated swap.
      // The durable journal plus the token written inside SQLite's restore
      // transaction let startup decide whether this swap won or rolled back.
      if (active.exists) active.move(rollback);
      pending.move(managedRoot());
      state = 'committed';
    },

    async rollback(): Promise<void> {
      if (state === 'rolled-back') return;
      if (state === 'finalized') return;

      const active = managedRoot();
      const rollback = siblingDirectory(rollbackName);
      const pending = siblingDirectory(stagingName);

      if (rollback.exists) {
        // An old root was retained, so any current active root is the staged
        // replacement (including a move that completed before throwing).
        if (active.exists) active.delete();
        rollback.move(managedRoot());
      } else if (!hadActiveRoot && state !== 'staged' && active.exists && !pending.exists) {
        // The restore began with no media root and activated the staged root;
        // restoring the old state therefore means removing it completely.
        active.delete();
      }

      removeDirectoryIfPresent(siblingDirectory(stagingName));
      removeDirectoryIfPresent(siblingDirectory(rollbackName));
      removeJournalIfPresent();
      state = 'rolled-back';
    },

    async finalize(): Promise<void> {
      if (state === 'finalized') return;
      if (state !== 'committed') {
        throw new Error('ShopTrack media can only be finalized after it is committed.');
      }
      // SQLite is durable now. Deleting these private artifacts is safe and
      // idempotent; no unrelated file under the documents directory is listed.
      removeDirectoryIfPresent(siblingDirectory(rollbackName));
      removeDirectoryIfPresent(siblingDirectory(stagingName));
      // Delete the journal before core clears SQLite's token. If the process
      // dies between those operations, startup sees a harmless token with no
      // journal and clears it without touching the active root.
      removeJournalIfPresent();
      state = 'finalized';
    },
  };
}

/** Expo file-system implementation shared by every production backup path. */
export const photoBackupMediaAdapter: BackupMediaReader & RestoreMediaAdapter = {
  readMedia,
  stageRestore,
};

export type InterruptedPhotoRestoreRecovery =
  | 'none'
  | 'rolled-back'
  | 'finalized'
  | 'cleared-marker';

/** Reconcile a restore interrupted by process death before orphan sweeping. */
export async function recoverInterruptedPhotoRestore(
  db: SQLiteDatabase
): Promise<InterruptedPhotoRestoreRecovery> {
  const tokenRow = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?',
    [MEDIA_RESTORE_TOKEN_SETTING]
  );
  const committedToken = tokenRow?.value ?? null;
  const file = journalFile();
  if (!file.exists) {
    if (committedToken != null) {
      await db.runAsync('DELETE FROM settings WHERE key = ?', [MEDIA_RESTORE_TOKEN_SETTING]);
      return 'cleared-marker';
    }
    return 'none';
  }

  const journal = parseRestoreJournal(await file.text());
  if (!journal) {
    // An invalid fixed-name journal cannot safely authorize directory moves.
    // Remove only it and the internal marker; leave every media directory for
    // diagnostics instead of guessing which one owns the shop's photos.
    removeJournalIfPresent();
    if (committedToken != null) {
      await db.runAsync('DELETE FROM settings WHERE key = ?', [MEDIA_RESTORE_TOKEN_SETTING]);
    }
    return 'cleared-marker';
  }

  const active = managedRoot();
  const pending = siblingDirectory(journal.stagingName);
  const rollback = siblingDirectory(journal.rollbackName);

  if (committedToken === journal.token) {
    // SQLite committed, so the staged root is authoritative. A normal commit
    // already moved it to active; the pending fallback handles a move that was
    // durable even though app state was lost immediately afterward.
    if (!active.exists && pending.exists) pending.move(active);
    if (!active.exists) {
      throw new Error('Committed ShopTrack restore media is missing; recovery stopped safely.');
    }
    removeDirectoryIfPresent(rollback);
    removeDirectoryIfPresent(pending);
    removeJournalIfPresent();
    await db.runAsync('DELETE FROM settings WHERE key = ?', [MEDIA_RESTORE_TOKEN_SETTING]);
    return 'finalized';
  }

  // SQLite did not commit. Put the prior complete root back, or remove the new
  // root when the old shop genuinely had no media directory.
  if (rollback.exists) {
    if (active.exists) active.delete();
    rollback.move(active);
  } else if (!journal.hadActiveRoot && active.exists && !pending.exists) {
    active.delete();
  }
  removeDirectoryIfPresent(pending);
  removeDirectoryIfPresent(rollback);
  removeJournalIfPresent();
  if (committedToken != null) {
    await db.runAsync('DELETE FROM settings WHERE key = ?', [MEDIA_RESTORE_TOKEN_SETTING]);
  }
  return 'rolled-back';
}
