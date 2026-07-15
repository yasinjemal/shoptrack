/**
 * ============================================
 * SHOPTRACK DESIGN TOKENS
 * ============================================
 *
 * The single source of visual truth. Screens use these; nothing hard-codes a
 * hex, a font size, or a margin.
 *
 * WHO THIS IS FOR, AND WHY IT LOOKS LIKE THIS
 * -------------------------------------------
 * A spaza shop owner, on a mid-range Android, holding the phone in one hand,
 * often standing in direct Johannesburg sunlight with a queue at the counter.
 * That user drove every decision here:
 *
 * - CONTRAST IS NOT DECORATION. Every colour pair below is verified to WCAG
 *   4.5:1 by theme.test.ts, which fails the build otherwise. The old palette
 *   was not: white on #4CAF50 (every primary button) was 2.78:1, and hint text
 *   at #AAAAAA was 2.32:1 — invisible outdoors. That is most of why the app
 *   read as washed out.
 *
 * - DEPTH, NOT DECORATION. The old UI was white cards on a white page, which
 *   is why it looked flat and unfinished. A tinted canvas plus real elevation
 *   makes cards read as objects without any ornament.
 *
 * - MONEY HAS A COLOUR, AND IT IS CONSISTENT. Green is money in. Red is money
 *   out or missing. Amber is money owed to you — earned but not in hand. An
 *   owner should learn this once and read every screen faster because of it.
 *
 * - BIG NUMBERS ARE THE PRODUCT. Profit, what is owed, what is missing: these
 *   are why the app exists, so the type scale gives them real size and lets
 *   everything else recede.
 */

// Type-only import: it erases at build time, so this module stays pure and
// theme.test.ts can verify the palette in plain node, exactly like src/core.
import type { TextStyle, ViewStyle } from 'react-native';

// ============================================
// COLOUR
// ============================================
//
// Verified against #FFFFFF (surface) and #F4F6F8 (canvas) in theme.test.ts.
// If you add a colour that carries text, add it to that test.

export const color = {
  /** Page background. Deliberately not white, so cards have something to sit on. */
  canvas: '#F4F6F8',
  /** Cards and sheets. */
  surface: '#FFFFFF',
  /** Recessed areas inside a card: table rows, breakdowns. */
  surfaceSunken: '#F9FAFB',

  border: '#E2E6EA',
  borderStrong: '#CBD2D9',

  /** Headings and anything numeric. 18:1 on surface. */
  ink: '#12161B',
  /** Body copy and labels. 7.6:1. */
  inkSecondary: '#4B5563',
  /**
   * Hints and metadata. 5.0:1 — still legible in sunlight.
   *
   * This is the LIGHTEST text tone that exists. There is deliberately no
   * fainter tier: the old #AAAAAA and #BBBBBB were unreadable outdoors, and
   * anything worth putting on screen is worth being able to read.
   */
  inkMuted: '#667085',
  /** Text on a solid coloured button. */
  onAction: '#FFFFFF',

  // Money in / positive / primary action
  green: '#2E7D32',
  greenPressed: '#1B5E20',
  greenInk: '#1B5E20',
  greenSoft: '#E7F4E9',

  // Money out / missing / loss
  red: '#B3261E',
  redPressed: '#8C1D18',
  redInk: '#8C1D18',
  redSoft: '#FDECEA',

  // Owed to you, or tied up in stock that will not move: earned, but not in
  // your hand. Slow stock lives here too -- it is the same idea.
  amber: '#8A5200',
  amberPressed: '#7A4900',
  amberInk: '#7A4900',
  amberSoft: '#FFF3E0',

  /** Teaching and guidance. Never a number -- money is green, red or amber. */
  info: '#1160B4',
  infoInk: '#0C4A8C',
  infoSoft: '#E8F1FB',

  /**
   * Hairlines on tinted cards. A neutral grey border on a coloured fill looks
   * like a mistake, so each tint family gets its own.
   */
  greenBorder: '#BFE0C4',
  amberBorder: '#F0D5A4',
  redBorder: '#F3C9C4',
  infoBorder: '#BBD5F0',

  /** Android ripple. Low alpha so it reads as touch, not as a flash. */
  ripple: 'rgba(18, 22, 27, 0.09)',
} as const;

// ============================================
// SPACING — 4pt grid
// ============================================
//
// Every margin and pad comes from here. Consistent rhythm is most of what
// separates a designed screen from an assembled one.

export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
} as const;

// ============================================
// RADIUS
// ============================================

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 999,
} as const;

// ============================================
// TYPE SCALE
// ============================================
//
// Body is 16 and never smaller — the minimum readable size on a phone. `caption`
// at 13 is for genuinely secondary metadata only, never for anything the owner
// needs to act on.
//
// Line heights sit around 1.4–1.5. Big numbers get negative tracking, because
// default spacing makes large digits look loose and amateurish.

export const type = {
  /**
   * The profit figure on Home, and nothing else.
   *
   * "Am I actually making money?" is the whole product, so its answer gets a
   * size no other element is allowed to have. One hero per screen, or it stops
   * being one.
   */
  hero: { fontSize: 44, lineHeight: 50, fontWeight: '700', letterSpacing: -1.2 },
  /** Big numbers below the hero: owed, missing, month total. */
  display: { fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: -0.8 },
  /** Secondary big number. */
  amount: { fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  h1: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -0.2 },
  title: { fontSize: 17, lineHeight: 23, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  label: { fontSize: 14, lineHeight: 19, fontWeight: '500' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
} as const satisfies Record<string, TextStyle>;

// ============================================
// ELEVATION
// ============================================
//
// Android reads `elevation`; iOS needs the shadow* family. Both are set on
// every level: each platform ignores the other's props, so there is no need for
// a Platform branch -- and without one this module stays pure and testable.
//
// Kept shallow. The goal is that a card reads as an object, not that it floats.

function shadow(level: 1 | 2 | 3): ViewStyle {
  const spec = {
    1: { elevation: 1, radius: 3, opacity: 0.06, y: 1 },
    2: { elevation: 3, radius: 8, opacity: 0.08, y: 2 },
    3: { elevation: 6, radius: 16, opacity: 0.12, y: 4 },
  }[level];

  return {
    elevation: spec.elevation,
    shadowColor: '#12161B',
    shadowOffset: { width: 0, height: spec.y },
    shadowOpacity: spec.opacity,
    shadowRadius: spec.radius,
  };
}

export const elevation = {
  /** Resting card. */
  card: shadow(1),
  /** Something asking to be noticed. */
  raised: shadow(2),
  /** The primary action. */
  action: shadow(3),
} as const;

// ============================================
// MOTION
// ============================================
//
// 150–300ms. Below that a transition reads as a glitch; above it, the app feels
// slow. Only ever animate transform and opacity -- animating width or height
// re-lays-out every frame and drops frames on the mid-range phones this runs on.

export const motion = {
  fast: 150,
  base: 200,
  slow: 300,
  /** How far a primary button sinks when pressed. */
  pressScale: 0.97,
} as const;

// ============================================
// TOUCH
// ============================================

export const touch = {
  /** WCAG / platform minimum. Nothing tappable is smaller. */
  minTarget: 44,
  /** Grows the touch area of small controls without growing the visual. */
  hitSlop: { top: 8, bottom: 8, left: 8, right: 8 },
} as const;
