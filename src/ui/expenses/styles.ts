/**
 * Styles specific to expenses.
 *
 * Shared pieces (container, headers, inputs, save button) come from
 * ../styles. Palette matches the rest of the app:
 *   #4CAF50 green   = money in
 *   #E67E22 orange  = money owed to the shop (credit)
 *   #C0392B red     = money going out (expenses)
 */

import { StyleSheet } from 'react-native';

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
    backgroundColor: '#FDF3F2',
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
    color: '#C0392B',
  },

  // Category breakdown
  breakdownCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FAFAFA',
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
    color: '#555555',
  },
  breakdownShare: {
    fontSize: 12,
    color: '#AAAAAA',
    marginRight: 12,
  },
  breakdownAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1A1A1A',
  },

  // One expense
  expenseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
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
    color: '#1A1A1A',
  },
  expenseNote: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 2,
  },
  expenseAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#C0392B',
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
    borderColor: '#E0E0E0',
    backgroundColor: '#FFFFFF',
  },
  categoryChipActive: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F2',
  },
  categoryChipIcon: {
    fontSize: 15,
    marginRight: 6,
  },
  categoryChipText: {
    fontSize: 14,
    color: '#666666',
  },
  categoryChipTextActive: {
    color: '#2E7D32',
    fontWeight: '600',
  },
  notStockHint: {
    fontSize: 12,
    color: '#AAAAAA',
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
