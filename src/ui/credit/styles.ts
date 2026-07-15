/**
 * Styles specific to the credit book.
 *
 * Shared pieces (container, headers, inputs, save button) come from ../styles;
 * every colour, size and space comes from ../theme. Only what is genuinely new
 * to this feature lives here.
 *
 * Within this screen the money colours mean:
 *   amber = owed to you — earned, but not in your hand
 *   red   = a promise that has passed
 *   green = paid up, or an action that brings money in
 */

import { StyleSheet } from 'react-native';

import { color } from '../theme';

export const creditStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  form: {
    padding: 20,
  },

  // Outstanding total
  totalCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.amberSoft,
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
    color: color.amberInk,
  },
  totalHint: {
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 6,
    textAlign: 'center',
  },

  // Broken promises. Above the quiet debts, because a named day that has passed
  // is more actionable than silence.
  overdueCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.redSoft,
    padding: 16,
    borderRadius: 12,
  },
  overdueTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: color.redInk,
    marginBottom: 8,
  },
  overdueItem: {
    fontSize: 14,
    color: color.inkSecondary,
    marginBottom: 4,
  },
  overdueHint: {
    fontSize: 11,
    color: color.inkMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // "When will you pay?" -- chips, not a calendar
  dueGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  dueChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: color.border,
    backgroundColor: color.surface,
  },
  dueChipActive: {
    borderColor: color.greenBorder,
    backgroundColor: color.greenSoft,
  },
  dueChipText: {
    fontSize: 14,
    color: color.inkSecondary,
  },
  dueChipTextActive: {
    color: color.greenInk,
    fontWeight: '600',
  },

  // Debts that have gone quiet.
  //
  // Amber, not red: silence is money sitting still, which is the amber idea.
  // Red is reserved for the overdue card above it -- a named day that has
  // passed. If both were red, neither would lead.
  staleCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.amberSoft,
    padding: 16,
    borderRadius: 12,
  },
  staleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: color.amberInk,
    marginBottom: 8,
  },
  staleItem: {
    fontSize: 14,
    color: color.inkSecondary,
    marginBottom: 4,
  },
  staleHint: {
    fontSize: 11,
    color: color.inkMuted,
    marginTop: 6,
    fontStyle: 'italic',
  },

  // One customer
  customerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
    padding: 16,
  },
  customerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
    flex: 1,
  },
  customerBalance: {
    fontSize: 20,
    fontWeight: '700',
    color: color.amberInk,
  },
  customerBalanceCredit: {
    color: color.greenInk,
  },
  customerCardSettled: {
    backgroundColor: color.surfaceSunken,
  },
  customerSettledTag: {
    fontSize: 12,
    color: color.greenInk,
    fontWeight: '500',
  },
  customerMeta: {
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 2,
  },
  customerMetaOverdue: {
    color: color.redInk,
    fontWeight: '500',
  },
  customerActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  giveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border,
    alignItems: 'center',
  },
  giveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: color.inkSecondary,
  },
  receiveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: color.green,
    alignItems: 'center',
  },
  receiveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: color.onAction,
  },

  // Recording an entry
  entryCustomer: {
    fontSize: 24,
    fontWeight: '700',
    color: color.ink,
  },
  entryCurrent: {
    fontSize: 14,
    color: color.inkMuted,
    marginTop: 4,
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
