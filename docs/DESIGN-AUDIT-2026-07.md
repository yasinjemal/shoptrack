# ShopTrack design and usability audit

Date: 18 July 2026  
Scope: pre-pilot visual and interaction refinement, with the financial engines and local-first architecture held fixed.

## Product principles kept fixed

- One screen, one main action.
- Plain language, large touch targets, low-literacy-friendly flows, and one-handed Android use.
- Counted stock profit, the sales book, expenses, credit, and cash-up remain separate factual views. Their totals are never combined.
- The device database remains the source of truth. Backup, restore, sharing, owner lock, and staff attribution keep their current trust boundaries.
- No universal ledger, lending, scoring, AI, cloud account, or navigation rewrite is introduced by this work.

## What was inspected

The audit covered the full UI tree, shared styles and theme, all eight locale files, the app state router, database adapters, release scripts, and the roadmap/do-not-build documents. The running web build was then exercised at compact Android-equivalent widths (320 and 360 px) through these workflows:

1. Loading and first-use Home.
2. Add first product.
3. Product list and search.
4. Edit/delete product.
5. Stock count entry.
6. Count review.
7. Count result, share, and undo affordances.
8. Stock-in product selection.
9. Stock-in cost modes and save result.
10. Credit-book empty state.
11. Add a person and repayment promise.
12. Record a payment and payment method.
13. Expenses empty state.
14. Expense category, entry, history, and removal affordance.
15. First cash-up.
16. Regular cash-up, breakdown, result, and money-out field.
17. Sales-book empty state and today's sales entry.
18. Past-month picker and 31-day entry calendar.
19. Recent activity.
20. Weekly summary.
21. Business health report.
22. Settings, country/currency/language, and long Afaan Oromoo labels.
23. Owner-lock setup, locked Home, wrong PIN, and unlock.

Backup/restore was also checked at its UI entry points and through the real transactional database tests, including old schema-stamped files and UTF-8 BOM files. Native system pickers cannot be fully rehearsed in the web runner.

## What already works well

- The core Count Stock action is unmistakably dominant.
- Money semantics are learned once and reused: green in/positive, red out/missing, amber owed/tied up.
- Contrast tokens are unusually strong and already protected by WCAG tests.
- Count review and undo, cash-up breakdowns, explicit sales-book separation, and backup confirmation all support trust rather than magic.
- Empty states explain both the next action and why it matters.
- The 31-day sales entry keeps Save pinned and correctly distinguishes blank from a recorded zero.
- At 320 px the layout reflows without document-level horizontal overflow, including Afaan Oromoo.

## Critical findings

### 1. Most controls have no accessibility identity

In the live accessibility tree, almost every navigation card, header action, chip, and save control was exposed as `generic`; only the barcode and voice buttons consistently exposed a button role. A screen-reader user cannot reliably discover what is actionable, and selected/disabled states are usually not announced.

Action: add semantic roles, names, hints, and selected/disabled states to reusable headers, primary actions, choice chips, Home actions, and the highest-frequency forms. Add a source contract so this cannot silently regress.

### 2. Stock-in can remain at `Saving...` after a successful write

The database write completed, but completion depended on an `Alert.alert` button callback. In the web validation build that callback never fired, leaving a successful action looking stuck. A reload showed the stock had correctly changed from 15 to 25, making the frozen state especially damaging to trust.

Action: make success an in-app state with explicit Done and Undo actions. Alerts must not be the state machine.

### 3. Count-result confidence copy is unreadable

`Based on 1 count` and `Early estimate` visually disappear inside the green profit card even though the number itself is clear. This is precisely the copy that prevents an early estimate being mistaken for certainty.

Action: use a verified high-contrast on-action secondary tone and extend theme tests to cover it.

### 4. Expense removal is hidden behind long-press

Nothing on an expense row says it can be corrected. Long-press is undiscoverable, inaccessible from many assistive input methods, and easy to trigger accidentally. The confirmation also depends on a platform alert.

Action: add a visible Remove affordance and an inline two-step confirmation with Cancel/Remove.

## High-impact findings

### 5. Month history does not communicate completion

The picker shows only an amount for any month with data. Two of thirty days looks as complete as all thirty days, while past empty months show only an em dash and future months only fade. The owner cannot see where they stopped transcribing their paper book.

Action: make four explicit states: complete, partial with `x/y days`, empty past, and future. Keep colour as reinforcement, never the sole signal.

### 6. Form completion is not keyboard-safe enough

