/**
 * Styles specific to expenses.
 *
 * Shared pieces (container, headers, inputs, save button) come from
 * ../styles; every colour, size and space comes from ../theme.
 *
 * Expenses are money leaving the shop, so this screen is red throughout.
 * Green appears only on the category the owner has chosen — an action, not an
 * amount.
 */

import { StyleSheet } from 'react-native';

import { border, color, control, icon, numeric, radius, space, touch, type } from '../theme';

export const expenseStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  form: {
    padding: space.lg,
  },

  // Month total
  totalCard: {
    marginHorizontal: space.base,
    marginTop: space.md,
    backgroundColor: color.redSoft,
    padding: space.lg,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  totalLabel: {
    ...type.caption,
    color: color.inkMuted,
    marginBottom: space.xs,
  },
  totalAmount: {
    ...type.display,
    ...numeric,
    color: color.redInk,
  },

  // Category breakdown
  breakdownCard: {
    marginHorizontal: space.base,
    marginTop: space.md,
    backgroundColor: color.surfaceSunken,
    borderRadius: radius.md,
    padding: space.md,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
  },
  breakdownIcon: {
    fontSize: icon.sm,
    marginRight: space.sm,
  },
  breakdownName: {
    flex: 1,
    ...type.label,
    color: color.inkSecondary,
  },
  breakdownShare: {
    ...type.caption,
    color: color.inkMuted,
    marginRight: space.md,
  },
  breakdownAmount: {
    ...type.label,
    ...numeric,
    fontWeight: '700',
    color: color.ink,
  },

  // One expense
  expenseCard: {
    marginHorizontal: space.base,
    marginTop: space.sm,
    backgroundColor: color.surface,
    borderRadius: radius.md,
    borderWidth: border.hairline,
    borderColor: color.border,
    overflow: 'hidden',
  },
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: space.md,
  },
  receiptPhoto: {
    width: 52,
    height: 52,
    marginRight: space.sm,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSunken,
  },
  expenseIcon: {
    fontSize: icon.md,
    marginRight: space.md,
  },
  expenseBody: {
    flex: 1,
    minWidth: 80,
  },
  expenseCategory: {
    ...type.bodyStrong,
    color: color.ink,
  },
  expenseNote: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.xs,
  },
  expenseAmount: {
    ...type.bodyStrong,
    ...numeric,
    color: color.redInk,
    marginTop: space.xs,
  },
  removeButton: {
    minHeight: touch.minTarget,
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    marginLeft: space.sm,
    borderRadius: radius.sm,
  },
  removeButtonText: {
    ...type.label,
    color: color.redInk,
    fontWeight: '700',
  },
  confirmBox: {
    padding: space.md,
    gap: space.xs,
    backgroundColor: color.redSoft,
    borderTopWidth: border.hairline,
    borderTopColor: color.redBorder,
  },
  confirmTitle: {
    ...type.bodyStrong,
    color: color.redInk,
  },
  confirmHint: {
    ...type.caption,
    color: color.inkSecondary,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: space.sm,
    marginTop: space.sm,
  },
  confirmCancel: {
    minHeight: control.compact,
    justifyContent: 'center',
    paddingHorizontal: space.base,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    borderColor: color.borderStrong,
    backgroundColor: color.surface,
  },
  confirmCancelText: {
    ...type.bodyStrong,
    color: color.ink,
  },
  confirmDelete: {
    minHeight: control.compact,
    justifyContent: 'center',
    paddingHorizontal: space.base,
    borderRadius: radius.sm,
    backgroundColor: color.red,
  },
  confirmDeleteText: {
    ...type.bodyStrong,
    color: color.onAction,
  },

  // Category picker
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
    marginTop: space.xs,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  categoryChipActive: {
    borderColor: color.greenBorder,
    backgroundColor: color.greenSoft,
  },
  categoryChipIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 14,
    color: color.inkSecondary,
  },
  categoryChipTextActive: {
    color: color.greenInk,
    fontWeight: '600',
  },
  notStockHint: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.md,
    fontStyle: 'italic',
  },

  // Empty state
  emptyIcon: {
    fontSize: icon.empty,
    marginBottom: space.md,
  },
  emptyTitle: {
    ...type.h2,
    color: color.ink,
    marginBottom: space.sm,
    textAlign: 'center',
  },
  emptyHint: {
    ...type.label,
    color: color.inkMuted,
    textAlign: 'center',
    marginBottom: space.xl,
  },
});
