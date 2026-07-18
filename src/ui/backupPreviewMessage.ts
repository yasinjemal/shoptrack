import type { BackupPreview } from '../core/backupPreview';
import type { Strings } from '../i18n';

/** Compact localized facts shared by local-file and encrypted-cloud restore prompts. */
export function renderBackupPreviewMessage(
  preview: BackupPreview,
  strings: Strings
): string {
  const when = preview.createdAt == null
    ? strings.NOT_AVAILABLE
    : strings.FORMAT_WHEN(preview.createdAt);
  return [
    preview.shopName,
    strings.CLOUD_VIEWER_BACKUP_AT(when),
    `${strings.PRODUCTS_LABEL}: ${preview.products}`,
    `${strings.COUNT_STOCK}: ${preview.countSessions}`,
    `${strings.CREDIT_TITLE}: ${preview.customers}`,
    `${strings.EXPENSES_TITLE}: ${preview.expenses}`,
    `${strings.CASHUP_HISTORY}: ${preview.cashUps}`,
    `${strings.SALES_TITLE}: ${preview.salesEntries}`,
    `${strings.STAFF_MODE}: ${preview.staffMembers}`,
    `${strings.PHOTO_LABEL}: ${preview.photos}`,
    '',
    strings.RESTORE_SAFETY_SNAPSHOT_HINT,
  ].filter((line): line is string => line != null).join('\n');
}
