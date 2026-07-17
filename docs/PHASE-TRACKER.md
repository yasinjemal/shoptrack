# ShopTrack Phase Tracker

*The single working list of what gets built, in order. Companion to
[ROADMAP.md](ROADMAP.md) (strategy) and [BRAINSTORM-2026-07.md](BRAINSTORM-2026-07.md)
(the July 2026 owner ideas + research these phases come from). Tick tasks as
they land; update **Current focus** so any session can pick up where the last
one stopped.*

**Current focus:** → A3 language drafts (xh, am, om) for owner review, then Phase B
(A1 + A2 built and owner-verified on the web build 2026-07-18; re-check both
during the next real-Android rehearsal)

**Every task is done only when:** `npm test` and `npm run typecheck` are green;
new user-facing strings exist in **all seven** i18n files (en/zu/xh/st/af/sw/am
— the build fails on missing keys, that is the point); money renders through
`formatMoney()`; engines return data and screens render sentences; any new
screen is **tapped through on a real phone**. Schema changes bump
`SCHEMA_VERSION` in [src/core/schema.ts](../src/core/schema.ts) with an
additive migration + test; anything new in backups bumps
`BACKUP_FORMAT_VERSION` in [src/core/db.ts](../src/core/db.ts) with
`normaliseBackup` handling for every older format + test.

---

## Phase A — Identity & owner lock (small, start now)

### A1. Shop profile — the app learns the shop's name  `[x]`  (built 2026-07-18)

Settings keys `shop_name`, `shop_phone` in the settings table (travels in
backups — no schema bump). `owner_name` was dropped: nothing renders it, and
this codebase does not store invisible data — add it when something does.

Landed as: `src/core/shopProfile.ts` (currency.ts pattern — loaded at init and
after every restore, read synchronously) + `shopProfile.test.ts`; a "Your
shop" section in Settings; home header shows the shop's name once set; every
`renderShareMessage` output, the reorder sheet, and the health-report share
gain a localized "— Nomsa's Shop · 073…" sign-off; shared-backup filename is
`nomsas-shop-backup-2026-07-18.json`. Tests + typecheck green.

**Owner-verified 2026-07-18** on the web build: named header, locked Home
card, worker Today's-sales tile, PIN gate, unlock restores the money cards.
Re-check on real Android during the pilot rehearsal.

### A2. Owner PIN — hide the money from the worker  `[x]`  (built 2026-07-18)

Landed as: `src/core/ownerLock.ts` + tests (4-digit `owner_pin` setting,
travels in backups, always re-locks on load; no lockout — the owner IS the
support line). Gated while locked: **Expenses, Sales Book, Weekly, Activity
(per-product profit), Health Report**, and Home's profit/sales/owed cards
collapse to one "🔒 Owner only" card. Auto-relocks whenever the app leaves
the foreground. Worker flow untouched: count, stock-in, credit, cash-up,
products — plus a new **Today's sales** path (`sales_today` screen): while
locked, the Sales Book tile becomes a takings-only entry that hides the
margin and reuses the owner's stored one silently. Changing/removing the PIN
in Settings requires the current PIN.

**Owner-verified 2026-07-18** on the web build (lock card, gate, unlock,
worker tiles). Still worth one real-phone pass for the background-relock,
which the browser exercises differently than Android.

### A3. Language drafts for owner review  `[ ]`  (effort: M per language)

The owner speaks English, isiZulu, isiXhosa, Amharic, and Afaan Oromo — they
are the native reviewer. Done 2026-07-18: all languages (incl. new **om /
Afaan Oromoo**) are now selectable in Settings and survive restart, labeled
"review pending". Still to do: the xh / am / om files are scaffolds showing
English — draft each (~370 keys, one file typed `typeof en`) so the owner can
review them in the app. One language per session: `[ ]` xh  `[ ]` am  `[ ]` om.

---

## Phase B — Photos & barcode (after A)

### B1. Photo plumbing (shared infrastructure)  `[ ]`  (effort: M)

Build once, use for B2–B4: capture via camera/gallery, resize on save
(~800 px long edge JPEG — a readable ID photo in a few hundred KB), files in
the app documents directory, embedded base64 in backup JSON (**backup format
bump — one bump shared with B2/B3**), deleted when the owning record is
deleted/deactivated.

**Done means:** embed → backup → restore round-trips a photo onto a second
device; deleting the parent removes the file; oversized camera output is
verifiably shrunk.

### B2. Credit customer photos / ID photos  `[ ]`  (effort: S on top of B1)

Photo per customer, shown in the credit book and customer view. POPIA:
minimum data, photo lives only on-phone and inside encrypted backups,
deactivating a customer deletes it.

