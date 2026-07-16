/**
 * Styles specific to the sales book.
 *
 * Every colour, size and space comes from ../theme. Within this screen:
 *   green = money kept
 *   amber = a month that contradicts itself and needs a decision
 */

import { StyleSheet } from 'react-native';

import { color, elevation, radius, space, type } from '../theme';

export const salesStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  form: {
    padding: space.lg,
  },

  // Everything kept, all the way back
  totalCard: {
    marginHorizontal: space.base,
    marginTop: space.md,
    backgroundColor: color.surface,
    padding: space.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...elevation.raised,
  },
  totalLabel: {
    ...type.label,
    color: color.inkSecondary,
    marginBottom: space.xs,
  },
  totalAmount: {
    ...type.display,
    color: color.greenInk,
  },
  totalHint: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },

  // A month whose total and days disagree
  conflictCard: {
    marginHorizontal: space.base,
    marginTop: space.md,
    backgroundColor: color.amberSoft,
    borderWidth: 1,
    borderColor: color.amberBorder,
    padding: space.base,
    borderRadius: radius.md,
  },
  conflictTitle: {
    ...type.bodyStrong,
    color: color.amberInk,
    marginBottom: space.sm,
  },
  conflictItem: {
    ...type.body,
    color: color.amberInk,
    paddingVertical: space.xs,
  },

  // One month
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.base,
    marginTop: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    padding: space.base,
    ...elevation.card,
  },
  monthBody: {
    flex: 1,
  },
  monthName: {
    ...type.title,
    color: color.ink,
  },
  monthMeta: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: 2,
  },
  monthProfit: {
    ...type.h2,
    color: color.greenInk,
  },

  footnote: {
    ...type.caption,
    color: color.inkMuted,
    marginHorizontal: space.base,
    marginTop: space.base,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Actions
  actions: {
    padding: space.base,
    gap: space.md,
  },
  primaryButton: {
    backgroundColor: color.green,
    paddingVertical: space.base,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    ...elevation.action,
  },
  primaryButtonPressed: {
    backgroundColor: color.greenPressed,
  },
  primaryButtonText: {
    ...type.bodyStrong,
    color: color.onAction,
  },
  secondaryButton: {
    backgroundColor: color.surface,
    borderWidth: 1,
    borderColor: color.borderStrong,
    paddingVertical: space.base,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
  },
  secondaryButtonPressed: {
    backgroundColor: color.surfaceSunken,
  },
  secondaryButtonText: {
    ...type.bodyStrong,
    color: color.inkSecondary,
  },

  // The month chips that used to live here are gone: picking a month is now a
  // year grid in calendarStyles.ts, because a row of chips could not show which
  // months were already filled in.

  marginNote: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.md,
    fontStyle: 'italic',
    lineHeight: 18,
  },

  // Empty state
  emptyIcon: {
    fontSize: 48,
    marginBottom: space.md,
  },
  emptyTitle: {
    ...type.h2,
    color: color.ink,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  emptyHint: {
    ...type.body,
    color: color.inkSecondary,
    textAlign: 'center',
    marginBottom: space.xl,
  },
});
