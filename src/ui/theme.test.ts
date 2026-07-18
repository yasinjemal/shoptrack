/**
 * ============================================
 * SHOPTRACK THEME TESTS
 * ============================================
 *
 * Contrast is an accessibility requirement, not a matter of taste, so it is
 * tested rather than eyeballed.
 *
 * This matters more here than in most apps: the user is standing outside in
 * direct sunlight on a mid-range screen. The palette this replaced had white
 * text on #4CAF50 for every primary button (2.78:1) and #AAAAAA hint text
 * (2.32:1). Both shipped. Both were invisible outdoors. A test is the only
 * thing that stops that coming back.
 *
 * Implements WCAG 2.1 relative luminance and contrast ratio.
 *
 * Run with: npm run test:theme
 */

import { border, color, control, icon, motion, numeric, space, state, touch, type } from './theme';

let failures = 0;

function check(condition: boolean, label: string) {
  if (condition) console.log(`  ok   ${label}`);
  else {
    failures++;
    console.error(`  FAIL ${label}`);
  }
}

// ---- WCAG 2.1 ----

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** WCAG AA for normal text. */
const AA = 4.5;
function assertContrast(fg: string, bg: string, min: number, label: string) {
  const ratio = contrast(fg, bg);
  if (ratio >= min) {
    console.log(`  ok   ${label} — ${ratio.toFixed(2)}:1`);
  } else {
    failures++;
    console.error(`  FAIL ${label} — ${ratio.toFixed(2)}:1, needs ${min}:1`);
  }
}

console.log('========================================');
console.log('TEST: text is readable on every surface');
console.log('========================================');

// Every text tone, on both backgrounds it can land on.
for (const [name, hex] of [
  ['ink', color.ink],
  ['inkSecondary', color.inkSecondary],
  ['inkMuted', color.inkMuted],
] as const) {
  assertContrast(hex, color.surface, AA, `${name} on surface`);
  assertContrast(hex, color.canvas, AA, `${name} on canvas`);
  assertContrast(hex, color.surfaceSunken, AA, `${name} on sunken`);
}

console.log('');
console.log('========================================');
console.log('TEST: buttons are readable');
console.log('========================================');

// The old primary button was white on #4CAF50 = 2.78:1. It shipped.
assertContrast(color.onAction, color.green, AA, 'white on green button');
assertContrast(color.onActionMuted, color.green, AA, 'secondary copy on green button');
assertContrast(color.onAction, color.greenPressed, AA, 'white on pressed green');
assertContrast(color.onAction, color.red, AA, 'white on red button');
assertContrast(color.onAction, color.amber, AA, 'white on amber button');
assertContrast(color.onAction, color.info, AA, 'white on info');

console.log('');
console.log('========================================');
console.log('TEST: money colours read on their own tints');
console.log('========================================');

assertContrast(color.greenInk, color.greenSoft, AA, 'green ink on green tint');
assertContrast(color.redInk, color.redSoft, AA, 'red ink on red tint');
assertContrast(color.amberInk, color.amberSoft, AA, 'amber ink on amber tint');
assertContrast(color.infoInk, color.infoSoft, AA, 'info ink on info tint');

// Coloured amounts also sit directly on cards and on the page.
for (const [name, hex] of [
  ['green', color.greenInk],
  ['red', color.redInk],
  ['amber', color.amberInk],
  ['info', color.infoInk],
] as const) {
  assertContrast(hex, color.surface, AA, `${name} ink on surface`);
  assertContrast(hex, color.canvas, AA, `${name} ink on canvas`);
}

// A tinted hairline must show against its own fill, or the card looks unfinished.
for (const [name, border, fill] of [
  ['green', color.greenBorder, color.greenSoft],
  ['amber', color.amberBorder, color.amberSoft],
  ['red', color.redBorder, color.redSoft],
  ['info', color.infoBorder, color.infoSoft],
] as const) {
  check(contrast(border, fill) >= 1.15, `${name} hairline shows on its own tint`);
}

console.log('');
console.log('========================================');
console.log('TEST: borders are visible');
console.log('========================================');

// A border nobody can see is not a border. 1.2:1 is about the floor for a
// hairline to register at all against its background.
check(contrast(color.border, color.surface) >= 1.15, 'border shows against surface');
check(contrast(color.borderStrong, color.surface) >= 1.3, 'strong border shows against surface');
check(contrast(color.canvas, color.surface) >= 1.03, 'cards separate from the page behind them');

console.log('');
console.log('========================================');
console.log('TEST: the scales hold together');
console.log('========================================');

// Body text below 16 is not comfortably readable on a phone.
check(type.body.fontSize >= 16, 'body text is at least 16px');
check(type.bodyStrong.fontSize >= 16, 'strong body text is at least 16px');

// Large-text contrast relief only applies above 24px, so anything claiming to
// be a "display" size must actually be one.
check(type.display.fontSize >= 24, 'display size qualifies as large text');
check(type.amount.fontSize >= 24, 'amount size qualifies as large text');

// Line height should be ~1.4-1.5 of the font size for body copy.
const bodyRatio = type.body.lineHeight / type.body.fontSize;
check(bodyRatio >= 1.35 && bodyRatio <= 1.6, `body line-height is comfortable (${bodyRatio.toFixed(2)})`);

// The hero is the profit answer; nothing else may match it.
check(type.hero.fontSize > type.display.fontSize, 'the hero number outranks every other size');

// The scale must actually descend, or it is not a scale.
const sizes = [
  type.hero.fontSize, type.display.fontSize, type.amount.fontSize, type.h1.fontSize,
  type.h2.fontSize, type.title.fontSize, type.body.fontSize,
  type.label.fontSize, type.caption.fontSize,
];
check(
  sizes.every((s, i) => i === 0 || s <= sizes[i - 1]),
  'the type scale descends without collisions'
);

// A 4pt grid keeps spacing rhythmic instead of arbitrary.
check(
  Object.values(space).every(v => v % 4 === 0),
  'every spacing step sits on the 4pt grid'
);
check(
  Object.values(space).every((v, i, a) => i === 0 || v > a[i - 1]),
  'the spacing scale ascends'
);

console.log('');
console.log('========================================');
console.log('TEST: touch and motion are usable');
console.log('========================================');

check(touch.minTarget >= 44, 'minimum touch target is at least 44pt');
check(control.compact >= touch.minTarget, 'compact controls keep the minimum touch target');
check(control.input >= touch.minTarget, 'inputs keep the minimum touch target');
check(control.button >= touch.minTarget, 'buttons keep the minimum touch target');
check(border.selected > border.hairline, 'selected controls are stronger than resting controls');
check(border.focus >= 2, 'keyboard focus is visible');
check(icon.sm < icon.md && icon.md < icon.lg && icon.lg < icon.xl, 'icon sizes form a coherent scale');
check(state.disabledOpacity >= 0.4, 'disabled controls remain recognisable');
check(numeric.fontVariant.includes('tabular-nums'), 'money uses stable-width numerals');
check(
  motion.fast >= 150 && motion.slow <= 300,
  'motion stays in the 150-300ms band: faster reads as a glitch, slower feels sluggish'
);
check(motion.pressScale < 1 && motion.pressScale >= 0.95, 'press feedback is felt but not cartoonish');

console.log('');
if (failures > 0) {
  console.error(`FAILED: ${failures} check(s) did not hold`);
  process.exit(1);
}
console.log('PASSED: all theme checks held');
