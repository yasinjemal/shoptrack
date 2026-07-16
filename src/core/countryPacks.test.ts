import assert from 'node:assert/strict';
import { COUNTRY_PACKS, COUNTRY_PACK_CODES } from './countryPacks';
import { CURRENCIES } from './currency';

assert.deepEqual(COUNTRY_PACK_CODES, ['ZA', 'KE', 'NG', 'ET']);
for (const pack of Object.values(COUNTRY_PACKS)) {
  assert.ok(pack.currency in CURRENCIES);
  assert.ok(pack.languages.length > 0);
  assert.equal(pack.expenseCategories.includes('STOCK' as never), false);
}
assert.equal(COUNTRY_PACKS.KE.paymentVocabulary.MOBILE_MONEY, 'M-Pesa');
assert.equal(COUNTRY_PACKS.NG.paymentVocabulary.MOBILE_MONEY, 'MoMo / OPay');
assert.equal(COUNTRY_PACKS.ET.calendar, 'ethiopian');

console.log('country pack tests passed');