### B3. Product photos  `[ ]`  (effort: S on top of B1)

Thumbnail in the products list and — the real win — in the **count flow**,
where a photo is recognised faster than text. Optional per product.

### B4. Expense receipt photos  `[ ]`  (effort: S, optional)

Snap the wholesaler slip onto an expense entry. Build only if A/B leave room.

### B5. Barcode → name prefill  `[ ]`  (effort: M)

On scan in Add Product with signal: look up Open Food Facts
(`world.openfoodfacts.org/api/v2/product/{barcode}`, free, keyless; ~9,900
SA-tagged products + global fallback) and **prefill** the name, editable.
Cache successful lookups. No signal / no match: the form behaves exactly as
today. Client lives in `src/net/` (core stays network-free).

**Done means:** airplane mode is indistinguishable from today; response
parser unit-tested against real OFF payloads; a cached barcode resolves
offline the second time.

---

## Phase C — The backend epoch (accounts, cloud, revenue)

> ShopTrack's first server. Constitution holds: accounts optional forever,
> offline stays first-class, nothing free ever becomes paid.

### C0. Decision gate (owner, not code)  `[ ]`

- [ ] Supabase vs Firebase
- [ ] Is "account can restore *without* recovery phrase" offered? (explicit
      key-escrow choice — see BRAINSTORM #6)
- [ ] Plus price point (R15–R30/month zone; decide after pilot data)

### C1. Storage bucket + wire `HttpCloudBackupStore`  `[ ]`  (effort: S — client already written in [src/net/cloudBackup.ts](../src/net/cloudBackup.ts))

### C2. Auto-push encrypted backup from the shop phone  `[ ]`  (effort: S–M)

Piggyback on the existing daily auto-backup: when online, push the encrypted
blob. Offline-buffered, silent, never blocks the app.

### C3. "My Shop" read-only viewer  `[ ]`  (effort: M–L)

Owner's phone pulls the latest blob, decrypts with the recovery phrase,
renders the same screens read-only. Single writer (the shop phone), so no
merge logic. **This is the away-for-weeks feature and the Plus flagship.**

### C4. Optional Google sign-in  `[ ]`  (effort: M)

Google first (free, universal on SA Android, no password support burden);
phone OTP later; email/password last or never. The account locates blobs —
the recovery phrase remains the encryption key unless C0 decides otherwise.

### C5. ShopTrack Plus entitlements  `[ ]`  (effort: S–M)

Extend [src/core/entitlements.ts](../src/core/entitlements.ts): Plus gates
only C2–C4 capabilities. Keep (and extend) the test asserting nothing
free ever becomes paid.

---

## Phase D — Later (parked, in rough order)

- [ ] **Pre-restore preview + safety snapshot** — show a backup's contents and
      date before restoring; auto-snapshot current state first.
- [ ] **Sales-month statistics** — highest/lowest day, month-over-month,
      year-to-date in [src/core/sales.ts](../src/core/sales.ts).
- [ ] **Community product catalog** — barcode → name/size shared across shops,
      seeded from Open Food Facts (needs Phase C backend).
- [ ] **Two-way sync** — only when the owner needs to *write* remotely.
- [ ] **Multi-shop support** — when shop #2 happens; natural Plus feature.
- [ ] **Integer-cents review** — revisit if rounding drift ever shows in a
      real shop's numbers (BRAINSTORM decision: deferred, not rejected).

---

## Owner tasks (no code — from [ROADMAP.md](ROADMAP.md) status list)

- [ ] Commit the pending `app.json` / `eas.json` changes; tag `pilot-1.0`
- [ ] Real-Android rehearsal: upgrade-install + backup/restore on a physical phone
- [ ] Run the pilot ([PILOT-TRACKER.md](PILOT-TRACKER.md)) — you are shop #1; recruit 2–4 more
- [ ] **Stage-0 remote viewing test:** worker WhatsApps the daily backup; you
      restore on your (viewer-only) phone — feeds the C3 design
- [ ] Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) to activate crash reporting
- [ ] Native-speaker review of xh / st / af / sw / am string files
- [ ] EAS builds + release train ([RELEASE-TRAIN.md](RELEASE-TRAIN.md))

---

## Log

| Date | What landed |
|---|---|
| 2026-07-18 | Tracker created from BRAINSTORM-2026-07 + owner priorities |
| 2026-07-18 | A1 shop profile: shopProfile module, Settings section, named header, signed share messages, named backup filename (owner_name deliberately dropped) |
| 2026-07-18 | A2 owner lock: ownerLock module + gate screen, five money surfaces gated, worker today-sales path, relock on background, PIN in Settings |
| 2026-07-18 | Languages: Afaan Oromo (om) added; all draft languages selectable + persistent for in-app owner review |
