/**
 * Styles specific to the credit book.
 *
 * Shared pieces (container, headers, inputs, save button) come from
 * ../styles. Only what is genuinely new to this feature lives here, using the
 * same palette as the rest of the app:
 *   #4CAF50 green   = money coming in / positive action
 *   #E67E22 orange  = money owed / needs attention
 *   #1A1A1A         = primary text
 *   #888888         = secondary text
 */

import { StyleSheet } from 'react-native';

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
    backgroundColor: '#FFF8F0',
    padding: 20,
    borderRadius: 12,
    alignItems: 'center',
  },
  totalLabel: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 4,
  },
  totalAmount: {
    fontSize: 32,
    fontWeight: '700',
    color: '#E67E22',
  },
  totalHint: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 6,
    textAlign: 'center',
  },

  // Broken promises. Above the quiet debts, because a named day that has passed
  // is more actionable than silence.
  overdueCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FDF3F2',
    padding: 16,
    borderRadius: 12,
  },
  overdueTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#C0392B',
    marginBottom: 8,
  },
  overdueItem: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 4,
  },
  overdueHint: {
    fontSize: 11,
    color: '#AAAAAA',
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
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  dueChipActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F2',
  },
  dueChipText: {
    fontSize: 14,
    color: '#666666',
  },
  dueChipTextActive: {
    color: '#2E7D32',
    fontWeight: '600',
  },

  // Debts that have gone quiet
  staleCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFF4F4',
    padding: 16,
    borderRadius: 12,
  },
  staleTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#C0392B',
    marginBottom: 8,
  },
  staleItem: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 4,
  },
  staleHint: {
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 6,
    fontStyle: 'italic',
  },

  // One customer
  customerCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
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
    color: '#1A1A1A',
    flex: 1,
  },
  customerBalance: {
    fontSize: 20,
    fontWeight: '700',
    color: '#E67E22',
  },
  customerBalanceCredit: {
    color: '#4CAF50',
  },
  customerCardSettled: {
    backgroundColor: '#FBFBFB',
  },
  customerSettledTag: {
    fontSize: 12,
    color: '#4CAF50',
    fontWeight: '500',
  },
  customerMeta: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 2,
  },
  customerMetaOverdue: {
    color: '#C0392B',
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
    borderColor: '#E0E0E0',
    alignItems: 'center',
  },
  giveButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
  },
  receiveButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    backgroundColor: '#4CAF50',
    alignItems: 'center',
  },
  receiveButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Recording an entry
  entryCustomer: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  entryCurrent: {
    fontSize: 14,
    color: '#888888',
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
    color: '#1A1A1A',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
});
