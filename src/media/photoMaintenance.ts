import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import {
  MANAGED_PHOTO_DIRECTORY,
  findOrphanedPhotoPaths,
  parseManagedPhotoPath,
} from '../core/photo';

interface PhotoPathRow {
  path: string;
}

export interface PhotoMaintenanceResult {
  deleted: number;
  failed: number;
  missingReferenced: string[];
}

/**
 * Reconcile the private media root after process death. Pickers must write a
 * file before SQLite can own it, so a crash in that narrow gap can leave a
 * draft behind. Startup is the safe sweep point: no form is then holding a
 * legitimate uncommitted file.
 */
export async function sweepOrphanedPhotos(
  db: SQLiteDatabase
): Promise<PhotoMaintenanceResult> {
  if (Platform.OS === 'web') return { deleted: 0, failed: 0, missingReferenced: [] };

  const referencedRows = await db.getAllAsync<PhotoPathRow>(`
    SELECT photo_path AS path FROM products WHERE photo_path IS NOT NULL
    UNION ALL
    SELECT photo_path AS path FROM customers WHERE photo_path IS NOT NULL
    UNION ALL
    SELECT receipt_photo_path AS path FROM expenses WHERE receipt_photo_path IS NOT NULL
  `);
  const referenced = referencedRows
    .map(row => parseManagedPhotoPath(row.path)?.path)
    .filter((path): path is string => path != null);

  const root = new Directory(Paths.document, MANAGED_PHOTO_DIRECTORY);
  if (!root.exists) {
    return { deleted: 0, failed: 0, missingReferenced: [...new Set(referenced)].sort() };
  }

  const stored = root.list()
    .filter((item): item is File => item instanceof File)
    .map(file => `${MANAGED_PHOTO_DIRECTORY}/${file.name}`)
    .filter(path => parseManagedPhotoPath(path) != null);
  const storedSet = new Set(stored);
  let deleted = 0;
  let failed = 0;
  for (const path of findOrphanedPhotoPaths(stored, referenced)) {
    try {
      const file = new File(Paths.document, path);
      if (file.exists) file.delete();
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  return {
    deleted,
    failed,
    missingReferenced: [...new Set(referenced.filter(path => !storedSet.has(path)))].sort(),
  };
}
