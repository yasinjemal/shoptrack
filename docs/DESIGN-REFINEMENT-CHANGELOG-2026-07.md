# ShopTrack design refinement — implementation record

Date: 18 July 2026  
Outcome: the same local-first ShopTrack product, with its financial engines
unchanged, now has a coherent interaction system and clear recovery states for
the highest-risk pre-pilot workflows.

## Defect fixed: a genuine backup looked invalid after reinstall

The restore failure was caused by compatibility and Android document-provider
edges, not by the owner's identity. ShopTrack has no account and therefore does
not “recognise” a person after reinstall; the selected backup file is the
identity of the shop data.

Restore now:

- accepts the old schema-stamped export shapes produced by ShopTrack versions
  2, 3, 4, and 5;
- strips an invisible UTF-8 byte-order mark added by some file/download apps;
- allows Android/WhatsApp/Drive files whose MIME type is incorrectly reported
  as plain text or binary, then validates the contents itself;
- still rejects unknown formats and restores all tables in one transaction.

The regression suite exercises every accepted legacy stamp, BOM input, failure
for an unsupported legacy stamp, and a full SQL backup/restore round trip.

## Shared system changes

- The central theme now owns control heights, icon sizes, border/focus states,
  disabled opacity, a readable secondary colour on green, and tabular numerals.
- `ScreenHeader` gives every refactored screen flexible titles, 44+ point
  actions, explicit button roles, and consistent Back/Cancel/Add behaviour.
- `ChoiceChip` gives category, promise, and payment choices a visible check,
  strong selected border, and announced radio state.
- `KeyboardForm` keeps form content and the primary action reachable above a
  software keyboard on compact phones.
- `LoadingState` replaces blank intermediate screens with calm, named progress.
- A project lint gate is now configured and included in `release:check`.

## Screen-by-screen changes

### Home

- Count Stock remains the one dominant action.
- Secondary actions use a two-column compact-phone layout so translated labels
  do not clip or collapse into narrow cards.
- Money uses stable-width numerals, reduced-motion is respected, and every
  actionable card has a button identity and descriptive accessible name.

### Count Stock

- Entry fields are labelled for assistive technology and review/save/undo
  states announce their purpose and availability.
- Results can scroll at large text sizes.
- Confidence copy such as “Based on 2 counts” now reaches 4.52:1 contrast on
  the primary green instead of visually disappearing.

### Add Stock

- Quantity and cost-mode controls have explicit labels and selected states.
- The form is keyboard-safe and its disabled/busy Save state is announced.
- A successful write opens an in-app result with clear Done and Undo actions;
  completion no longer depends on an alert callback. Live verification wrote
  five units and then undid the write, returning Brown bread to 25 units.

### Expenses

- Selected categories have a check and announced radio state.
- Remove is visible on every entry instead of hidden behind long-press.
- Removal uses an inline alert with explicit Cancel/Remove actions and a busy
  state. The test expense was left unchanged during verification.
- Loading, empty, totals, cards, and form fields share the same semantic tokens.

### Sales Book and month history

- Month tiles distinguish completed, partial, empty-past, and future states
  using text/symbols as well as colour.
- Partial months show `days recorded / days in month`; empty past months show
  `0 / total`; future months are disabled and show an em dash.
- The grid is two columns at compact widths, and month/year controls and daily
  money inputs have explicit accessible names and states.

### Credit, products, cash-up, reports, settings, and owner gate

- Reused headers, loading states, keyboard-safe forms, labelled fields,
  selected choices, and semantic buttons were applied where relevant.
- Credit actions remain Read aloud, Gave credit, Got paid, and Remind; the
  financial meaning and existing flows were not changed.
- Settings continues to mark draft locales as “Native-speaker review pending.”

## Verification evidence

After screenshots are in `docs/design-audit/screenshots/`:

- `after-populated-home-320.png`
- `after-populated-home-actions-320.png`
- `after-count-result-320.png`
- `after-stock-in-result-320.png`
- `after-credit-320.png`
- `after-expense-form-320.png`
- `after-expense-remove-320.png`
- `after-month-picker-320.png`
- `after-settings-320.png`
- `after-home-om-320.png`
- `after-home-actions-om-320.png`

Automated and build validation:

- `npm run typecheck` — pass.
- `npm run lint` — pass, zero warnings.
- `npm run test:theme` — pass, including contrast, geometry, focus, disabled,
  motion, touch target, and numeral contracts.
- `npm run test:ui-flow` — pass, including result/undo, expense correction,
  month-state, header, reduced-motion, and accessibility contracts.
- Production Expo web export — pass.
- Full `npm run release:check` — pass; includes every unit/SQL test, typecheck,
  lint, Expo Doctor (18/18), and the high-severity dependency gate.

Live workflow validation:

- 320 × 640, 360 × 800, and 412 × 915 viewports all reported document width
  equal to viewport width (no horizontal overflow).
- English and long Afaan Oromoo Home/Settings labels remained navigable at
  320 px.
- Home, Credit, Expenses, Count, Stock-in, Sales month history, Settings, and
  owner unlock were exercised through their accessible roles.
- Browser reload and the tested flows produced no application errors.
- Temporary count and stock-in writes were undone; final test inventory is 25.

## External proof still required

These cannot be completed truthfully from this machine:

- the 14-day pilot and its real shop observations;
- a physical Android rehearsal for camera/document picker/share sheet,
  background relock, software keyboard, large-font rendering, install/upgrade,
  and end-to-end backup file selection;
- a Sentry account and production DSN;
- a real cloud-storage backend and its production credentials;
- native-speaker review of the draft translations (and Amharic font/rendering
  approval on the target low-cost Android phones).

The current Expo dependency tree reports 15 moderate advisories. The release
gate has no high-severity finding; the offered all-advisory fix requires a
breaking Expo major upgrade and was deliberately not applied during a
pre-pilot refinement.
