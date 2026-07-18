/** Workflows whose history and continued use must never depend on payment. */
export const PERMANENTLY_FREE_FEATURES = [
  'products', 'count', 'stock_in', 'credit', 'expenses', 'cash_up', 'sales',
  'local_backup', 'restore', 'reorder_share', 'health_report',
] as const;

export type PermanentlyFreeFeature = typeof PERMANENTLY_FREE_FEATURES[number];

/**
 * New server-backed conveniences that may be offered by ShopTrack Plus.
 *
 * `account_restore` means locating and downloading a backup through an
 * optional account. Restoring a backup file the owner already holds is the
 * permanently-free `restore` workflow above.
 */
export const PLUS_FEATURES = [
  'automatic_cloud_backup', 'remote_viewer', 'account_restore',
] as const;

export type PlusFeature = typeof PLUS_FEATURES[number];
export type ShopTrackFeature = PermanentlyFreeFeature | PlusFeature;

/**
 * Billing/account providers normalize their result to this small state. An
 * unknown state fails closed for Plus without affecting any free workflow.
 */
export type PlusEntitlementStatus = 'unknown' | 'inactive' | 'active';

export interface EntitlementState {
  readonly plus: PlusEntitlementStatus;
}

/** Vendor-neutral boundary for a future store, server, or test implementation. */
export interface EntitlementProvider {
  getEntitlementState(): Promise<EntitlementState>;
}

export const FREE_ENTITLEMENT_STATE: EntitlementState = Object.freeze({ plus: 'inactive' });

/** Explicit policy seam: core features have no quota, trial, or entitlement lookup. */
export function canUseCoreFeature(_feature: PermanentlyFreeFeature): true {
  return true;
}

export function canUsePlusFeature(
  _feature: PlusFeature,
  state: EntitlementState
): boolean {
  return state.plus === 'active';
}

export function isPermanentlyFreeFeature(
  feature: ShopTrackFeature
): feature is PermanentlyFreeFeature {
  return (PERMANENTLY_FREE_FEATURES as readonly string[]).includes(feature);
}

/** One policy entry point for UI and background jobs. */
export function canUseFeature(
  feature: ShopTrackFeature,
  state: EntitlementState = FREE_ENTITLEMENT_STATE
): boolean {
  return isPermanentlyFreeFeature(feature)
    ? canUseCoreFeature(feature)
    : canUsePlusFeature(feature, state);
}
