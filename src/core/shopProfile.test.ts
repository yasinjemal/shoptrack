/**
 * ============================================
 * SHOPTRACK SHOP PROFILE TESTS
 * ============================================
 *
 * The profile signs every shared message, names the home header, and slugs the
 * backup filename. The no-name-yet shop is the one that must never break:
 * every function here has a null path and each is pinned below.
 */

import {
  backupFilenameSlug,
  getCurrentShopProfile,
  normaliseShopText,
  setCurrentShopProfile,
  shopSignature,
  SHOP_TEXT_MAX_LENGTH,
} from './shopProfile';
import { buildCreditReminder } from './messages';
import { calculateCustomerBalance } from './credit';
import { renderShareMessage } from '../i18n/messages';
import { en } from '../i18n/en';

let failures = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`); }
}

// --- normalisation ---
equal(normaliseShopText('  Nomsa\'s   Shop  '), "Nomsa's Shop", 'trims and collapses whitespace');
equal(normaliseShopText('   '), null, 'blank becomes null, not empty string');
equal(normaliseShopText(null), null, 'null stays null');
equal(normaliseShopText('x'.repeat(200))?.length, SHOP_TEXT_MAX_LENGTH, 'overlong names are capped');

// --- current profile round trip ---
setCurrentShopProfile({ shop_name: " Nomsa's Shop ", shop_phone: '073 123 4567' });
equal(getCurrentShopProfile().shop_name, "Nomsa's Shop", 'set/get round-trips the clean name');

// --- signature ---
equal(shopSignature(), "Nomsa's Shop · 073 123 4567", 'signature joins name and phone');
setCurrentShopProfile({ shop_name: "Nomsa's Shop" });
equal(shopSignature(), "Nomsa's Shop", 'signature without phone is just the name');
setCurrentShopProfile({ shop_phone: '073 123 4567' });
equal(shopSignature(), null, 'a phone alone signs nothing');

// --- backup filename slug ---
equal(backupFilenameSlug("Nomsa's Shop!"), 'nomsas-shop', 'slug is lowercase ascii with hyphens');
equal(backupFilenameSlug(null), 'shoptrack', 'no name falls back to shoptrack');
equal(backupFilenameSlug('ሱቅ'), 'shoptrack', 'non-ascii-only name falls back rather than producing an empty slug');

// --- the signature reaches shared messages (and stays out when unset) ---
const balance = calculateCustomerBalance(
  { id: 1, name: 'Sipho' },
  [{ id: 1, customer_id: 1, type: 'CREDIT', amount: 240, recorded_at: 1 }],
  10 * 86400000
);

setCurrentShopProfile({ shop_name: "Nomsa's Shop" });
const signed = renderShareMessage(buildCreditReminder(balance), en);
equal(signed.includes("Nomsa's Shop"), true, 'a named shop signs its credit reminder');

setCurrentShopProfile({});
const unsigned = renderShareMessage(buildCreditReminder(balance), en);
equal(unsigned.includes('Nomsa'), false, 'a no-name-yet shop sends the message exactly as before');
equal(unsigned.startsWith('Hi Sipho.'), true, 'the reminder body is unchanged');

if (failures > 0) { console.error(`FAILED: ${failures} shop-profile assertion(s)`); process.exit(1); }
console.log('PASSED: all shop-profile assertions held');
