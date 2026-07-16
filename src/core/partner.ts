import type { ActivationMetric } from './activation';

export const PARTNER_REFERRAL_SETTING = 'partner_referral_code';

export function normaliseReferralCode(value: string): string | null {
  const clean = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{2,32}$/.test(clean) ? clean : null;
}

export function referralCodeFromUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    return normaliseReferralCode(new URL(url).searchParams.get('ref') ?? '');
  } catch {
    return null;
  }
}

export interface PartnerActivationExport {
  format: 1;
  app: 'ShopTrack';
  referral_code: string | null;
  activated: boolean;
  unique_activity_days: number;
  first_activity_at: number | null;
  activated_at: number | null;
  exported_at: number;
}

/** No shop contents, amounts, names, or device ID: only owner-approved activation facts. */
export function buildPartnerActivationExport(
  metric: ActivationMetric,
  referralCode: string | null,
  exportedAt = Date.now()
): PartnerActivationExport {
  return {
    format: 1,
    app: 'ShopTrack',
    referral_code: referralCode ? normaliseReferralCode(referralCode) : null,
    activated: metric.activated,
    unique_activity_days: metric.unique_days,
    first_activity_at: metric.first_activity_at,
    activated_at: metric.activated_at,
    exported_at: exportedAt,
  };
}
