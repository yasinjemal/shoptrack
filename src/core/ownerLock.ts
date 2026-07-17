/**
 * ============================================
 * OWNER LOCK
 * ============================================
 *
 * The shop phone often lives in a worker's hands for days or weeks while the
 * owner is away. The worker's day needs counting, stock-in, today's takings,
 * cash-up, and the credit book -- it does not need the owner's profit,
 * expenses, sales history, or the health report. This lock keeps those five
 * money surfaces behind a 4-digit PIN.
 *
 * WHAT THIS IS AND IS NOT. It is a privacy screen against a casual glance,
 * stored plain in the settings table exactly like staff PINs (schema.sql:
 * "it attributes actions, it does not secure them"). It is NOT encryption:
 * anyone who can open the database already holds the books, and pretending a
 * 4-digit code changes that would be dishonest. Cheap honesty over expensive
 * theatre.
 *
 * The PIN is a SETTING, so it travels inside backups -- a restored shop is
 * still locked. The unlocked flag is module state only: it never persists,
 * and the app re-locks whenever it goes to the background (ShopTrackApp's
 * AppState listener), so handing the phone over hands over nothing.
 *
 * There is deliberately NO lockout after wrong attempts: the owner is the
 * support line, and locking them out of their own shop for a week because a
 * child mashed the keypad is worse than any brute-force a lockout prevents.
 */

export const OWNER_PIN_SETTING_KEY = 'owner_pin';

/** Same shape as staff PINs: exactly four digits. */
export function isValidOwnerPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

let pin: string | null = null;
let unlocked = false;

/**
 * Apply the stored PIN (startup, restore, or a Settings change). Anything that
 * is not a valid PIN -- missing, empty, corrupted -- disables the lock rather
 * than wedging the app behind a PIN nobody can type.
 *
 * Always re-locks: a restore or a PIN change must never leave the money
 * screens open by accident.
 */
export function setStoredOwnerPin(value: string | null | undefined): void {
  pin = value != null && isValidOwnerPin(value) ? value : null;
  unlocked = false;
}

export function isOwnerLockEnabled(): boolean {
  return pin != null;
}

/** True when money screens must gate: a PIN exists and nobody has entered it. */
export function isOwnerLocked(): boolean {
  return pin != null && !unlocked;
}

/** Check without unlocking -- Settings uses this to guard PIN changes. */
export function verifyOwnerPin(input: string): boolean {
  return pin != null && input === pin;
}

export function unlockOwner(input: string): boolean {
  if (!verifyOwnerPin(input)) return false;
  unlocked = true;
  return true;
}

/** Called when the app backgrounds. Idempotent, and harmless with no PIN set. */
export function lockOwner(): void {
  unlocked = false;
}
