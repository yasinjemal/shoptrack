/**
 * ============================================
 * SHOPTRACK SHARED STYLES
 * ============================================
 *
 * One StyleSheet for the whole app. Screens import from here rather than
 * defining their own, so a new feature looks like the rest of ShopTrack
 * without copying values around.
 */

import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666666',
  },

  // Container
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },

  // Home header
  homeHeader: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: '#4CAF50',
  },
  homeContent: {
    flex: 1,
  },
  appName: {
    fontSize: 32,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagline: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },

  // Profit card
  profitCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  profitLabel: {
    fontSize: 14,
    color: '#666666',
    marginBottom: 8,
  },
  profitValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#4CAF50',
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  statLabel: {
    fontSize: 13,
    color: '#666666',
    marginTop: 4,
  },

  // Tier 3.3: Stock Value Card
  // Database failed to open. Deliberately plain and non-alarming: the data is
  // almost certainly fine, and the owner should not think it is gone.
  dbErrorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  dbErrorIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  dbErrorTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
    marginBottom: 10,
  },
  dbErrorHint: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  // The raw error, for whoever is debugging this rather than shopping.
  dbErrorDetail: {
    fontSize: 11,
    color: '#BBBBBB',
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Cash missing from the till at the last cash-up. Red, and above everything
  // else on Home, because it is the only card that means something is wrong.
  shortfallCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FDF3F2',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shortfallLabel: {
    fontSize: 13,
    color: '#C0392B',
    fontWeight: '600',
    marginBottom: 2,
  },
  shortfallAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: '#C0392B',
  },
  shortfallHint: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 4,
    textAlign: 'center',
  },

  // Net profit: sales, minus costs, equals what the owner actually kept.
  // Laid out as a sum so the arithmetic is visible rather than asserted.
  netCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#EEEEEE',
    padding: 16,
  },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  netRowLabel: {
    fontSize: 14,
    color: '#888888',
  },
  netRowValue: {
    fontSize: 15,
    color: '#1A1A1A',
    fontWeight: '500',
  },
  netRowCost: {
    fontSize: 15,
    color: '#C0392B',
    fontWeight: '500',
  },
  netDivider: {
    height: 1,
    backgroundColor: '#EEEEEE',
    marginVertical: 8,
  },
  netKeptLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  netKeptValue: {
    fontSize: 22,
    fontWeight: '700',
    color: '#4CAF50',
  },
  netKeptLoss: {
    color: '#C0392B',
  },
  netNoExpenses: {
    marginHorizontal: 16,
    marginTop: 12,
    fontSize: 12,
    color: '#AAAAAA',
    fontStyle: 'italic',
    lineHeight: 17,
  },

  // Credit book: money owed to the shop. Orange, because it is money the
  // owner has earned but does not have.
  creditCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFF8F0',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  creditCardLabel: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 4,
  },
  creditCardAmount: {
    fontSize: 26,
    fontWeight: '700',
    color: '#E67E22',
  },
  creditCardHint: {
    fontSize: 12,
    color: '#AAAAAA',
    marginTop: 4,
  },
  profitOwedNote: {
    fontSize: 12,
    color: '#E67E22',
    marginTop: 8,
    textAlign: 'center',
  },

  stockValueCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FAFAFA',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  stockValueLabel: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 4,
  },
  stockValueAmount: {
    fontSize: 22,
    fontWeight: '600',
    color: '#555555',
  },
  stockValueHint: {
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 4,
    fontStyle: 'italic',
  },
  stockValueMissing: {
    fontSize: 11,
    color: '#BBBBBB',
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Tier 4.1: Restock Priority
  restockPriorityCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
  },
  restockPriorityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555555',
    marginBottom: 12,
  },
  restockPriorityItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    flexWrap: 'wrap',
  },
  restockPriorityNumber: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    width: 20,
  },
  restockPriorityName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333333',
  },
  restockPriorityReason: {
    fontSize: 13,
    color: '#888888',
    marginLeft: 4,
  },
  restockPriorityHint: {
    fontSize: 11,
    color: '#AAAAAA',
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Actions
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  primaryAction: {
    backgroundColor: '#4CAF50',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
  },
  primaryActionIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  primaryActionText: {
    fontSize: 20,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  primaryActionSubtext: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  // Wraps into a grid rather than a single row. With five actions, `flex: 1`
  // in a fixed row gives each about 56dp on a small phone and the labels get
  // clipped. flexBasis puts three per row and lets the last row grow to fill.
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  secondaryAction: {
    flexGrow: 1,
    flexBasis: '30%',
    minWidth: 96,
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  secondaryActionText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  secondaryActionHint: {
    fontSize: 12,
    color: '#888888',
    marginTop: 4,
  },

  // How it works card
  howItWorksCard: {
    backgroundColor: '#FFFFFF',
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 16,
  },
  howItWorksStep: {
    fontSize: 15,
    color: '#333333',
    marginBottom: 8,
    lineHeight: 22,
  },
  stepNumber: {
    fontWeight: '700',
    color: '#4CAF50',
  },
  howItWorksNote: {
    fontSize: 13,
    color: '#666666',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
    fontStyle: 'italic',
  },

  // Profit explainer
  profitExplainer: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 8,
  },

  // Empty state
  emptyPrompt: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    margin: 16,
    borderRadius: 16,
  },
  emptyPromptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  emptyPromptText: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyPromptHow: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyPromptButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  emptyPromptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Screen header
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  backButton: {
    fontSize: 16,
    color: '#4CAF50',
  },
  addButton: {
    fontSize: 16,
    color: '#4CAF50',
    fontWeight: '600',
  },

  // Empty state (screens)
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    fontSize: 18,
    color: '#999999',
    marginBottom: 16,
  },
  emptyStateButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Product list
  productList: {
    flex: 1,
  },
  productItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productItemContent: {
    flex: 1,
  },
  productEditHint: {
    fontSize: 20,
    color: '#CCCCCC',
    marginLeft: 12,
  },
  productSelectItem: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  productName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 14,
    color: '#888888',
  },

  // Form
  formContainer: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 8,
    marginTop: 16,
  },
  inputHint: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
  },
  textInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 16,
    fontSize: 17,
    color: '#1A1A1A',
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingHorizontal: 16,
  },
  currencyPrefix: {
    fontSize: 20,
    color: '#666666',
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    padding: 16,
    fontSize: 20,
    color: '#1A1A1A',
  },
  quantityInput: {
    flex: 1,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  unitSuffix: {
    fontSize: 16,
    color: '#666666',
    marginRight: 16,
  },
  costSummary: {
    fontSize: 16,
    color: '#4CAF50',
    marginTop: 8,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
  },
  saveButtonDisabled: {
    backgroundColor: '#CCCCCC',
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  
  // Search
  searchContainer: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: '#1A1A1A',
  },
  searchClear: {
    position: 'absolute',
    right: 28,
    padding: 4,
  },
  searchClearText: {
    fontSize: 16,
    color: '#999999',
  },
  noSearchResults: {
    textAlign: 'center',
    color: '#888888',
    fontSize: 15,
    padding: 32,
  },
  
  // Edit product
  editProductInfo: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  editProductInfoText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333333',
  },
  editProductInfoHint: {
    fontSize: 13,
    color: '#888888',
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FF5252',
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FF5252',
  },

  // Count screen
  countInstructions: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  countInstructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
    textAlign: 'center',
  },
  countInstructionsHint: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    marginTop: 4,
  },
  countProgress: {
    padding: 12,
    textAlign: 'center',
    fontSize: 14,
    color: '#666666',
    backgroundColor: '#F5F5F5',
  },
  countList: {
    flex: 1,
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  countItemInfo: {
    flex: 1,
  },
  countItemName: {
    fontSize: 17,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  countItemPrev: {
    fontSize: 14,
    color: '#888888',
    marginTop: 2,
  },
  countInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    width: 70,
    color: '#1A1A1A',
  },
  countBottomBar: {
    padding: 16,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  saveCountButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  // Results screen
  resultsContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  resultsIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  resultsSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 24,
  },
  nextStepBox: {
    backgroundColor: '#E3F2FD',
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  nextStepText: {
    fontSize: 16,
    color: '#1565C0',
    textAlign: 'center',
    lineHeight: 24,
  },
  profitResultCard: {
    backgroundColor: '#4CAF50',
    paddingVertical: 32,
    paddingHorizontal: 48,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  profitResultLabel: {
    fontSize: 16,
    color: '#FFFFFF',
    opacity: 0.9,
    marginBottom: 8,
  },
  profitResultValue: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  profitExplainerText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 16,
  },
  unusualChangeText: {
    fontSize: 14,
    color: '#888888',
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  missingDataHintSmall: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  
  // Restock notice (when stock went up)
  restockNotice: {
    backgroundColor: '#FFF8E1',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  restockIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  restockTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#F57C00',
    marginBottom: 8,
  },
  restockText: {
    fontSize: 15,
    color: '#666666',
    textAlign: 'center',
    marginBottom: 12,
  },
  restockHint: {
    fontSize: 13,
    color: '#888888',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // No change notice
  noChangeNotice: {
    backgroundColor: '#F5F5F5',
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  noChangeText: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 8,
  },
  noChangeHint: {
    fontSize: 14,
    color: '#888888',
  },
  
  doneButton: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
  },

  // Stock-in
  sectionTitle: {
    fontSize: 16,
    color: '#666666',
    padding: 16,
    paddingBottom: 8,
  },
  selectedProductBanner: {
    backgroundColor: '#E8F5E9',
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  selectedProductName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  selectedProductMeta: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },

  // Tier 4.3: Silent Loss Detector
  lossCard: {
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  lossTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 10,
  },
  lossItem: {
    fontSize: 14,
    color: '#777777',
    marginBottom: 4,
  },
  lossHint: {
    fontSize: 11,
    color: '#AAAAAA',
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Activity Screen
  topSellersCard: {
    backgroundColor: '#FFF9E6',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#FFE082',
  },
  topSellersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#F57C00',
    marginBottom: 4,
  },
  topSellersSubtitle: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 12,
  },
  topSellerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FFE082',
  },
  topSellerRank: {
    fontSize: 15,
    fontWeight: '600',
    color: '#F57C00',
    width: 24,
  },
  topSellerName: {
    fontSize: 15,
    color: '#1A1A1A',
    flex: 1,
  },
  topSellerProfit: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
  },
  activitySectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666666',
    marginBottom: 12,
    marginTop: 8,
  },
  activityContent: {
    padding: 16,
  },
  activityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  activityProductName: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  activityLabel: {
    fontSize: 15,
    color: '#666666',
  },
  activityValue: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1A1A1A',
  },
  activityValueGreen: {
    fontSize: 15,
    fontWeight: '600',
    color: '#2E7D32',
  },
  activityHistory: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  activityHistoryTitle: {
    fontSize: 13,
    color: '#888888',
    marginBottom: 8,
  },
  activityHistoryItem: {
    fontSize: 14,
    color: '#666666',
    paddingVertical: 2,
  },
  activityNoData: {
    fontSize: 16,
    color: '#888888',
    textAlign: 'center',
    paddingVertical: 32,
  },

  // Activity Button (Home) - replaced by insight buttons
  activityButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  activityButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  activityButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
  },

  // Insight Buttons (Home)
  insightButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  insightButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  insightButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  insightButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1A1A1A',
    textAlign: 'center',
  },

  // Low Stock Warning (Home)
  lowStockWarning: {
    backgroundColor: '#FFF3E0',
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: '#FFCC80',
  },
  lowStockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#E65100',
    marginBottom: 8,
  },
  lowStockItem: {
    fontSize: 14,
    color: '#BF360C',
    paddingVertical: 2,
  },

  // Weekly Summary Screen
  weeklyContent: {
    flex: 1,
    padding: 24,
  },
  weeklyHeading: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1A1A1A',
    marginBottom: 24,
  },
  weeklyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  weeklyLabel: {
    fontSize: 16,
    color: '#666666',
    marginBottom: 4,
  },
  weeklyProfit: {
    fontSize: 32,
    fontWeight: '700',
    color: '#2E7D32',
  },
  confidenceCount: {
    fontSize: 13,
    color: '#888888',
    marginTop: 8,
  },
  confidenceLevel: {
    fontSize: 12,
    color: '#666666',
    fontStyle: 'italic',
    marginTop: 2,
  },
  missingDataHint: {
    fontSize: 14,
    color: '#666666',
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // Tier 4.2: Slow Stock (Money Tied Up)
  slowStockCard: {
    backgroundColor: '#FFF8E1',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  slowStockTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#8D6E63',
    marginBottom: 4,
  },
  slowStockValue: {
    fontSize: 22,
    fontWeight: '600',
    color: '#6D4C41',
    marginBottom: 12,
  },
  slowStockList: {
    marginBottom: 8,
  },
  slowStockItem: {
    fontSize: 14,
    color: '#795548',
    marginBottom: 4,
  },
  slowStockHint: {
    fontSize: 11,
    color: '#A1887F',
    fontStyle: 'italic',
  },
  
  // Tier 4.4: Owner Memory
  ownerMemoryCard: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  ownerMemoryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 8,
  },
  ownerMemoryItem: {
    fontSize: 14,
    color: '#555555',
    marginBottom: 4,
  },
  
  weeklyTopProduct: {
    fontSize: 22,
    fontWeight: '600',
    color: '#1A1A1A',
  },
  weeklyComparison: {
    fontSize: 22,
    fontWeight: '600',
  },
  weeklyComparisonUp: {
    color: '#2E7D32',
  },
  weeklyComparisonDown: {
    color: '#D32F2F',
  },
  weeklyHintCard: {
    backgroundColor: '#E3F2FD',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  weeklyHint: {
    fontSize: 15,
    color: '#1565C0',
    textAlign: 'center',
  },
  weeklyFirstWeek: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 8,
  },
  weeklyFirstWeekHint: {
    fontSize: 15,
    color: '#666666',
  },
  weeklyNoData: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666666',
    marginBottom: 8,
  },
  weeklyNoDataHint: {
    fontSize: 15,
    color: '#888888',
  },

  // Data Safety Section (Backup/Restore)
  dataSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  dataSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888888',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataButton: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  dataButtonIcon: {
    fontSize: 24,
    marginRight: 14,
  },
  dataButtonContent: {
    flex: 1,
  },
  dataButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1A1A1A',
    marginBottom: 2,
  },
  dataButtonHint: {
    fontSize: 13,
    color: '#888888',
  },

  // Language Toggle
  languageButton: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageButtonIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  languageButtonLabel: {
    fontSize: 15,
    color: '#666666',
    marginRight: 6,
  },
  languageButtonValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
  },
});
