import assert from 'node:assert/strict';
import { canUseCoreFeature, PERMANENTLY_FREE_FEATURES } from './entitlements';

assert.ok(PERMANENTLY_FREE_FEATURES.includes('count'));
assert.ok(PERMANENTLY_FREE_FEATURES.includes('restore'));
for (const feature of PERMANENTLY_FREE_FEATURES) assert.equal(canUseCoreFeature(feature), true);

console.log('entitlement policy tests passed');
