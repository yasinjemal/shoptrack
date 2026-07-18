import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const viewer = readFileSync(
  join(root, 'src', 'ui', 'cloud', 'CloudBackupViewerScreen.tsx'),
  'utf8'
);
const settings = readFileSync(
  join(root, 'src', 'ui', 'settings', 'SettingsScreen.tsx'),
  'utf8'
);
const model = readFileSync(join(root, 'src', 'core', 'remoteViewer.ts'), 'utf8');
const app = readFileSync(join(root, 'src', 'app', 'ShopTrackApp.tsx'), 'utf8');

console.log('TEST: My Shop viewer has a structural read-only boundary');
assert.equal(viewer.includes('SQLiteDatabase'), false);
assert.equal(viewer.includes('restoreBackup'), false);
assert.equal(viewer.includes('setSetting'), false);
assert.equal(viewer.includes('photoBackupMediaAdapter'), false);
assert.equal(viewer.includes('registerHardwareBackOverride'), true);
assert.equal(model.includes('staff_members'), false);
assert.equal(model.includes('.data.media'), false);

console.log('TEST: encrypted download offers view-only without weakening restore safety');
assert.equal(settings.includes('buildRemoteShopSnapshot(backup)'), true);
assert.equal(settings.includes('setCloudViewer(viewer)'), true);
assert.equal(settings.includes('restoreBackupWithSafetySnapshot(db, backup)'), true);
assert.equal(settings.includes('restoreBackup(db, backup'), false);
assert.equal(settings.includes('remoteViewerEntitled = false'), true);
assert.equal(
  app.includes("remoteViewerEntitled={canUsePlusFeature('remote_viewer', entitlementState)}"),
  true
);

console.log('cloud viewer UI flow tests passed');
