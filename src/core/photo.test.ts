import assert from 'node:assert/strict';

import {
  MANAGED_PHOTO_DIRECTORY,
  PHOTO_MAX_LONG_EDGE,
  PHOTO_MAX_FILE_BYTES,
  PENDING_PHOTO_REQUEST_TTL_MS,
  createPendingPhotoRequest,
  findOrphanedPhotoPaths,
  createManagedPhotoPath,
  isManagedPhotoPath,
  parseManagedPhotoPath,
  parsePendingPhotoRequest,
  isManagedJpegBytes,
  planPhotoResize,
  validateManagedPhotoPath,
} from './photo';

const ID = '01234567-89ab-4cde-8fab-0123456789ab';

assert.equal(MANAGED_PHOTO_DIRECTORY, 'shoptrack-media');
assert.equal(PHOTO_MAX_LONG_EDGE, 800);
assert.equal(PHOTO_MAX_FILE_BYTES, 5 * 1024 * 1024);
assert.equal(isManagedJpegBytes(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])), true);
assert.equal(isManagedJpegBytes(Uint8Array.from([0, 0, 0, 0])), false);

const pending = createPendingPhotoRequest('customer', ID, 1_000);
assert.deepEqual(pending, {
  version: 1,
  purpose: 'customer',
  requestId: ID,
  requestedAt: 1_000,
});
assert.deepEqual(parsePendingPhotoRequest(JSON.stringify(pending), 2_000), pending);
assert.equal(
  parsePendingPhotoRequest(JSON.stringify(pending), 1_000 + PENDING_PHOTO_REQUEST_TTL_MS + 1),
  null
);
assert.equal(parsePendingPhotoRequest('{broken', 2_000), null);
assert.equal(
  parsePendingPhotoRequest(JSON.stringify({ ...pending, purpose: 'receipt', requestId: 'bad' }), 2_000),
  null
);
assert.throws(() => createPendingPhotoRequest('product', ID, -1), /time is invalid/);

const productPath = createManagedPhotoPath('product', ID);
assert.equal(productPath, `shoptrack-media/product-${ID}.jpg`);
assert.equal(createManagedPhotoPath('customer', ID), `shoptrack-media/customer-${ID}.jpg`);
assert.equal(createManagedPhotoPath('receipt', ID), `shoptrack-media/receipt-${ID}.jpg`);
assert.deepEqual(parseManagedPhotoPath(productPath), {
  purpose: 'product',
  uniqueId: ID,
  path: productPath,
});
assert.equal(validateManagedPhotoPath(productPath), productPath);

const unsafePaths: unknown[] = [
  '',
  `/${productPath}`,
  `file:///documents/${productPath}`,
  `../${productPath}`,
  `shoptrack-media/../product-${ID}.jpg`,
  `shoptrack-media\\product-${ID}.jpg`,
  `another-directory/product-${ID}.jpg`,
  `shoptrack-media/avatar-${ID}.jpg`,
  `shoptrack-media/product-${ID}.png`,
  `shoptrack-media/product-${ID}.jpg?x=1`,
  ` shoptrack-media/product-${ID}.jpg`,
  'shoptrack-media/product-not-a-uuid.jpg',
  null,
];
for (const path of unsafePaths) assert.equal(isManagedPhotoPath(path), false, `rejects ${String(path)}`);
assert.throws(() => validateManagedPhotoPath('../outside.jpg'), /managed relative JPEG path/);
assert.throws(
  () => createManagedPhotoPath('product', '01234567-89ab-1cde-8fab-0123456789ab'),
  /lowercase UUID v4/
);

const ownedCustomerPath = createManagedPhotoPath('customer', '77777777-7777-4777-8777-777777777777');
const orphanReceiptPath = createManagedPhotoPath('receipt', '88888888-8888-4888-8888-888888888888');
assert.deepEqual(
  findOrphanedPhotoPaths(
    [ownedCustomerPath, orphanReceiptPath, orphanReceiptPath, '../outside.jpg'],
    [ownedCustomerPath, 'invalid']
  ),
  [orphanReceiptPath]
);
assert.throws(
  () => createManagedPhotoPath('product', ID.toUpperCase()),
  /lowercase UUID v4/
);

assert.deepEqual(planPhotoResize(1600, 1200), {
  width: 800,
  height: 600,
  resize: { width: 800 },
});
assert.deepEqual(planPhotoResize(1200, 1600), {
  width: 600,
  height: 800,
  resize: { height: 800 },
});
assert.deepEqual(planPhotoResize(2000, 2000), {
  width: 800,
  height: 800,
  resize: { width: 800 },
});
assert.deepEqual(planPhotoResize(640, 480), {
  width: 640,
  height: 480,
  resize: null,
});
assert.deepEqual(planPhotoResize(800, 300), {
  width: 800,
  height: 300,
  resize: null,
});

for (const dimensions of [
  [0, 100],
  [100, 0],
  [-1, 100],
  [100, -1],
  [Number.NaN, 100],
  [100, Number.POSITIVE_INFINITY],
  [100.5, 100],
] as const) {
assert.throws(() => planPhotoResize(dimensions[0], dimensions[1]), /positive safe integer/);
}

console.log('photo path and resize tests passed');
