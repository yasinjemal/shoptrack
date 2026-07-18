import assert from 'node:assert/strict';

import { buildBackupPreview } from './backupPreview';
import { BACKUP_FORMAT_VERSION } from './db';

const backup = {
  shoptrack_backup: true,
  backup_format_version: BACKUP_FORMAT_VERSION,
  schema_version: 11,
  created_at: '2026-07-18T09:30:00.000Z',
  data: {
    products: [
      { id: 1, name: 'Bread', is_active: 1, photo_path: null },
      { id: 2, name: 'Old line', is_active: 0, photo_path: null },
    ],
    stock_movements: [],
    count_sessions: [],
    customers: [
      { id: 1, name: 'Lerato', is_active: 1, photo_path: null },
      { id: 2, name: 'Archived', is_active: 0, photo_path: null },
    ],
    credit_entries: [{ id: 1 }],
    expenses: [{ id: 1 }, { id: 2 }],
    cash_ups: [],
    sales_entries: [{ id: 1 }, { id: 2 }, { id: 3 }],
    settings: [
      { key: 'currency', value: 'ZAR' },
      { key: 'shop_name', value: '  Nomsa\'s Shop  ' },
    ],
    staff_members: [
      { id: 1, name: 'Nomsa', is_active: 1 },
      { id: 2, name: 'Former worker', is_active: 0 },
    ],
    media: [],
  },
};

assert.deepEqual(buildBackupPreview(backup), {
  createdAt: Date.parse('2026-07-18T09:30:00.000Z'),
  shopName: "Nomsa's Shop",
  products: 1,
  stockMovements: 0,
  countSessions: 0,
  customers: 1,
  creditEntries: 1,
  expenses: 2,
  cashUps: 0,
  salesEntries: 3,
  staffMembers: 1,
  photos: 0,
});

const old = structuredClone(backup);
old.backup_format_version = 1 as typeof BACKUP_FORMAT_VERSION;
old.created_at = 'not-a-date';
old.data.settings = [];
assert.equal(buildBackupPreview(old).createdAt, null);
assert.equal(buildBackupPreview(old).shopName, null);

assert.throws(
  () => buildBackupPreview({ ...backup, shoptrack_backup: false }),
  /Not a ShopTrack backup/
);

console.log('backup preview tests passed');
