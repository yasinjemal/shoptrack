/**
 * Product-photo UI contracts.
 *
 * The native picker and filesystem need a phone, so this focused Node test
 * pins the ownership and atomic-write wiring that is possible to verify in CI.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..', '..');
const source = (path: string) => readFileSync(join(root, path), 'utf8');
const field = source('src/ui/components/PhotoField.tsx');
const add = source('src/ui/products/AddProductScreen.tsx');
const edit = source('src/ui/products/EditProductScreen.tsx');
const products = source('src/ui/products/ProductsListScreen.tsx');
const count = source('src/ui/count/CountScreen.tsx');
const db = source('src/core/db.ts');

let failures = 0;
function check(condition: boolean, label: string): void {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

console.log('========================================');
console.log('TEST: product-photo UI contracts');
console.log('========================================');

check(
  field.includes('capturePhoto(requestedPurpose)')
    && field.includes('choosePhotoFromLibrary(requestedPurpose)')
    && field.includes('resolvePhotoUri(photoPath)'),
  'PhotoField takes, chooses and resolves app-managed photos'
);
check(
  field.includes('onChangeRef.current(result.photo.logicalPath)')
    && field.includes('discardUndeliveredResult(result)')
    && field.includes("if (result.status !== 'saved') return;"),
  'PhotoField transfers delivered paths and cleans only acquired-but-undelivered results'
);
check(
  field.includes('recoverPendingPhoto(requestedPurpose)')
    && field.includes('mountedRef.current')
    && field.includes('token === requestTokenRef.current')
    && field.includes('requestTokenRef.current = {}'),
  'pending Android results and picker completions are guarded across navigation'
);
check(
  field.includes('currentStrings.PHOTO_CAMERA_PERMISSION')
    && field.includes('currentStrings.PHOTO_LIBRARY_PERMISSION')
    && field.includes('currentStrings.PHOTO_SAVE_ERROR')
    && field.includes('strings.PHOTO_PRIVATE_HINT')
    && field.includes('strings.CUSTOMER_PHOTO_PRIVATE_HINT'),
  'permissions, failures and private-storage guidance are localized'
);
check(
  field.includes('accessibilityRole="image"')
    && field.includes('accessibilityState={{ disabled: actionsDisabled, busy }}'),
  'preview and in-flight actions expose accessibility semantics'
);

check(
  /await addProduct\(db,\s*\{[\s\S]*?photoPath,[\s\S]*?quantity: parsedQuantity/.test(add),
  'Add Product commits the photo path in the atomic product details write'
);
check(
  add.includes('onChangeText={handleBarcodeChange}')
    && add.includes('lookupTokenRef.current += 1;')
    && add.includes('barcodeRef.current !== scannedBarcode'),
  'manual barcode edits invalidate an older Open Food Facts response'
);
check(
  add.includes('previousDraft !== nextPath')
    && add.includes('!committedRef.current && !committingRef.current')
    && add.includes('committedRef.current = true;')
    && add.includes('draftPhotoRef.current = null;'),
  'Add Product replaces/cancels drafts but disowns the committed file'
);
check(
  db.includes('(name, barcode, photo_path, buy_price, sell_price, current_qty')
    && db.includes('[name, barcode, photoPath, details.buyPrice'),
  'database adapter inserts product and photo reference together'
);

check(
  /await updateProduct\(db, product\.id,\s*\{[\s\S]*?photoPath,/.test(edit),
  'Edit Product commits its next photo path through updateProduct'
);
check(
  edit.indexOf('await updateProduct(db, product.id')
    < edit.indexOf('discardProductPhoto(originalPhotoRef.current)'),
  'old persisted product photo is deleted only after database success'
);
check(
  edit.includes('current !== originalPhotoRef.current && current !== nextPath')
    && edit.includes('current && current !== originalPhotoRef.current'),
  'Edit Product cleanup is restricted to distinct unpersisted drafts'
);
check(
  edit.includes('const deactivatedPath = await deactivateProduct(db, product.id)')
    && edit.includes('if (deactivatedPath) discardProductPhoto(deactivatedPath)')
    && edit.includes('draftPath && draftPath !== deactivatedPath'),
  'deactivation clears the database first, then removes old and distinct draft files'
);
check(
  edit.includes('if (saving || operationRef.current) return;')
    && edit.includes('disabled={saving}'),
  'Edit Product prevents overlapping save and deactivate operations'
);
check(
  db.includes('UPDATE products SET is_active = 0, photo_path = NULL')
    && db.includes('return previousPath;'),
  'deactivateProduct atomically clears and returns the persisted photo path'
);

check(
  products.includes('resolvePhotoUri(product.photo_path)')
    && products.includes('styles.productThumbnail')
    && products.includes('strings.PRODUCT_PHOTO'),
  'Products list renders labelled optional managed thumbnails'
);
check(
  count.includes('resolvePhotoUri(product.photo_path)')
    && count.includes('styles.countProductThumbnail')
    && count.includes('strings.PRODUCT_PHOTO'),
  'Count entry renders labelled optional managed thumbnails without gating input'
);

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} product-photo UI contract(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all product-photo UI contracts held');
