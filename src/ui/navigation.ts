import type { Screen } from './screens';

type HardwareBackOverride = () => boolean;

let hardwareBackOverride: HardwareBackOverride | null = null;

/**
 * Registers the active screen's step-level Android Back behavior.
 *
 * There is deliberately still only one native BackHandler subscription, in
 * ShopTrackApp. Child screens publish their current step here so that handler
 * can unwind a form/review/result before applying the top-level screen map.
 * The identity check makes an older screen's cleanup unable to erase a newer
 * screen's handler during a navigation transition.
 */
export function registerHardwareBackOverride(handler: HardwareBackOverride): () => void {
  hardwareBackOverride = handler;
  return () => {
    if (hardwareBackOverride === handler) hardwareBackOverride = null;
  };
}

export function runHardwareBackOverride(): boolean {
  return hardwareBackOverride?.() ?? false;
}

/**
 * The Android system Back button operates at the app's top-level screen
 * boundary. Screens with their own internal steps still own those steps; this
 * policy answers where to go once the top-level screen itself is left.
 *
 * `satisfies` makes this map exhaustive: adding a new Screen fails the build
 * until its Back behavior is chosen deliberately.
 */
const FIXED_BACK_TARGETS = {
  home: null,
  products: 'home',
  edit_product: 'products',
  count: 'home',
  stock_in: 'home',
  activity: 'home',
  weekly: 'home',
  credit: 'home',
  expenses: 'home',
  cashup: 'home',
  sales: 'home',
  sales_today: 'home',
  settings: 'home',
  health: 'home',
  owner_unlock: 'home',
} satisfies Record<Exclude<Screen, 'add_product'>, Screen | null>;

export function getHardwareBackTarget(
  screen: Screen,
  hasProducts: boolean
): Screen | null {
  // The first-product form is reached from Home. Once a catalog exists, the
  // same form is reached from Products and should return there.
  if (screen === 'add_product') return hasProducts ? 'products' : 'home';
  return FIXED_BACK_TARGETS[screen];
}
