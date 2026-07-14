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
  customerMeta: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 2,
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
