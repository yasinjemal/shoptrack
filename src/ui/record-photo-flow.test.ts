/**
 * Customer and receipt photo screen-contract checks.
 *
 * Native pickers and the file-system adapter have their own focused tests.
 * These checks pin the UI wiring most likely to leak a draft file or persist a
 * photo outside the database operation that owns its reference.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const credit = readFileSync(join(root, 'src', 'ui', 'credit', 'CreditScreen.tsx'), 'utf8');
const expenses = readFileSync(join(root, 'src', 'ui', 'expenses', 'ExpensesScreen.tsx'), 'utf8');
const db = readFileSync(join(root, 'src', 'core', 'db.ts'), 'utf8');
const manageStart = credit.indexOf('function ManageCustomerScreen');
const addCustomerStart = credit.indexOf('function AddCustomerScreen');
const manageCustomer = manageStart >= 0 && addCustomerStart > manageStart
  ? credit.slice(manageStart, addCustomerStart)
  : '';

let failures = 0;

function check(condition: boolean, label: string) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

console.log('========================================');
console.log('TEST: customer and receipt photo flows');
console.log('========================================');

check(
  /setCustomerPhotoPaths\(new Map\([\s\S]*customer\.photo_path/.test(credit) &&
    /photoPath=\{customerPhotoPaths\.get\(balance\.customer_id\) \?\? null\}/.test(credit),
  'credit refresh retains each customer photo after summary calculation'
);
check(
  /<PhotoField[\s\S]*purpose="customer"[\s\S]*photoPath=\{photoPath\}/.test(credit),
  'add-customer offers the shared customer photo field'
);
check(
  /addCustomerToBook\([\s\S]*\{ name, phone: phone \|\| null, photoPath \}/.test(credit),
  'customer photo path is passed inside the atomic customer-and-credit operation'
);
check(
  /photoCommittedRef\.current = true;[\s\S]*onSaved\(\)/.test(credit) &&
    /photoCommittedRef\.current \|\| photoCommitInFlightRef\.current/.test(credit) &&
    /else if \(!photoCommittedRef\.current\)[\s\S]*deleteDraftPhoto\(failedDraftPath\)/.test(credit),
  'successful customer save commits the photo before unmount cleanup runs'
);
check(
  /handlePhotoChange[\s\S]*previousPath[\s\S]*deleteDraftPhoto\(previousPath\)/.test(credit) &&
    /handleCancel[\s\S]*cleanupDraftPhoto\(\)[\s\S]*onCancel\(\)/.test(credit),
  'customer photo replace/remove and Cancel delete only the uncommitted draft'
);
check(
  /if \(mode\.kind === 'add_customer' \|\| mode\.kind === 'manage_customer'\) return;/.test(credit) &&
    /registerHardwareBackOverride\(\(\) => \{[\s\S]*handleCancel\(\)/.test(credit),
  'customer form owns Android Back through the same cleanup wrapper as Cancel'
);
check(
  /resolvePhotoUri\(photoPath\)/.test(credit) &&
    /accessibilityLabel=\{`\$\{strings\.CUSTOMER_PHOTO\}: \$\{balance\.customer_name\}`\}/.test(credit),
  'customer cards render an optional, accessibly labelled thumbnail'
);
check(
  credit.includes("kind: 'manage_customer'")
    && credit.includes('onManage={() => setMode({')
    && credit.includes('accessibilityLabel={strings.CREDIT_MANAGE_CUSTOMER}'),
  'every customer card exposes the focused manage-customer mode'
);
check(
  manageCustomer.includes('<PhotoField')
    && manageCustomer.includes('purpose="customer"')
    && manageCustomer.includes('photoPath={photoPath}')
    && manageCustomer.includes('initialPhotoPath: string | null'),
  'manage-customer shows and can replace or remove the existing photo'
);

const customerPhotoSql = manageCustomer.indexOf('await setCustomerPhotoPath(');
const replacedCustomerFile = manageCustomer.indexOf('discardManagedCustomerPhoto(replacedPath)');
check(
  customerPhotoSql >= 0 && replacedCustomerFile > customerPhotoSql
    && manageCustomer.includes('replacedPath !== nextPath'),
  'manage-customer deletes a replaced persisted photo only after SQL commits'
);
check(
  manageCustomer.includes('current !== original && current !== nextPath')
    && manageCustomer.includes('cleanupDraftPhoto();')
    && manageCustomer.includes('currentPhotoRef.current = original;'),
  'replace, remove, Cancel and unmount discard only a distinct customer draft'
);
check(
  manageCustomer.includes('if (finishedRef.current || operationRef.current) return;')
    && manageCustomer.includes('cleanupFailedUnmountedDraft();')
    && manageCustomer.includes('if (failedDraftPath != null && failedDraftPath !== original)'),
  'in-flight customer writes preserve persisted files and clean a failed unmounted draft'
);
check(
  manageCustomer.includes('registerHardwareBackOverride(() => {')
    && manageCustomer.includes('handleCancel();')
    && credit.includes("mode.kind === 'add_customer' || mode.kind === 'manage_customer'"),
  'manage-customer owns Android Back through the same cleanup path as Cancel'
);

const deactivateSql = manageCustomer.indexOf('await deactivateCustomer(db, customer.customer_id)');
const deactivatePersistedFile = manageCustomer.indexOf('discardManagedCustomerPhoto(persistedPath)');
check(
  manageCustomer.includes('{customer.balance === 0 && (')
    && manageCustomer.includes('if (customer.balance !== 0 || operationRef.current) return;')
    && db.includes("if (!Number.isFinite(row.balance) || row.balance !== 0)"),
  'customer deactivation is available only at exact zero and is rechecked in SQL'
);
check(
  deactivateSql >= 0 && deactivatePersistedFile > deactivateSql
    && manageCustomer.includes('draftPath !== persistedPath'),
  'deactivation clears SQL first, then deletes the persisted photo and any distinct draft'
);

check(
  /<PhotoField[\s\S]*purpose="receipt"[\s\S]*photoPath=\{receiptPhotoPath\}/.test(expenses),
  'add-expense offers the shared receipt photo field'
);
check(
  /recordExpense\([\s\S]*Date\.now\(\),[\s\S]*receiptPhotoPath[\s\S]*\)/.test(expenses),
  'receipt path is passed in the same expense insert as the money fields'
);
check(
  /photoCommittedRef\.current = true;[\s\S]*onSaved\(\)/.test(expenses) &&
    /photoCommittedRef\.current \|\| photoCommitInFlightRef\.current/.test(expenses) &&
    /else if \(!photoCommittedRef\.current\)[\s\S]*deleteDraftPhoto\(failedDraftPath\)/.test(expenses),
  'successful expense save protects its receipt from unmount cleanup'
);
check(
  /handlePhotoChange[\s\S]*previousPath[\s\S]*deleteDraftPhoto\(previousPath\)/.test(expenses) &&
    /handleCancel[\s\S]*cleanupDraftPhoto\(\)[\s\S]*onCancel\(\)/.test(expenses),
  'receipt replace/remove and Cancel delete only the uncommitted draft'
);
check(
  /if \(adding\) return;/.test(expenses) &&
    /registerHardwareBackOverride\(\(\) => \{[\s\S]*handleCancel\(\)/.test(expenses),
  'expense form owns Android Back through the same cleanup wrapper as Cancel'
);
check(
  /resolvePhotoUri\(e\.receipt_photo_path\)/.test(expenses) &&
    /accessibilityLabel=\{`\$\{strings\.RECEIPT_PHOTO\}: \$\{strings\.CATEGORY_LABEL\(e\.category\)\}`\}/.test(expenses),
  'expense history renders an optional, accessibly labelled receipt thumbnail'
);

const deleteSql = expenses.indexOf('await deleteExpense(db, expense.id)');
const deleteFile = expenses.indexOf('deletePhoto(deletedReceiptPath)');
check(
  deleteSql >= 0 && deleteFile > deleteSql,
  'receipt file deletion happens only after the expense SQL delete succeeds'
);
check(
  [credit, expenses].every(source =>
    /mountedRef\.current = false;[\s\S]*cleanupDraftPhoto\(\)/.test(source) &&
    /if \(!mountedRef\.current\)[\s\S]*deleteDraftPhoto\(nextPath\)/.test(source)
  ),
  'unmount and late picker results cannot orphan either kind of draft photo'
);

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} record-photo screen contract(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all customer and receipt photo screen contracts held');
