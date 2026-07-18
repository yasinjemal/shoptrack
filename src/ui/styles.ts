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

import { color, control, elevation, icon, numeric, radius, space, touch, type } from './theme';

export const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: color.surface,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: color.inkSecondary,
  },

  // Container
  //
  // The page is tinted, not white. White cards on a white page was most of why
  // the app looked flat -- nothing read as an object, just text floating on a
  // sheet. The canvas gives every card an edge without drawing one.
  container: {
    flex: 1,
    backgroundColor: color.canvas,
  },

  // Home header
  // A header, not a splash screen.
  //
  // This was 24pt of padding on top of 60, with the name at 32pt — about a
  // sixth of a small phone's screen, spent telling a daily user the name of the
  // app they just opened. The profit figure was pushed below the fold on the
  // very screen that exists to show it.
  //
  // paddingTop still clears the status bar: React Native's SafeAreaView only
  // insets on iOS, so on Android this padding is the only thing holding the
  // green off the clock.
  homeHeader: {
    paddingHorizontal: space.base,
    paddingTop: 44,
    paddingBottom: space.md,
    backgroundColor: color.green,
  },
  homeContent: {
    flex: 1,
  },
  appName: {
    ...type.h2,
    color: color.onAction,
  },
  tagline: {
    ...type.caption,
    color: color.onAction,
    opacity: 0.9,
    marginTop: 2,
  },

  // Profit card — the reason the app exists, so it gets the most weight on the
  // page: the highest elevation, the largest number, and room to breathe.
  profitCard: {
    backgroundColor: color.surface,
    margin: space.base,
    padding: space.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    ...elevation.raised,
  },
  profitLabel: {
    ...type.label,
    color: color.inkSecondary,
    marginBottom: space.sm,
  },
  profitValue: {
    ...type.hero,
    ...numeric,
    color: color.greenInk,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 12,
  },
  statBox: {
    flex: 1,
    backgroundColor: color.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  statValue: {
    ...numeric,
    fontSize: 24,
    fontWeight: '700',
    color: color.ink,
  },
  statLabel: {
    fontSize: 13,
    color: color.inkSecondary,
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
    color: color.ink,
    textAlign: 'center',
    marginBottom: 10,
  },
  dbErrorHint: {
    fontSize: 14,
    color: color.inkSecondary,
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: 20,
  },
  dbErrorRetry: {
    backgroundColor: color.green,
    paddingVertical: space.md,
    paddingHorizontal: space['2xl'],
    borderRadius: radius.md,
    minHeight: touch.minTarget,
    justifyContent: 'center',
    marginBottom: space.lg,
    ...elevation.action,
  },
  dbErrorRetryPressed: {
    backgroundColor: color.greenPressed,
  },
  dbErrorRetryText: {
    ...type.bodyStrong,
    color: color.onAction,
  },

  // The raw error, for whoever is debugging this rather than shopping.
  dbErrorDetail: {
    fontSize: 11,
    color: color.inkMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },

  // Cash missing from the till at the last cash-up. Red, and above everything
  // else on Home, because it is the only card that means something is wrong.
  shortfallCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.redSoft,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  shortfallLabel: {
    fontSize: 13,
    color: color.redInk,
    fontWeight: '600',
    marginBottom: 2,
  },
  shortfallAmount: {
    ...numeric,
    fontSize: 26,
    fontWeight: '700',
    color: color.redInk,
  },
  shortfallHint: {
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 4,
    textAlign: 'center',
  },

  // Net profit: sales, minus costs, equals what the owner actually kept.
  // Laid out as a sum so the arithmetic is visible rather than asserted.
  netCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: color.border,
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
    color: color.inkMuted,
  },
  netRowValue: {
    fontSize: 15,
    color: color.ink,
    fontWeight: '500',
  },
  netRowCost: {
    fontSize: 15,
    color: color.redInk,
    fontWeight: '500',
  },
  netDivider: {
    height: 1,
    backgroundColor: color.surfaceSunken,
    marginVertical: 8,
  },
  netKeptLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
  netKeptValue: {
    fontSize: 22,
    fontWeight: '700',
    color: color.greenInk,
  },
  netKeptLoss: {
    color: color.redInk,
  },
  netNoExpenses: {
    marginHorizontal: 16,
    marginTop: 12,
    fontSize: 12,
    color: color.inkMuted,
    fontStyle: 'italic',
    lineHeight: 17,
  },

  // The owner's own sales book. Green, because it is money they kept — but
  // quieter than the profit card above it, which is the app's own answer.
  salesCard: {
    marginHorizontal: space.base,
    marginTop: space.md,
    backgroundColor: color.greenSoft,
    borderWidth: 1,
    borderColor: color.greenBorder,
    padding: space.base,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  salesCardPressed: {
    backgroundColor: color.surfaceSunken,
  },
  salesCardLabel: {
    ...type.caption,
    color: color.inkSecondary,
    marginBottom: space.xs,
  },
  salesCardAmount: {
    ...type.amount,
    ...numeric,
    color: color.greenInk,
  },
  salesCardHint: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },

  // Credit book: money owed to the shop. Orange, because it is money the
  // owner has earned but does not have.
  creditCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.amberSoft,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  creditCardLabel: {
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: 4,
  },
  creditCardAmount: {
    ...numeric,
    fontSize: 26,
    fontWeight: '700',
    color: color.amberInk,
  },
  creditCardHint: {
    fontSize: 12,
    color: color.inkMuted,
    marginTop: 4,
  },
  profitOwedNote: {
    fontSize: 12,
    color: color.amberInk,
    marginTop: 8,
    textAlign: 'center',
  },

  stockValueCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.surfaceSunken,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  stockValueLabel: {
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: 4,
  },
  stockValueAmount: {
    ...numeric,
    fontSize: 22,
    fontWeight: '600',
    color: color.inkSecondary,
  },
  stockValueHint: {
    fontSize: 11,
    color: color.inkMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },
  stockValueMissing: {
    fontSize: 11,
    color: color.inkMuted,
    marginTop: 4,
    fontStyle: 'italic',
  },

  // Tier 4.1: Restock Priority
  restockPriorityCard: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: color.surface,
    padding: 16,
    borderRadius: 12,
  },
  restockPriorityTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: color.inkSecondary,
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
    color: color.inkMuted,
    width: 20,
  },
  restockPriorityName: {
    fontSize: 14,
    fontWeight: '500',
    color: color.ink,
  },
  restockPriorityReason: {
    fontSize: 13,
    color: color.inkMuted,
    marginLeft: 4,
  },
  restockPriorityHint: {
    fontSize: 11,
    color: color.inkMuted,
    marginTop: 10,
    fontStyle: 'italic',
  },

  // Actions
  actionsContainer: {
    padding: 16,
    gap: 12,
  },
  // Counting stock is the one thing the whole product depends on, so it is the
  // only solid, elevated, full-width control on the page. Everything else is a
  // quiet card. Hierarchy does the teaching here, not copy.
  primaryAction: {
    backgroundColor: color.green,
    padding: space.xl,
    borderRadius: radius.lg,
    alignItems: 'center',
    minHeight: control.heroButton,
    ...elevation.action,
  },
  primaryActionPressed: {
    backgroundColor: color.greenPressed,
  },
  primaryActionIcon: {
    fontSize: icon.lg,
    marginBottom: space.sm,
  },
  primaryActionText: {
    ...type.h2,
    color: color.onAction,
  },
  primaryActionSubtext: {
    ...type.label,
    color: color.onAction,
    opacity: 0.92,
    marginTop: space.xs,
  },
  // Two columns keep long translated labels and 200% text usable. The primary
  // Count action stays full width above them, so the hierarchy remains clear.
  secondaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  secondaryAction: {
    flexGrow: 1,
    flexBasis: '44%',
    // Comfortably past the 44pt minimum touch target, one-handed.
    minWidth: 128,
    minHeight: 112,
    backgroundColor: color.surface,
    paddingVertical: space.base,
    paddingHorizontal: space.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.card,
  },
  secondaryActionPressed: {
    backgroundColor: color.surfaceSunken,
  },
  secondaryActionIcon: {
    fontSize: icon.md,
    marginBottom: space.sm,
  },
  secondaryActionText: {
    ...type.bodyStrong,
    color: color.ink,
    textAlign: 'center',
  },
  secondaryActionHint: {
    ...type.caption,
    color: color.inkMuted,
    marginTop: space.xs,
    textAlign: 'center',
  },

  // How it works card
  howItWorksCard: {
    backgroundColor: color.surface,
    margin: 16,
    padding: 20,
    borderRadius: 16,
    borderLeftWidth: 4,
    borderLeftColor: color.green,
  },
  howItWorksTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: color.ink,
    marginBottom: 16,
  },
  howItWorksStep: {
    fontSize: 15,
    color: color.ink,
    marginBottom: 8,
    lineHeight: 22,
  },
  stepNumber: {
    fontWeight: '700',
    color: color.greenInk,
  },
  howItWorksNote: {
    fontSize: 13,
    color: color.inkSecondary,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: color.border,
    fontStyle: 'italic',
  },

  // Profit explainer
  profitExplainer: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 8,
    textAlign: 'center',
  },
  countReminderCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    backgroundColor: color.greenSoft,
    borderWidth: 1,
    borderColor: color.greenBorder,
  },
  countReminderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: color.greenInk,
  },
  countReminderHint: {
    fontSize: 13,
    lineHeight: 19,
    color: color.greenInk,
    marginTop: 4,
  },
  homeUndoButton: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    marginTop: 4,
  },
  homeUndoText: {
    color: color.redInk,
    fontSize: 14,
    fontWeight: '600',
  },

  // Empty state
  emptyPrompt: {
    padding: 24,
    alignItems: 'center',
    backgroundColor: color.surface,
    margin: 16,
    borderRadius: 16,
  },
  emptyPromptTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 12,
  },
  emptyPromptText: {
    fontSize: 16,
    color: color.inkSecondary,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyPromptHow: {
    fontSize: 14,
    color: color.inkMuted,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 20,
  },
  emptyPromptButton: {
    backgroundColor: color.green,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 10,
  },
  emptyPromptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: color.onAction,
  },

  // Screen header
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    paddingTop: 60,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  screenTitle: {
    ...type.title,
    flexShrink: 1,
    color: color.ink,
  },
  backButton: {
    ...type.body,
    color: color.greenInk,
  },
  addButton: {
    ...type.bodyStrong,
    color: color.greenInk,
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
    color: color.inkMuted,
    marginBottom: 16,
  },
  emptyStateButton: {
    backgroundColor: color.green,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: color.onAction,
  },

  // Product list
  productList: {
    flex: 1,
  },
  productItem: {
    backgroundColor: color.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  productItemContent: {
    flex: 1,
    minWidth: 0,
  },
  productThumbnail: {
    width: 52,
    height: 52,
    borderRadius: 8,
    marginRight: 12,
    backgroundColor: color.surfaceSunken,
    flexShrink: 0,
  },
  productEditHint: {
    fontSize: 20,
    color: color.inkMuted,
    marginLeft: 12,
  },
  productSelectItem: {
    backgroundColor: color.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  productName: {
    fontSize: 17,
    fontWeight: '500',
    color: color.ink,
    marginBottom: 4,
  },
  productMeta: {
    fontSize: 14,
    color: color.inkMuted,
  },

  // Form
  formContainer: {
    padding: 20,
  },
  inputLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: color.ink,
    marginBottom: 8,
    marginTop: 16,
  },
  inputHint: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 4,
  },
  textInput: {
    backgroundColor: color.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border,
    padding: space.base,
    minHeight: control.input,
    ...type.body,
    color: color.ink,
  },
  priceInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: color.border,
    paddingHorizontal: space.base,
    minHeight: control.input,
  },
  currencyPrefix: {
    fontSize: 20,
    color: color.inkSecondary,
    marginRight: 4,
  },
  priceInput: {
    flex: 1,
    padding: 16,
    fontSize: 20,
    color: color.ink,
  },
  quantityInput: {
    flex: 1,
    padding: 16,
    fontSize: 24,
    fontWeight: '600',
    color: color.ink,
  },
  unitSuffix: {
    fontSize: 16,
    color: color.inkSecondary,
    marginRight: 16,
  },
  costSummary: {
    fontSize: 16,
    color: color.greenInk,
    marginTop: 8,
    fontWeight: '500',
  },
  saveButton: {
    backgroundColor: color.green,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 32,
    minHeight: control.button,
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    backgroundColor: color.borderStrong,
  },
  saveButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: color.onAction,
  },
  
  // Search
  searchContainer: {
    backgroundColor: color.surface,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    backgroundColor: color.surfaceSunken,
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    color: color.ink,
  },
  searchClear: {
    position: 'absolute',
    right: 28,
    padding: 4,
  },
  searchClearText: {
    fontSize: 16,
    color: color.inkMuted,
  },
  readyCard: {
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 14,
    backgroundColor: color.greenSoft,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  readyCardText: {
    flex: 1,
  },
  readyCardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: color.greenInk,
  },
  readyCardHint: {
    fontSize: 12,
    lineHeight: 17,
    color: color.greenInk,
    marginTop: 3,
  },
  readyCardButton: {
    backgroundColor: color.greenPressed,
    borderRadius: 9,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  readyCardButtonText: {
    color: color.onAction,
    fontSize: 13,
    fontWeight: '700',
  },
  noSearchResults: {
    textAlign: 'center',
    color: color.inkMuted,
    fontSize: 15,
    padding: 32,
  },
  
  // Edit product
  editProductInfo: {
    backgroundColor: color.surfaceSunken,
    padding: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  editProductInfoText: {
    fontSize: 16,
    fontWeight: '500',
    color: color.ink,
  },
  editProductInfoHint: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 4,
  },
  deleteButton: {
    backgroundColor: color.surface,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 16,
    borderWidth: 1,
    borderColor: color.redBorder,
  },
  deleteButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: color.redInk,
  },

  // Reusable private photo field
  photoField: {
    marginTop: 8,
  },
  photoFieldPreview: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: color.surfaceSunken,
    borderWidth: 1,
    borderColor: color.border,
  },
  photoFieldActionLabel: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '600',
    color: color.inkSecondary,
    marginTop: 10,
    marginBottom: 8,
  },
  photoFieldActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  photoFieldButton: {
    minHeight: 48,
    minWidth: 132,
    flexGrow: 1,
    flexBasis: '46%',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: color.green,
    backgroundColor: color.surface,
    paddingHorizontal: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoFieldButtonText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: color.greenInk,
    textAlign: 'center',
  },
  photoFieldRemove: {
    minHeight: 44,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  photoFieldRemoveText: {
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: color.redInk,
  },
  photoFieldHint: {
    fontSize: 13,
    lineHeight: 18,
    color: color.inkMuted,
    marginTop: 4,
  },

  // Count screen
  countInstructions: {
    backgroundColor: color.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  countInstructionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: color.ink,
    textAlign: 'center',
  },
  countInstructionsHint: {
    fontSize: 14,
    color: color.inkSecondary,
    textAlign: 'center',
    marginTop: 4,
  },
  countProgress: {
    padding: 12,
    textAlign: 'center',
    fontSize: 14,
    color: color.inkSecondary,
    backgroundColor: color.surfaceSunken,
  },
  countList: {
    flex: 1,
  },
  countItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: color.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  countItemInfo: {
    flex: 1,
    minWidth: 0,
  },
  countProductThumbnail: {
    width: 44,
    height: 44,
    borderRadius: 8,
    marginRight: 10,
    backgroundColor: color.surfaceSunken,
    flexShrink: 0,
  },
  countItemName: {
    fontSize: 17,
    fontWeight: '500',
    color: color.ink,
  },
  countItemPrev: {
    fontSize: 14,
    color: color.inkMuted,
    marginTop: 2,
  },
  countInput: {
    backgroundColor: color.surfaceSunken,
    borderRadius: 8,
    padding: 12,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    width: 70,
    color: color.ink,
  },
  countBottomBar: {
    padding: 16,
    backgroundColor: color.surface,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  saveCountButton: {
    backgroundColor: color.green,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },

  // Results screen
  resultsContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: space['2xl'],
  },
  resultsIcon: {
    fontSize: icon.xl,
    marginBottom: space.base,
  },
  resultsTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 8,
  },
  resultsSubtitle: {
    fontSize: 16,
    color: color.inkSecondary,
    textAlign: 'center',
    marginBottom: 24,
  },
  nextStepBox: {
    backgroundColor: color.infoSoft,
    padding: 20,
    borderRadius: 12,
    marginBottom: 32,
  },
  nextStepText: {
    fontSize: 16,
    color: color.infoInk,
    textAlign: 'center',
    lineHeight: 24,
  },
  profitResultCard: {
    backgroundColor: color.green,
    paddingVertical: 32,
    paddingHorizontal: 48,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 32,
  },
  profitResultLabel: {
    fontSize: 16,
    color: color.onAction,
    opacity: 0.9,
    marginBottom: 8,
  },
  profitResultValue: {
    ...numeric,
    fontSize: 48,
    fontWeight: '700',
    color: color.onAction,
  },
  resultConfidenceCount: {
    ...type.caption,
    color: color.onActionMuted,
    marginTop: space.sm,
  },
  resultConfidenceLevel: {
    ...type.caption,
    color: color.onActionMuted,
    fontStyle: 'italic',
    marginTop: 2,
  },
  profitExplainerText: {
    fontSize: 15,
    color: color.inkSecondary,
    textAlign: 'center',
    marginBottom: 16,
  },
  unusualChangeText: {
    fontSize: 14,
    color: color.inkMuted,
    textAlign: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  missingDataHintSmall: {
    fontSize: 13,
    color: color.inkMuted,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 24,
  },
  
  // Restock notice (when stock went up)
  restockNotice: {
    backgroundColor: color.amberSoft,
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
    color: color.amberInk,
    marginBottom: 8,
  },
  restockText: {
    fontSize: 15,
    color: color.inkSecondary,
    textAlign: 'center',
    marginBottom: 12,
  },
  restockHint: {
    fontSize: 13,
    color: color.inkMuted,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // No change notice
  noChangeNotice: {
    backgroundColor: color.surfaceSunken,
    padding: 24,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 24,
  },
  noChangeText: {
    fontSize: 16,
    color: color.inkSecondary,
    marginBottom: 8,
  },
  noChangeHint: {
    fontSize: 14,
    color: color.inkMuted,
  },
  
  doneButton: {
    backgroundColor: color.ink,
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  doneButtonText: {
    fontSize: 17,
    fontWeight: '600',
    color: color.onAction,
  },
  undoButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    marginTop: 10,
  },
  undoButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: color.redInk,
  },
  reviewHint: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    color: color.inkSecondary,
    fontSize: 14,
    lineHeight: 20,
  },
  reviewItem: {
    backgroundColor: color.surface,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: color.border,
  },
  reviewItemName: {
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
  },
  reviewItemValue: {
    fontSize: 15,
    color: color.inkSecondary,
    marginTop: 5,
  },
  reviewWarning: {
    fontSize: 13,
    color: color.redInk,
    marginTop: 7,
  },

  // Stock-in
  sectionTitle: {
    fontSize: 16,
    color: color.inkSecondary,
    padding: 16,
    paddingBottom: 8,
  },
  selectedProductBanner: {
    backgroundColor: color.greenSoft,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  selectedProductName: {
    fontSize: 18,
    fontWeight: '600',
    color: color.ink,
  },
  selectedProductMeta: {
    fontSize: 14,
    color: color.inkSecondary,
    marginTop: 4,
  },
  costModeRow: {
    flexDirection: 'row',
    backgroundColor: color.surfaceSunken,
    borderRadius: 10,
    padding: 3,
    marginBottom: 18,
  },
  costModeButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  costModeButtonActive: {
    backgroundColor: color.surface,
  },
  costModeText: {
    color: color.inkSecondary,
    fontSize: 14,
    fontWeight: '600',
  },
  costModeTextActive: {
    color: color.greenInk,
  },

  // Tier 4.3: Silent Loss Detector
  lossCard: {
    backgroundColor: color.surfaceSunken,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  lossTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: color.inkSecondary,
    marginBottom: 10,
  },
  lossItem: {
    fontSize: 14,
    color: color.inkMuted,
    marginBottom: 4,
  },
  lossHint: {
    fontSize: 11,
    color: color.inkMuted,
    fontStyle: 'italic',
    marginTop: 8,
  },

  // Activity Screen
  topSellersCard: {
    backgroundColor: color.amberSoft,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: color.amberBorder,
  },
  topSellersTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: color.amberInk,
    marginBottom: 4,
  },
  topSellersSubtitle: {
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: 12,
  },
  topSellerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: color.amberBorder,
  },
  topSellerRank: {
    fontSize: 15,
    fontWeight: '600',
    color: color.amberInk,
    width: 24,
  },
  topSellerName: {
    fontSize: 15,
    color: color.ink,
    flex: 1,
  },
  topSellerProfit: {
    fontSize: 15,
    fontWeight: '600',
    color: color.greenInk,
  },
  activitySectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: color.inkSecondary,
    marginBottom: 12,
    marginTop: 8,
  },
  activityContent: {
    padding: 16,
  },
  activityCard: {
    backgroundColor: color.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: color.border,
  },
  activityProductName: {
    fontSize: 17,
    fontWeight: '600',
    color: color.ink,
    marginBottom: 12,
  },
  activityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  activityLabel: {
    fontSize: 15,
    color: color.inkSecondary,
  },
  activityValue: {
    fontSize: 15,
    fontWeight: '500',
    color: color.ink,
  },
  activityValueGreen: {
    fontSize: 15,
    fontWeight: '600',
    color: color.greenInk,
  },
  activityHistory: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  activityHistoryTitle: {
    fontSize: 13,
    color: color.inkMuted,
    marginBottom: 8,
  },
  activityHistoryItem: {
    fontSize: 14,
    color: color.inkSecondary,
    paddingVertical: 2,
  },
  activityNoData: {
    fontSize: 16,
    color: color.inkMuted,
    textAlign: 'center',
    paddingVertical: 32,
  },

  // Activity Button (Home) - replaced by insight buttons
  activityButton: {
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  activityButtonIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  activityButtonText: {
    fontSize: 16,
    fontWeight: '500',
    color: color.ink,
  },

  // Insight Buttons (Home)
  insightButtons: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  insightButton: {
    flex: 1,
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border,
  },
  insightButtonIcon: {
    fontSize: 20,
    marginBottom: 4,
  },
  insightButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: color.ink,
    textAlign: 'center',
  },

  // Low Stock Warning (Home)
  lowStockWarning: {
    backgroundColor: color.amberSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: color.amberBorder,
  },
  lowStockTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: color.amberInk,
    marginBottom: 8,
  },
  lowStockItem: {
    fontSize: 14,
    color: color.redInk,
    paddingVertical: 2,
  },

  // Weekly Summary Screen
  weeklyContent: {
    padding: 24,
    paddingBottom: 40,
  },
  weeklyScroll: {
    flex: 1,
  },
  weeklyHeading: {
    fontSize: 28,
    fontWeight: '700',
    color: color.ink,
    marginBottom: 24,
  },
  weeklyCard: {
    backgroundColor: color.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: color.border,
  },
  weeklyLabel: {
    fontSize: 16,
    color: color.inkSecondary,
    marginBottom: 4,
  },
  weeklyProfit: {
    ...numeric,
    fontSize: 32,
    fontWeight: '700',
    color: color.greenInk,
  },
  confidenceCount: {
    fontSize: 13,
    color: color.inkMuted,
    marginTop: 8,
  },
  confidenceLevel: {
    fontSize: 12,
    color: color.inkSecondary,
    fontStyle: 'italic',
    marginTop: 2,
  },
  missingDataHint: {
    fontSize: 14,
    color: color.inkSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  
  // Tier 4.2: Slow Stock (Money Tied Up)
  slowStockCard: {
    backgroundColor: color.amberSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  slowStockTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: color.amberInk,
    marginBottom: 4,
  },
  slowStockValue: {
    fontSize: 22,
    fontWeight: '600',
    color: color.amberInk,
    marginBottom: 12,
  },
  slowStockList: {
    marginBottom: 8,
  },
  slowStockItem: {
    fontSize: 14,
    color: color.amberInk,
    marginBottom: 4,
  },
  slowStockHint: {
    fontSize: 11,
    color: color.inkMuted,
    fontStyle: 'italic',
  },
  
  // Tier 4.4: Owner Memory
  ownerMemoryCard: {
    backgroundColor: color.surfaceSunken,
    borderRadius: 12,
    padding: 16,
    marginTop: 12,
  },
  ownerMemoryTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: color.inkSecondary,
    marginBottom: 8,
  },
  ownerMemoryItem: {
    fontSize: 14,
    color: color.inkSecondary,
    marginBottom: 4,
  },
  
  weeklyTopProduct: {
    fontSize: 22,
    fontWeight: '600',
    color: color.ink,
  },
  weeklyComparison: {
    fontSize: 22,
    fontWeight: '600',
  },
  weeklyComparisonUp: {
    color: color.greenInk,
  },
  weeklyComparisonDown: {
    color: color.redInk,
  },
  weeklyHintCard: {
    backgroundColor: color.infoSoft,
    borderRadius: 12,
    padding: 16,
    marginTop: 8,
  },
  weeklyHint: {
    fontSize: 15,
    color: color.infoInk,
    textAlign: 'center',
  },
  weeklyFirstWeek: {
    fontSize: 18,
    fontWeight: '500',
    color: color.ink,
    marginBottom: 8,
  },
  weeklyFirstWeekHint: {
    fontSize: 15,
    color: color.inkSecondary,
  },
  weeklyNoData: {
    fontSize: 18,
    fontWeight: '500',
    color: color.inkSecondary,
    marginBottom: 8,
  },
  weeklyNoDataHint: {
    fontSize: 15,
    color: color.inkMuted,
  },

  // Data Safety Section (Backup/Restore)
  dataSection: {
    marginTop: 32,
    paddingTop: 24,
    borderTopWidth: 1,
    borderTopColor: color.border,
  },
  dataSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: color.inkMuted,
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataButton: {
    backgroundColor: color.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: color.border,
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
    color: color.ink,
    marginBottom: 2,
  },
  dataButtonHint: {
    fontSize: 13,
    color: color.inkMuted,
  },

  // Language Toggle
  languageButton: {
    backgroundColor: color.surfaceSunken,
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
    color: color.inkSecondary,
    marginRight: 6,
  },
  languageButtonValue: {
    fontSize: 15,
    fontWeight: '600',
    color: color.ink,
  },
});
