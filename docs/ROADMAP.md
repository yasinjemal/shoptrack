# ShopTrack Roadmap — From One Pilot to Millions of Shops

*Written July 2026, after a market research pass. This is the working plan for
turning ShopTrack into the daily business-management app for small shop owners
across Africa first, and then anywhere small shops run on paper and memory.*

**The strategy in one line:** win daily trust with the counting loop and
unlosable data; ride WhatsApp and mobile-money *recording* as the market
features; never cap, paywall, or endanger anything an owner already has.

---

## Status — July 2026 build-out

The current verified baseline includes settings-backed currency
(ZAR/KES/NGN/ETB), country packs, schema v11 with additive migrations, backup
format v7 covering all ten database collections plus embedded managed media,
daily seven-file local rotation, local crash evidence, WhatsApp message
builders, read-aloud and voice
number entry, local barcode finding, business-health reporting, activation and
partner attribution, a permanent-free entitlement policy, Ethiopian calendar
support, an encrypted cloud-backup client, and privacy-scrubbed Sentry wiring.

That is **not** the end of the code roadmap. [PHASE-TRACKER.md](PHASE-TRACKER.md)
is the authoritative dependency-ordered implementation list. Phase A's
explicit language drafts are now built and protected by an anti-scaffold gate;
native approval remains external. Phase B's product/customer/receipt photo
flows and cache-first Open Food Facts editable prefill are code-complete and
test-backed; their camera/gallery, file-provider, second-device restore, and
live-network acceptance remains a real-Android gate. The code-achievable C
foundations are also built: tested HTTP object-store contract, device-local
opt-in encrypted outbox/retry, Plus-gated read-only viewer, optional identity
and blob-locator contracts, and a pinned permanent-free entitlement policy.
D1 restore preview/safety/Undo and D2 sales statistics are built. Their real
backend, account, billing and physical-device acceptance gates remain open.

Photo privacy is deliberate: private daily snapshots and encrypted envelopes
can contain all photos, but a plaintext backup shared through another app omits
customer/ID photos. Android OS app-data backup is disabled, so uninstalling
also removes ShopTrack's private snapshots unless an explicit backup was copied
outside the app first.

**What remains genuinely external or decision-gated:**

1. **Run the pilot** (docs/PILOT-TRACKER.md): 3–5 shops, 14 days — nothing
   else on this page matters until 2+ shops keep counting.
2. **Real-Android rehearsal** (BEFORE-PILOT Tripwire 3): migration + backup +
   photo capture/gallery + Open Food Facts online/offline + second-install
   restore on physical phones, then tag and cut `pilot-1.0`.
3. **Tap-through on a phone**: engines are tested, screens are not rendered in
   CI; "done = tapped through" still stands for every new screen.
4. **Sentry account**: set `EXPO_PUBLIC_SENTRY_DSN` (and org/project in
   app config) to activate remote crash reporting.
5. **Cloud-backup bucket**: stand up authenticated object storage and pass its
   URL to `HttpCloudBackupStore`; the manual client, opt-in retry outbox and
   read-only viewer exist, but the live service and credentials do not.
6. **Backend/revenue decisions**: choose Supabase/Firebase, recovery-key escrow,
   Plus price/billing, Google OAuth client and authenticated account-to-blob
   mapping. Provider-neutral code fails closed until these are real.
7. **Native-speaker review** of the xh / st / af / sw / am / om string files.
   Drafting is code work; approval is not.
8. **EAS builds + release train** (docs/RELEASE-TRAIN.md) and, post-pilot,
   distribution-partner conversations (Flash, Kazang, telco agent networks).

---

## What the research says

The graveyard of apps that tried this is instructive. The winners' pattern is
equally clear. Five findings drive every phase below.

### 1. Pure digital ledgers hit a retention wall

