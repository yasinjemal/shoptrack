/** Workflows whose history and continued use must never depend on payment. */
export const PERMANENTLY_FREE_FEATURES = [
  'products', 'count', 'stock_in', 'credit', 'expenses', 'cash_up', 'sales',
  'local_backup', 'restore', 'reorder_share', 'health_report',
] as const;

export type PermanentlyFreeFeature = typeof PERMANENTLY_FREE_FEATURES[number];

/** Explicit policy seam: core features have no quota, trial, or entitlement lookup. */
export function canUseCoreFeature(_feature: PermanentlyFreeFeature): true {
  return true;
}
