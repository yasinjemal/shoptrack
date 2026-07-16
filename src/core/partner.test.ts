import assert from 'node:assert/strict';
import { buildPartnerActivationExport, normaliseReferralCode, referralCodeFromUrl } from './partner';

assert.equal(normaliseReferralCode(' flash-17 '), 'FLASH-17');
assert.equal(normaliseReferralCode('bad code'), null);
assert.equal(referralCodeFromUrl('shoptrack://open?ref=kazang_5'), 'KAZANG_5');
assert.equal(referralCodeFromUrl('not a url'), null);
const exported = buildPartnerActivationExport({
  unique_days: 2, activated: true, first_activity_at: 1, activated_at: 2, computed_at: 3,
}, 'flash-17', 4);
assert.deepEqual(exported, {
  format: 1, app: 'ShopTrack', referral_code: 'FLASH-17', activated: true,
  unique_activity_days: 2, first_activity_at: 1, activated_at: 2, exported_at: 4,
});
assert.equal('amount' in exported, false);

console.log('partner tests passed');
