/**
 * Styles specific to cash-up.
 *
 * Palette matches the rest of the app:
 *   #4CAF50 green   = balanced / money in
 *   #E67E22 orange  = surplus, worth a look but not alarming
 *   #C0392B red     = short / money out
 */

import { StyleSheet } from 'react-native';

export const cashUpStyles = StyleSheet.create({
  form: {
    padding: 20,
  },
  question: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 6,
  },
  hint: {
    fontSize: 14,
    color: '#888888',
    marginBottom: 4,
    lineHeight: 20,
  },
  since: {
    fontSize: 12,
    color: '#AAAAAA',
    marginBottom: 16,
  },
  warning: {
    fontSize: 13,
    color: '#B26A00',
    backgroundColor: '#FFF8E6',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    lineHeight: 18,
  },

  // Verdict
  verdictCard: {
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 20,
  },
  verdictOk: {
    backgroundColor: '#F1F8F2',
  },
  verdictShort: {
    backgroundColor: '#FDF3F2',
  },
  verdictOver: {
    backgroundColor: '#FFF8F0',
  },
  verdictIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  verdictLabel: {
    fontSize: 14,
    color: '#888888',
  },
  verdictAmount: {
    fontSize: 34,
    fontWeight: '700',
    color: '#1A1A1A',
    marginTop: 2,
  },
  verdictStatement: {
    fontSize: 14,
    color: '#555555',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // The money trail
  trailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  trailCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  trailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
  },
  trailLabel: {
    fontSize: 14,
    color: '#666666',
    flex: 1,
  },
  trailAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  trailAmountIn: {
    color: '#2E7D32',
  },
  trailAmountOut: {
    color: '#C0392B',
  },
  trailDivider: {
    height: 1,
    backgroundColor: '#E5E5E5',
    marginVertical: 8,
  },
  trailTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  trailTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1A1A1A',
  },

  // History
  historySection: {
    marginTop: 32,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  historyDate: {
    flex: 1,
    fontSize: 13,
    color: '#888888',
  },
  historyCounted: {
    fontSize: 14,
    color: '#1A1A1A',
    fontWeight: '500',
    marginRight: 12,
  },
  historyDiff: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4CAF50',
    minWidth: 64,
    textAlign: 'right',
  },
  historyDiffShort: {
    color: '#C0392B',
  },
  historyDiffOver: {
    color: '#E67E22',
  },
  historyOpening: {
    fontSize: 12,
    color: '#AAAAAA',
    minWidth: 64,
    textAlign: 'right',
    fontStyle: 'italic',
  },
});
