/**
 * The app's screens. Navigation is deliberately a hand-rolled state machine
 * in App.tsx -- a handful of screens, no parameters, one action per screen. A
 * navigation library would add weight without adding a capability this app
 * uses. See docs/ROADMAP.md ("What we will NOT build").
 */
export type Screen =
  | 'home'
  | 'products'
  | 'add_product'
  | 'edit_product'
  | 'count'
  | 'stock_in'
  | 'activity'
  | 'weekly'
  | 'credit'
  | 'expenses'
  | 'cashup'
  | 'sales'
  // Worker path while the owner lock is on: today's takings only, no history.
  | 'sales_today'
  | 'settings'
  | 'health'
  // The PIN ask reached from the locked Home card; gated screens render the
  // gate in place instead.
  | 'owner_unlock';
