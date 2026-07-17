/**
 * ============================================
 * SHOP PROFILE
 * ============================================
 *
 * Who this shop is: the name the owner painted over the door, and the phone
 * number customers already know. Nothing else -- a field nothing renders is
 * clutter, not identity.
 *
 * Like the currency (currency.ts), the profile is a SETTING (settings table),
 * not a constant: it travels inside backups, so a shop restored onto a new
 * phone still knows its own name. It is loaded once at startup and after every
 * restore (ShopTrackApp), then read synchronously from here -- the share
 * renderer should not need a database handle to sign a message.
 *
 * WHY THE NAME MATTERS: every WhatsApp message the app builds (credit
 * reminders, receipts, reorder sheets) goes to someone who has never heard of
 * ShopTrack but knows "Nomsa's Shop". The signature is what makes a reminder
 * legitimate instead of anonymous.
 */

export interface ShopProfile {
  /** What the owner calls the shop. NULL = not set yet; everything must still work. */
  shop_name: string | null;
  /** Optional. Shown after the name in shared messages so customers can call back. */
  shop_phone: string | null;
}

/** Settings-table keys. Settings rows already travel in backups (format v3+). */
export const SHOP_NAME_SETTING_KEY = 'shop_name';
export const SHOP_PHONE_SETTING_KEY = 'shop_phone';

/** Keep names shorter than a WhatsApp preview line; inputs are capped to match. */
export const SHOP_TEXT_MAX_LENGTH = 60;

export const EMPTY_SHOP_PROFILE: ShopProfile = { shop_name: null, shop_phone: null };

/**
 * Trim, collapse inner whitespace, cap length, and turn blank into null.
 * Blank-as-null matters: clearing a field in Settings must genuinely unset it,
 * or the header would proudly display "".
 */
export function normaliseShopText(value: string | null | undefined): string | null {
  const clean = (value ?? '').replace(/\s+/g, ' ').trim().slice(0, SHOP_TEXT_MAX_LENGTH).trim();
  return clean.length > 0 ? clean : null;
}

let current: ShopProfile = EMPTY_SHOP_PROFILE;

/** Apply stored values (startup, restore, or a Settings save). Returns the clean copy. */
export function setCurrentShopProfile(profile: {
  shop_name?: string | null;
  shop_phone?: string | null;
}): ShopProfile {
  current = {
    shop_name: normaliseShopText(profile.shop_name),
    shop_phone: normaliseShopText(profile.shop_phone),
  };
  return current;
}

export function getCurrentShopProfile(): ShopProfile {
  return current;
}

/**
 * The sign-off line for shared messages: "Nomsa's Shop · 073 123 4567".
 * NULL when no name is set -- a phone number alone signs nothing, and messages
 * from a shop that has not named itself stay exactly as they were.
 */
export function shopSignature(profile: ShopProfile = current): string | null {
  if (!profile.shop_name) return null;
  return profile.shop_phone ? `${profile.shop_name} · ${profile.shop_phone}` : profile.shop_name;
}

/**
 * A filesystem-safe slug for the shared-backup filename, so the file is
 * findable in a WhatsApp chat full of them: "nomsas-shop-backup-2026-07-18".
 *
 * ASCII-only on purpose: filenames cross share sheets, WhatsApp, and Google
 * Drive on unknown phones. A name with no ASCII letters (an Amharic shop name,
 * say) falls back to "shoptrack" rather than producing "--backup".
 */
export function backupFilenameSlug(shopName: string | null): string {
  const slug = (shopName ?? '')
    .toLowerCase()
    .replace(/['’]/g, '')            // "Nomsa's" -> "nomsas", not "nomsa-s"
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug.length > 0 ? slug : 'shoptrack';
}
