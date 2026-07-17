/**
 * ============================================
 * SHOPTRACK OWNER LOCK TESTS
 * ============================================
 *
 * The lock guards the owner's money screens from the worker holding the
 * phone. The two states that must never go wrong: a shop with no PIN must
 * never gate anything, and a restore or background must always re-lock.
 */

import {
  isOwnerLockEnabled,
  isOwnerLocked,
  isValidOwnerPin,
  lockOwner,
  setStoredOwnerPin,
  unlockOwner,
  verifyOwnerPin,
} from './ownerLock';

let failures = 0;
function equal(actual: unknown, expected: unknown, label: string) {
  if (actual === expected) console.log(`  ok   ${label}`);
  else { failures++; console.error(`  FAIL ${label}\n         expected: ${expected}\n         actual:   ${actual}`); }
}

// --- validation ---
equal(isValidOwnerPin('1234'), true, 'four digits are a valid PIN');
equal(isValidOwnerPin('123'), false, 'three digits are not');
equal(isValidOwnerPin('12345'), false, 'five digits are not');
equal(isValidOwnerPin('12a4'), false, 'letters are not');

// --- no PIN: nothing gates ---
setStoredOwnerPin(null);
equal(isOwnerLockEnabled(), false, 'no stored PIN disables the lock');
equal(isOwnerLocked(), false, 'a shop with no PIN never gates');
equal(unlockOwner('0000'), false, 'unlock with no PIN set fails safely');

// --- corrupted setting: fail open, not wedged ---
setStoredOwnerPin('not-a-pin');
equal(isOwnerLockEnabled(), false, 'a corrupted stored value disables the lock rather than wedging the app');

// --- normal lifecycle ---
setStoredOwnerPin('1234');
equal(isOwnerLockEnabled(), true, 'a stored PIN enables the lock');
equal(isOwnerLocked(), true, 'a freshly loaded PIN starts locked');
equal(unlockOwner('9999'), false, 'the wrong PIN does not unlock');
equal(isOwnerLocked(), true, 'still locked after a wrong attempt');
equal(unlockOwner('1234'), true, 'the right PIN unlocks');
equal(isOwnerLocked(), false, 'unlocked after the right PIN');
equal(verifyOwnerPin('1234'), true, 'verify matches without changing state');

// --- backgrounding re-locks ---
lockOwner();
equal(isOwnerLocked(), true, 'lockOwner re-locks (app went to background)');

// --- a PIN change or restore always re-locks ---
unlockOwner('1234');
setStoredOwnerPin('5678');
equal(isOwnerLocked(), true, 'loading a stored PIN re-locks even if previously unlocked');
equal(unlockOwner('1234'), false, 'the old PIN is gone after a change');
equal(unlockOwner('5678'), true, 'the new PIN works');

// --- turning the lock off ---
setStoredOwnerPin(null);
equal(isOwnerLocked(), false, 'removing the PIN removes the gate');

if (failures > 0) { console.error(`FAILED: ${failures} owner-lock assertion(s)`); process.exit(1); }
console.log('PASSED: all owner-lock assertions held');
