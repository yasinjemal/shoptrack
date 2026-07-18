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

import { border, color, control, icon, numeric, radius, space, type } from '../theme';

export const creditStyles = StyleSheet.create({
  list: {
    flex: 1,
  },
  form: {
    padding: space.lg,
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
    ...type.display,
    ...numeric,
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
    gap: space.sm,
    marginTop: space.xs,
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
  customerSummaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  customerSummaryBody: {
    flex: 1,
    minWidth: 0,
  },
  customerPhoto: {
    width: 56,
    height: 56,
    marginRight: space.md,
    borderRadius: radius.sm,
    backgroundColor: color.surfaceSunken,
  },
  customerHeader: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: space.xs,
  },
  customerName: {
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
    flex: 1,
    minWidth: 96,
  },
  customerBalance: {
    ...type.h2,
    ...numeric,
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
    flexWrap: 'wrap',
    marginTop: space.md,
    gap: space.sm,
  },
  manageButton: {
    flex: 1,
    minWidth: 92,
    minHeight: control.compact,
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
    borderColor: color.greenBorder,
    backgroundColor: color.greenSoft,
    alignItems: 'center',
  },
  manageButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: color.greenInk,
  },
  giveButton: {
    flex: 1,
    minWidth: 92,
    minHeight: control.compact,
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
    borderWidth: border.hairline,
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
    minWidth: 92,
    minHeight: control.compact,
    justifyContent: 'center',
    paddingVertical: space.sm,
    borderRadius: radius.sm,
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
    ...type.h1,
    color: color.ink,
  },
  entryCurrent: {
    fontSize: 14,
    color: color.inkMuted,
    marginTop: 4,
  },
  manageCustomerIntro: {
    marginBottom: space.md,
  },

  // Empty state
  emptyIcon: {
    fontSize: icon.empty,
    marginBottom: space.md,
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
