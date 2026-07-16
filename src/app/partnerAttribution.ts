import * as Linking from 'expo-linking';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getSetting, setSetting } from '../core/db';
import { PARTNER_REFERRAL_SETTING, referralCodeFromUrl } from '../core/partner';

/** Capture first-touch referral locally. A later link cannot overwrite it. */
export async function captureInitialPartnerReferral(db: SQLiteDatabase): Promise<string | null> {
  const existing = await getSetting(db, PARTNER_REFERRAL_SETTING);
  if (existing) return existing;
  const referral = referralCodeFromUrl(await Linking.getInitialURL());
  if (referral) await setSetting(db, PARTNER_REFERRAL_SETTING, referral);
  return referral;
}
