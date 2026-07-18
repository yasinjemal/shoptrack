import { normaliseBackup } from './db';

export interface BackupPreview {
  /** Parsed UTC timestamp, or null when an old backup has no usable date. */
  createdAt: number | null;
  shopName: string | null;
  products: number;
  stockMovements: number;
  countSessions: number;
  customers: number;
  creditEntries: number;
  expenses: number;
  cashUps: number;
  salesEntries: number;
  staffMembers: number;
  photos: number;
}

function isActive(row: Record<string, unknown>): boolean {
  return row.is_active == null || row.is_active === 1 || row.is_active === true;
}

/**
 * Validate a backup and return the small, sentence-free summary a restore UI
 * needs. Keeping this in core lets local-file and encrypted-cloud restores use
 * exactly the same facts without teaching either screen about backup tables.
 */
export function buildBackupPreview(value: unknown): BackupPreview {
  const backup = normaliseBackup(value);
  const parsedDate = Date.parse(backup.created_at);
  const shopNameSetting = backup.data.settings.find(
    setting => setting.key === 'shop_name' && typeof setting.value === 'string'
  );
  const cleanShopName = shopNameSetting?.value.trim() ?? '';

  return {
    createdAt: Number.isFinite(parsedDate) ? parsedDate : null,
    shopName: cleanShopName ? cleanShopName.slice(0, 80) : null,
    products: backup.data.products.filter(isActive).length,
    stockMovements: backup.data.stock_movements.length,
    countSessions: backup.data.count_sessions.length,
    customers: backup.data.customers.filter(isActive).length,
    creditEntries: backup.data.credit_entries.length,
    expenses: backup.data.expenses.length,
    cashUps: backup.data.cash_ups.length,
    salesEntries: backup.data.sales_entries.length,
    staffMembers: backup.data.staff_members.filter(isActive).length,
    photos: backup.data.media.length,
  };
}
