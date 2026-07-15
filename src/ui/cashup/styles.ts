/**
 * Styles specific to cash-up.
 *
 * Every colour, size and space comes from ../theme. Within this screen:
 *   green = the till balances
 *   amber = a surplus — worth a look, not alarming
 *   red   = money is missing
 */

import { StyleSheet } from 'react-native';

import { color } from '../theme';

export const cashUpStyles = StyleSheet.create({
  form: {
    padding: 20,
  },
  question: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 6,
  },
  hint: {
    fontSize: 14,
    color: color.inkMuted,
    marginBottom: 4,
    lineHeight: 20,
  },
  since: {
    fontSize: 12,
    color: color.inkMuted,
    marginBottom: 16,
  },
  warning: {
    fontSize: 13,
    color: color.amberInk,
    backgroundColor: color.amberSoft,
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
    backgroundColor: color.greenSoft,
  },
  verdictShort: {
    backgroundColor: color.redSoft,
  },
  verdictOver: {
    backgroundColor: color.amberSoft,
  },
  verdictIcon: {
    fontSize: 32,
    marginBottom: 4,
  },
  verdictLabel: {
    fontSize: 14,
    color: color.inkMuted,
  },
  verdictAmount: {
    fontSize: 34,
    fontWeight: '700',
    color: color.ink,
    marginTop: 2,
  },
  verdictStatement: {
    fontSize: 14,
    color: color.inkSecondary,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 20,
  },

  // The money trail
  trailTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
    marginBottom: 8,
  },
  trailCard: {
    backgroundColor: color.surfaceSunken,
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
    color: color.inkSecondary,
    flex: 1,
  },
  trailAmount: {
    fontSize: 14,
    fontWeight: '500',
    color: color.ink,
  },
  trailAmountIn: {
    color: color.greenInk,
  },
  trailAmountOut: {
    color: color.redInk,
  },
  trailDivider: {
    height: 1,
    backgroundColor: color.borderStrong,
    marginVertical: 8,
  },
  trailTotalLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  trailTotalValue: {
    fontSize: 16,
    fontWeight: '700',
    color: color.ink,
  },

  // History
  historySection: {
    marginTop: 32,
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: color.inkMuted,
    marginBottom: 8,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  historyDate: {
    flex: 1,
    fontSize: 13,
    color: color.inkMuted,
  },
  historyCounted: {
    fontSize: 14,
    color: color.ink,
    fontWeight: '500',
    marginRight: 12,
  },
  historyDiff: {
    fontSize: 13,
    fontWeight: '600',
    color: color.greenInk,
    minWidth: 64,
    textAlign: 'right',
  },
  historyDiffShort: {
    color: color.redInk,
  },
  historyDiffOver: {
    color: color.amberInk,
  },
  historyOpening: {
    fontSize: 12,
    color: color.inkMuted,
    minWidth: 64,
    textAlign: 'right',
    fontStyle: 'italic',
  },
});
