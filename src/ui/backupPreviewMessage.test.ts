import assert from 'node:assert/strict';

import type { BackupPreview } from '../core/backupPreview';
import { en } from '../i18n/en';
import { renderBackupPreviewMessage } from './backupPreviewMessage';

const preview: BackupPreview = {
  createdAt: null,
  shopName: "Nomsa's Shop",
  products: 4,
  stockMovements: 8,
  countSessions: 2,
  customers: 3,
  creditEntries: 7,
  expenses: 5,
  cashUps: 6,
  salesEntries: 9,
  staffMembers: 1,
  photos: 2,
};

const message = renderBackupPreviewMessage(preview, en);
assert.ok(message.includes("Nomsa's Shop"));
assert.ok(message.includes('Backup from not available'));
assert.ok(message.includes('Products: 4'));
assert.ok(message.includes('Count Stock: 2'));
assert.ok(message.includes('Credit Book: 3'));
assert.ok(message.includes(`${en.PHOTO_LABEL}: 2`));
assert.ok(message.endsWith(en.RESTORE_SAFETY_SNAPSHOT_HINT));

console.log('backup preview presentation tests passed');