Important forms are plain `ScrollView`s with save actions at the bottom. On a small Android phone the software keyboard can obscure the last fields and Save, particularly product setup, expense entry, stock-in, and sales entry.

Action: introduce one keyboard-safe form shell, preserve tap-through keyboard behaviour, and use it first on the highest-frequency forms.

### 7. Choice controls do not clearly show selection

Expense categories, credit promises, payment methods, and some settings choices rely mainly on a light tint/border. The baseline expense form looked as if no category was selected even after a category tap.

Action: give selected choices a checkmark, strong border, sufficient minimum height, and `accessibilityState.selected`.

### 8. Blank loading and failure states can look broken

Credit, expenses, sales, and some owner/report paths render nothing while loading. Activity can log a load failure and then look empty. This is calm on a fast database but reads as a broken screen on a slow device.

Action: add a compact reusable loading state and a plain-language retry state where the operation can fail.

### 9. Large-text resilience is uneven

Header balancing often uses a fixed 50 px blank view, while result screens use fixed centred layouts rather than a scroll container. Long titles or Android large text can collide or clip even when English at default size looks correct.

Action: replace spacer-based headers with one flexible accessible header and make result screens scroll-safe.

## Consistency findings

- The token file is strong, but feature styles still hard-code many font sizes, spaces, radii, and component heights. The documentation promise and implementation have drifted apart.
- Header, loading, button, chip, card, and money-number patterns are repeated with small differences.
- Platform emoji are used as structural icons. They vary by Android vendor and are not consistently labelled. Keep them decorative unless a coherent bundled icon set is deliberately added later.
- Some number columns use proportional digits; money and ledger amounts should use tabular numerals.
- Loading indicators still use the retired `#4CAF50` literal in a few screens.
- Input placeholder tones are sometimes literal grey values rather than the verified muted token.
- Home's primary action hierarchy is good, but secondary action cards become dense at 360 px and need stronger responsive rules for long labels.

## Accessibility findings

- Touch target intent exists in the theme, but chips and header links do not consistently enforce it.
- Back, Add, Cancel, Save, month arrows, tiles, and destructive actions need roles and meaningful names.
- Selected, disabled, busy, and error states are rarely announced.
- Input labels are visually separate but not explicitly associated in native accessibility props.
- Focus styling is visible on the web product form, but it is not a documented, reusable semantic token.
- Home entrance animation does not currently respect reduced-motion preference.
- Information conveyed by red/amber/green generally has accompanying text, which should be preserved.

## Deferred or intentionally not built

- A bottom-tab or navigation architecture rewrite.
- Combining profit engines or creating a universal money ledger.
- New cloud storage, accounts, Sentry account configuration, lending/scoring, AI, or remote analytics.
- Replacing every emoji with a new icon dependency during pre-pilot refinement; structural icons will instead be marked decorative and labelled at the control level.
- Dark mode; the application explicitly supports light mode only today.
- Native-speaker approval of draft translations.
- A real-device large-font/keyboard/camera/document-picker rehearsal. The code can be made resilient here, but the physical-device proof remains an external pilot task.

## Implementation order

1. Extend and test tokens for semantic surfaces, component geometry, focus, icons, and tabular money.
2. Add reusable accessible header, action/choice, loading, and keyboard-safe form primitives only where they remove repeated inconsistency.
3. Fix stock-in success, count-result contrast, expense selection/removal, and month completion states.
4. Apply semantics and responsive behaviour to Home and the core daily flows.
5. Validate typecheck, release tests, production web export, 320/360/412 px layouts, long translations, and zoomed/large-text approximations.

## Baseline evidence

Screenshots are in `docs/design-audit/screenshots/`:

- `before-first-use-360.png`
- `before-add-product-360.png`
- `before-count-result-360.png`
- `before-populated-home-320.png`
- `before-populated-home-actions-360.png`
- `before-stock-in-360.png`
- `before-credit-360.png`
- `before-expense-form-360.png`
- `before-cash-up-result-360.png`
- `before-month-picker-360.png`
- `before-month-entry-360.png`
- `before-weekly-360.png`
- `before-settings-360.png`
- `before-home-om-320.png`
- `before-home-actions-om-320.png`

## Refinement outcome

All critical and high-impact items above were implemented. The exact
screen-by-screen changes, after screenshots, and verification results are in
[`DESIGN-REFINEMENT-CHANGELOG-2026-07.md`](DESIGN-REFINEMENT-CHANGELOG-2026-07.md).