India ran this experiment at enormous scale. Khatabook and OkCredit signed up
tens of millions of merchants; both then fought brutal churn. The documented
churn drivers: capping transactions per day, and putting formerly-free features
behind a paywall ([The Ken](https://the-ken.com/story/why-khatabook-okcredits-kiranatech-failed-to-fly-off-the-shelves/),
[UserExperior interview with Khatabook PM](https://www.userexperior.com/blog/user-retention-lessons-from-khatabook)).
What measurably worked for Khatabook: **one action per screen** (their "deer in
the headlights" finding — ShopTrack already does this by design), visual cues
for first-time users, and payment reminders sent to customers. Both companies
built online storefronts for their merchants; both shut them down.

Khatabook's activation metric is worth stealing: *a user who records
transactions on two or more separate days*. That is the line between an install
and a habit.

### 2. Payments processing is a capital trap, not a business model

Nigeria's Kippa raised $14M+ as a bookkeeping app, pivoted into agency banking
(KippaPay), and shut it down in 2023: naira devaluation made POS terminals
unaffordable, and when they raised their transfer fee from ₦25 to ₦35 the
users revolted ([TechCabal](https://techcabal.com/2023/10/19/why-kippa-left-agency-banking/)).
By 2025 the company had unraveled entirely
([Launch Base Africa](https://launchbaseafrica.com/2025/08/18/founders-exit-website-down-the-unraveling-of-target-global-backed-kippa-that-raised-over-14m/)).
The lesson: this market is *extremely* price-sensitive, and moving money is a
low-margin, high-capital game owned by telcos and banks. The durable asset is
software the owner trusts with their numbers.

### 3. Mobile money is the rail — record it, never process it

M-Pesa runs in 7 countries with 51M+ users; MTN MoMo in 16. MoMo Pay for
informal merchants launched in South Africa in June 2025 at a 0.5% fee
([Engineering News](https://www.engineeringnews.co.za/article/mtn-launches-momo-pay-for-informal-merchants-2025-06-06)).
Today only ~1% of SA informal retailers accept electronic payments and 56%
are unbanked ([BFA Global](https://bfaglobal.com/our-work/digital-spazas-digitizing-and-connecting-informal-spaza-shops-in-south-africas-townships/))
— which means the digital-payments wave is only starting, and the books need a
place to record it before it arrives. In Kenya, POS apps compete on *free*
M-Pesa integration ([JamPOS](https://jampos.app/blog/free-mpesa-integration-pos-kenya)).
ShopTrack's job is to answer "how much of today's money is in the till and how
much is in the phone?" — never to touch the money itself.

### 4. WhatsApp is the universal channel

95–97% adoption among connected users in South Africa, Kenya, and Nigeria;
message open rates above 90% ([Infobip](https://www.infobip.com/blog/whatsapp-statistics)).
ShopTrack backups already travel over WhatsApp. Credit reminders, receipts, and
reorder sheets should too — as share-sheet messages the owner sends with their
own thumb. No API, no server, no cost, and consent is inherent in the tap.

### 5. A 50-year-old first-time smartphone user is a design constraint, not an afterthought

The low-literacy/novice-user HCI literature
([Medhi & Thies 2015](https://courses.cs.washington.edu/courses/cse490c/18au/readings/medhi-thies-2015.pdf))
and the age-friendly design reviews
([Springer 2025](https://link.springer.com/article/10.1007/s40520-025-03157-7))
converge on: minimal hierarchy, one action per screen, avoid free-text input,
large targets, local language, and voice/read-aloud support. Voice *output* is
cheap and works offline; voice *input* is a heavy lift and comes later.
ShopTrack's existing design (numbers-only input, one question per screen,
isiZulu, WCAG-checked contrast for sunlight) already matches most of this —
the roadmap deepens it rather than discovering it.

---

## Phase 0 — Ship the pilot (now)

Nothing below matters until 3–5 real shops answer the only question that
counts: *do they keep using it after 14 days?* The bar is already set in
[PILOT-TRACKER.md](PILOT-TRACKER.md): at least 2 shops still counting.

1. ~~**Fix the backup gap.**~~ **Done, July 2026** — the sales book was missing
   from the original backup (see the fired tripwire in
   [BEFORE-PILOT.md](BEFORE-PILOT.md)). The format has since advanced to v7 and
   covers all ten database collections, including settings and staff, plus the
   exact managed-media set referenced by the shop.
2. **Commit the sales-calendar work in progress** so the pilot build comes from
   a tagged, clean commit.
3. **Minimal crash visibility, zero network:** a global error handler that
   saves the last crash (message, stack, build version) locally and includes it
   in the backup JSON. With shops you visit in person, that closes the "they
   will never email you a stack trace" hole. Real crash reporting comes in
   Phase 1.
4. **Run the pending real-Android rehearsal** (Tripwire 3): install-over-
   upgrade plus backup/restore on a real phone.
5. **Tag the build, cut a `pilot-1.0` branch, start the pilot.**

**The feature freeze governs pilot phones, not the trunk.** During the 14 days,
`main` continues with Phase 1 foundations — all behavior-preserving, all pinned
by the existing test suite. No main build touches a pilot phone before Day 15.

---

## Phase 1 — Foundations (during and just after the pilot, ~6 weeks)

Everything later — every language, every currency, every country — flows
through this work. It is deliberately scheduled while the freeze forbids
shipping features anyway.

1. **Move the strings out of `App.tsx`.** The ~350-key `STRINGS` dictionary
   becomes `src/i18n/en.ts` and `src/i18n/zu.ts` with `type Strings = typeof en`,
   so a missing translation is a *compile error*. Keep the function-valued
   strings; do **not** add i18next — the hand-rolled approach is simpler and
   already works.
2. **Engines return data, not English sentences.** This is the load-bearing
   refactor. `calculations.ts`, `credit.ts`, `cashup.ts`, `expenses.ts`, and
   `sales.ts` currently bake "R" and English into their statement strings.
   Each statement becomes structured data (`{ kind, amounts... }`) rendered by
   the UI through the strings files. This single change unblocks translation,
   currency, read-aloud, and WhatsApp messages simultaneously — skipping it
   means re-touching five engines per language per currency forever.
3. **Currency becomes a setting.** `src/core/currency.ts` with
   `{ code, symbol, decimals, locale }` and one `formatMoney()`. Stored in a
   new `settings` table (schema v7 — and per the new checklist, backup format
   v3 in the same change) so it travels inside backups. Default ZAR; no picker
   UI yet.
4. **Decompose `App.tsx`** (3,400+ lines → under ~400): extract home, products,
   count, stock-in, activity, and weekly into `src/ui/<feature>/` exactly like
   credit/expenses/cashup/sales already are. **Keep the hand-rolled screen
   state machine** — twelve screens, no params, one action per screen is a
   feature, not debt. This is the precondition for any second contributor.
5. **Auto-backup.** Daily snapshot of the backup JSON to the app's documents
   directory (rotate the last 7), plus a home-screen nudge when the last
   *shared* backup is more than 7 days old — one tap to WhatsApp. Zero network,
   zero accounts. A lost phone should cost a shop at most a day, not a history.
6. **Real crash reporting** (Sentry via the Expo plugin). Offline-buffered,
   flushes when connectivity happens to exist; scrub everything — no product
   names, customer names, or amounts ever leave the phone.

---

## Phase 2 — Daily-habit features (post-pilot, South Africa)

The retention research is blunt: ledger apps die when they stop being daily
useful. Everything here makes tomorrow's open more likely. **Reorder this list
by what the pilot shops actually did before building any of it.**

1. **WhatsApp credit reminders and receipts** — the single highest-leverage
   feature in the roadmap. A pure message-builder module ("Sipho owes R240,
   last payment 12 days ago") plus a share link from the credit book. The
   credit engine already computes balances and staleness; this is a
   render-and-share layer. Khatabook's most-loved feature, at near-zero cost.
   Also: shareable count summaries and cash-up results — the "brag or ask for
   help" moments.
2. **Mobile-money recording.** A `payment_method` on credit payments and a
   `digital_takings` split on cash-ups, so the till reconciles "cash in the
   drawer" and "money in the phone" separately. Strictly recording — **no
   processing, no wallet, no fees, ever.**
3. **Read-aloud statements** (expo-speech, works offline with downloaded
   voices). The engines' sentence-shaped outputs were built for ears; this is
   the cheap 80% of the low-literacy voice win.
4. **First-run visual cues** for the first count, and a **local activation
   metric** (entries on 2+ unique days) stored in backups — the pilot-analysis
   instrument, with no telemetry.
5. **Custom expense categories**, only if pilot feedback demands it (schema +
   backup bump). The no-STOCK-category invariant is non-negotiable.

---

## Phase 3 — Trust at distance, multi-country readiness

1. **Optional encrypted cloud safety net — not sync, not accounts.** The
   existing backup JSON, encrypted on the phone with a key derived from a
   recovery phrase the owner writes on paper, pushed as an opaque blob to dumb
   object storage keyed by a random ID. The server can never read a shop's
   books. Restore = enter phrase, pull blob, run the already-battle-tested
   restore path. Network code lives in a new `src/net/`; `src/core/` keeps its
   no-network purity. The app never requires it and never blocks on it.
2. **Language expansion.** Each language is one typed file that fails the build
   until complete, plus native-speaker review: isiXhosa, Sesotho, Afrikaans,
   then **Swahili** (for Kenya). The en/zu toggle becomes a picker.
3. **Currency picker** (ZAR / KES / NGN / ETB presets) activating the Phase 1
   abstraction.
4. **Voice entry for counts** — numbers-only, constrained grammar, on-device
   speech recognition where the phone has it, graceful absence otherwise.
5. **Barcode as a product *finder*** in count and stock-in for big-catalog
   shops. Not per-sale scanning: the counting inference is the product; a
   scan-every-sale POS is the competitor model that fails with a queue at the
   counter.

---

## Phase 4 — Kenya + Nigeria, then Ethiopia; the ecosystem

Market order (owner's decision, July 2026): **Kenya and Nigeria first,
Ethiopia next.**

1. **Country packs — pure configuration:** currency, languages, expense-
   category presets, payment-method vocabulary. Kenya: Swahili, KES, M-Pesa.
   Nigeria: English, NGN, MoMo/OPay vocabulary. **Ethiopia is its own
   workstream:** Amharic needs Ge'ez-script font verification across cheap
   Android devices, an Ethiopian-calendar display option (dates on receipts
   and the sales calendar), ETB, telebirr vocabulary — and distribution is
   harder there; treat it as a deliberate second wave, not a config tweak.
2. **Staff mode on one device:** a PIN per person and `recorded_by` on counts
   and cash-ups. Resolves the documented "one till, one person" limitation —
   a shortfall can finally point at a shift instead of a rumor.
3. **The business-health report ("lending passport").** An owner-initiated,
   exportable summary of counting consistency, margins, credit-repayment
   behavior, and cash-up discipline that the *owner chooses* to hand to a
   lender or wholesaler. BFA Global's research says trading-history-based
   working capital is the top unmet need; the Kippa lesson says never hold the
   risk. ShopTrack never lends, never scores server-side, never transmits
   anything without an explicit share action. The export is the product.
4. **Wholesale reorder sheet:** low-stock products → a formatted WhatsApp
   message to the supplier. A message generator, not a marketplace — every
   storefront pivot in this market died, but the reorder need is real and it
   is one message away.
5. **Distribution partnerships, not app-store marketing.** Flash reaches
   170,000+ spazas, Kazang ~50,000; telco agent networks reach further. What
   they need from the app: referral/install attribution and an offline
   activation-metrics export so partners are paid on real usage, not installs.
6. **Multi-device sync — only if demanded.** The append-only credit ledger and
   stock movements are naturally merge-friendly when the day comes. Do not
   build it speculatively.

---

## Phase 5 — Hardening for millions

Performance passes (indices, pagination) when real data sizes demand them;
automated device-farm tap-throughs replacing the manual phone ritual; release
trains; and the monetization decision — made *then*, with data, under one
immovable rule from the churn research: **never cap transactions, never
paywall a formerly-free feature.** Candidate revenue that doesn't violate it:
a premium cloud safety-net tier, health-report exports, partner referral fees.
The core counting loop stays free forever.

---

## What we will NOT build

| Anti-feature | Why |
|---|---|
| Payments processing, wallets, POS terminal hardware | Kippa: $14M raised, dead. Low-margin, capital-heavy, owned by telcos. Record money; never move it. |
| Online storefront / marketplace | Khatabook, OkCredit, and Kippa all built one; all three shut them down. |
| Lending from our balance sheet, or selling credit data | The passport is an owner-held export. No balance-sheet risk, no data brokering. |
| Mandatory accounts, logins, or online-required features | Offline-first, works-with-zero-connectivity is the moat and the constitution of this codebase. |
| Per-sale transaction capture as the primary loop | Nobody with a queue at the counter taps every sale. The counting inference *is* the product. |
| Transaction caps, paywalling existing features, ads | The two documented churn drivers, plus the one thing that would burn trust fastest. |
| react-navigation, redux, i18next, or any framework rewrite | The hand-rolled state machine and typed string files are simpler, tested, and match one-action-per-screen. |
| Collapsing the four money questions into one number | The "decisions that look like bugs" in BEFORE-PILOT.md are correct. Keep the tests that pin them. |

---

## Near-term milestones

- **M0 (this week):** backup v2 fix *(done)*; commit the calendar work; local
  crash log; real-Android rehearsal; tag; cut `pilot-1.0`; **start the pilot**.
- **M1 (pilot weeks 1–2, on main):** strings out of App.tsx; engines return
  structured statements; `src/core/currency.ts`. Ships nowhere.
- **M2 (weeks 3–4):** App.tsx decomposition; wiring tests keep passing.
- **M3 (weeks 5–6):** auto-backup + Sentry. **Day 15: pilot retro — reorder
  Phase 2 by what the shops actually did**, then ship 1.1 as the first
  post-freeze build.
- **M4 (weeks 7–10):** WhatsApp reminders/receipts; mobile-money recording;
  read-aloud statements.

The sequencing rule underneath everything: **strings-out-of-engines → i18n →
currency → decomposition** must land before any market feature, because voice,
WhatsApp messages, languages, and currencies all render through that same
statement layer — and **auto-backup + crash reporting must precede any cohort
bigger than the shops you can visit in person.**
