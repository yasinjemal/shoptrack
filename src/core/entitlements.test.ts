import assert from 'node:assert/strict';
import {
  canUseCoreFeature,
  canUseFeature,
  canUsePlusFeature,
  EntitlementProvider,
  EntitlementState,
  FREE_ENTITLEMENT_STATE,
  isPermanentlyFreeFeature,
  PERMANENTLY_FREE_FEATURES,
  PLUS_FEATURES,
} from './entitlements';

const ORIGINAL_FREE_POLICY = [
  'products', 'count', 'stock_in', 'credit', 'expenses', 'cash_up', 'sales',
  'local_backup', 'restore', 'reorder_share', 'health_report',
] as const;

const entitlementStates: EntitlementState[] = [
  { plus: 'unknown' },
  { plus: 'inactive' },
  { plus: 'active' },
];

console.log('TEST: the complete permanent-free policy is pinned');
assert.deepEqual(PERMANENTLY_FREE_FEATURES, ORIGINAL_FREE_POLICY);
for (const state of entitlementStates) {
  for (const feature of PERMANENTLY_FREE_FEATURES) {
    assert.equal(canUseCoreFeature(feature), true);
    assert.equal(canUseFeature(feature, state), true);
    assert.equal(isPermanentlyFreeFeature(feature), true);
  }
}

console.log('TEST: only the three new server-backed capabilities are Plus');
assert.deepEqual(
  PLUS_FEATURES,
  ['automatic_cloud_backup', 'remote_viewer', 'account_restore']
);
assert.equal(PLUS_FEATURES.includes('account_restore'), true);
assert.equal(PERMANENTLY_FREE_FEATURES.includes('restore'), true);
for (const feature of PLUS_FEATURES) {
  assert.equal(isPermanentlyFreeFeature(feature), false);
  assert.equal((PERMANENTLY_FREE_FEATURES as readonly string[]).includes(feature), false);
}

console.log('TEST: Plus fails closed until a provider confirms active access');
for (const feature of PLUS_FEATURES) {
  assert.equal(canUsePlusFeature(feature, { plus: 'unknown' }), false);
  assert.equal(canUsePlusFeature(feature, { plus: 'inactive' }), false);
  assert.equal(canUsePlusFeature(feature, { plus: 'active' }), true);
  assert.equal(canUseFeature(feature), false);
  assert.equal(canUseFeature(feature, FREE_ENTITLEMENT_STATE), false);
  assert.equal(canUseFeature(feature, { plus: 'active' }), true);
}

console.log('TEST: provider implementations expose only normalized entitlement state');
const provider: EntitlementProvider = {
  async getEntitlementState() {
    return { plus: 'active' };
  },
};
void provider.getEntitlementState().then(state => {
  assert.equal(canUseFeature('remote_viewer', state), true);
  console.log('entitlement policy tests passed');
});
