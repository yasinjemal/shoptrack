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

import { color } from '../theme';

export const expenseStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  form: {
    padding: 20,
  },

  // Month total
  totalCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.redSoft,
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: color.redInk,
  },

  // Category breakdown
  breakdownCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.surfaceSunken,
    borderRadius: 12,
    padding: 12,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  breakdownIcon: {
    fontSize: 16,
    marginRight: 8,
  },
  breakdownName: {
    flex: 1,
    fontSize: 14,
    color: color.inkSecondary,
  },
  breakdownShare: {
    fontSize: 12,
    color: color.inkMuted,
    marginRight: 12,
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: color.ink,
  },

  // One expense
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    padding: 14,
  },
  expenseIcon: {
    fontSize: 20,
    marginRight: 12,
  },
  expenseBody: {
    flex: 1,
  },
  expenseCategory: {
    fontSize: 16,
    fontWeight: '500',
    color: color.ink,
  },
  expenseNote: {
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: color.redInk,
  },

  // Category picker
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
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
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 10,
    fontStyle: 'italic',
    lineHeight: 17,
  },

  // Empty state
  emptyIcon: {
    fontSize: 48,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: color.ink,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: color.inkMuted,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
