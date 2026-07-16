/**
 * Styles for the month calendar and year picker.
 *
 * Every value comes from ../theme.
 */

import { StyleSheet } from 'react-native';

import { color, elevation, radius, space, touch, type } from '../theme';

export const calendarStyles = StyleSheet.create({
  // Year switcher
  yearBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.md,
    gap: space.xl,
  },
  yearArrow: {
    width: touch.minTarget,
    height: touch.minTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  yearArrowDisabled: {
    opacity: 0.25,
  },
  yearArrowText: {
    fontSize: 28,
    color: color.inkSecondary,
    lineHeight: 32,
  },
  yearLabel: {
    ...type.h1,
    color: color.ink,
    minWidth: 88,
    textAlign: 'center',
  },

  // Twelve months
  monthGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    padding: space.base,
  },
  monthTile: {
    flexGrow: 1,
    flexBasis: '28%',
    minWidth: 96,
    minHeight: 76,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.md,
    ...elevation.card,
  },
  monthTileFilled: {
    backgroundColor: color.greenSoft,
    borderWidth: 1,
    borderColor: color.greenBorder,
  },
  monthTilePressed: {
    backgroundColor: color.surfaceSunken,
  },
  // A month that has not happened yet: visible, but plainly not offered.
  monthTileDisabled: {
    backgroundColor: color.surfaceSunken,
    opacity: 0.45,
  },
  monthTileName: {
    ...type.bodyStrong,
    color: color.ink,
  },
  monthTileNameDisabled: {
    color: color.inkMuted,
  },
  monthTileAmount: {
    ...type.label,
    color: color.greenInk,
    marginTop: space.xs,
  },
  monthTileEmpty: {
    ...type.label,
    color: color.inkMuted,
    marginTop: space.xs,
  },

  // Running total, pinned above the list
  runningTotal: {
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.base,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  runningTotalLabel: {
    ...type.caption,
    color: color.inkMuted,
  },
  runningTotalAmount: {
    ...type.amount,
    color: color.ink,
  },
  runningTotalProfit: {
    ...type.label,
    color: color.greenInk,
    marginTop: 2,
  },

  // The days
  dayList: {
    flex: 1,
    paddingHorizontal: space.base,
  },
  dayListHint: {
    ...type.caption,
    color: color.inkMuted,
    paddingVertical: space.md,
    lineHeight: 18,
  },
  dayRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    gap: space.md,
  },
  dayRowWeekend: {
    // Only a tint: plenty of spaza shops trade Sunday, so this is a landmark
    // for finding your place, not a statement that the shop was shut.
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
  },
  dayLabel: {
    width: 52,
    alignItems: 'center',
  },
  dayNumber: {
    ...type.h2,
    color: color.ink,
  },
  dayWeekday: {
    ...type.caption,
    color: color.inkMuted,
  },
  dayInputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.md,
    minHeight: touch.minTarget,
  },
  // A filled day reads as done at a glance, so the owner can see their place.
  dayInputWrapFilled: {
    borderColor: color.greenBorder,
    backgroundColor: color.greenSoft,
  },
  dayCurrency: {
    ...type.body,
    color: color.inkMuted,
    marginRight: space.xs,
  },
  dayInput: {
    flex: 1,
    ...type.bodyStrong,
    color: color.ink,
    paddingVertical: space.sm,
  },

  // Pinned save
  saveBar: {
    padding: space.base,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  saveButton: {
    backgroundColor: color.green,
    paddingVertical: space.base,
    borderRadius: radius.md,
    alignItems: 'center',
    minHeight: 52,
    justifyContent: 'center',
    ...elevation.action,
  },
  saveButtonPressed: {
    backgroundColor: color.greenPressed,
  },
  saveButtonDisabled: {
    backgroundColor: color.borderStrong,
    elevation: 0,
    shadowOpacity: 0,
  },
  saveButtonText: {
    ...type.bodyStrong,
    color: color.onAction,
  },
});
