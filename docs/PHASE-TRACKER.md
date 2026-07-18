# ShopTrack Phase Tracker

*The single working list of what gets built, in order. Companion to
[ROADMAP.md](ROADMAP.md) (strategy) and [BRAINSTORM-2026-07.md](BRAINSTORM-2026-07.md)
(the July 2026 owner ideas + research these phases come from). Tick tasks as
they land; update **Current focus** so any session can pick up where the last
one stopped.*

**Current focus:** → release verification and external acceptance. All
dependency-safe code through D2 is built and test-backed. Phase B, C and D
boxes that need a real Android phone, live backend/account, billing decision,
or pilot evidence remain open and name that boundary below.
(A1 + A2 were owner-verified on the web build 2026-07-18; re-check them during
the same Android rehearsal.)

**Every task is done only when:** `npm test` and `npm run typecheck` are green;
new user-facing strings exist in **all eight** i18n files (en/zu/xh/st/af/sw/am/om
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

### A3. Language drafts for owner review  `[x]`  (built 2026-07-18)

The owner speaks English, isiZulu, isiXhosa, Amharic, and Afaan Oromo — they
can review those drafts directly. Done 2026-07-18: all languages (including
new **om / Afaan Oromoo**) are selectable in Settings, survive restart, and
show "review pending" honestly. A tracker audit found that xh / st / af / sw
still used `{ ...en }`, which passed typecheck but showed English. All six
review-pending languages now have explicit drafts for the full current key set
(typed `typeof en`), and `i18n.test.ts` rejects spread-only scaffolds, missing
keys, copied renderers, and mostly-English drafts. Draft status: `[x]` xh
`[x]` st  `[x]` af  `[x]` sw  `[x]` am  `[x]` om. Keep `reviewed: false`
in `src/i18n/index.ts` until a native speaker signs each one off.

---

## Phase B — Photos & barcode (after A)

### B1. Photo plumbing (shared infrastructure)  `[ ]`  (code complete 2026-07-18; native acceptance pending)

Landed as schema v11 photo references on products, customers, and expenses;
the shared `PhotoField`; camera/gallery selection; 800 px long-edge JPEG
resize; strict purpose-specific UUID paths; a 5 MB restored-file ceiling; and
late-picker/unmount guards. Draft replacement, cancellation, parent deletion,
and startup orphan sweeping keep the private media root aligned with SQLite.

Backup format v7 embeds the exact referenced JPEG set as validated base64.
Formats 1–6 and legacy schema-stamped v2–v5 files normalize explicitly. A
restore stages its complete media set before the SQL transaction; a durable
journal paired with a transaction-written SQLite token lets startup finalize a
committed swap or restore the old root after process death. Tests cover resize
math, path/MIME/JPEG/ownership validation, cleanup signals, media commit,
rollback, recovery decisions, redaction, and old-format upgrades.

**Acceptance still required on Android:** capture/gallery permissions, actual
camera resize/output, kill/relaunch around picker and restore, file cleanup,
and a database-plus-photo restore onto a second install/device.

### B2. Credit customer photos / ID photos  `[ ]`  (code complete 2026-07-18; native acceptance pending)

Optional photos render in the credit list and focused Manage Person screen,
where they can be added, replaced, or removed. Deactivation is offered only at
an exact zero balance and is rechecked in SQL so debt or overpayment cannot be
hidden; a successful deactivation clears the reference before deleting the
file.

The privacy boundary is explicit: the live photo and complete daily snapshot
stay in ShopTrack's private storage, and encrypted envelopes may include them.
A plaintext backup shared through WhatsApp, Drive, or another app removes both
the customer-photo reference and bytes. Android OS app-data backup is disabled
(`android.allowBackup: false`) so the database and ID photos are not silently
copied to an uncontrolled service. Uninstalling therefore also removes private
snapshots; an explicit external backup must be made before deleting the app.

### B3. Product photos  `[ ]`  (code complete 2026-07-18; native acceptance pending)

Optional product photos can be added, edited, removed, and cleaned up on
deactivation. Accessible thumbnails render in both the product list and the
count flow. Plaintext shared backups include these photos.

### B4. Expense receipt photos  `[ ]`  (code complete 2026-07-18; native acceptance pending)

Add Expense can capture/choose an optional receipt; history renders an
accessible thumbnail, and deleting the expense removes its managed file only
after the database delete succeeds. Plaintext shared backups include receipt
photos.

### B5. Barcode → name prefill  `[ ]`  (code complete 2026-07-18; native acceptance pending)

Add Product now resolves a valid scan through a versioned persistent cache
first, then the Open Food Facts v2 product endpoint. A successful response
prefills an editable name; blank/malformed/not-found responses, cache errors,
network failure, and timeout are safe misses that leave the existing form
usable. Manual barcode edits invalidate an older in-flight lookup so a late
response cannot rename the wrong product. Parser, cache, cache-first offline,
timeout, and UI race contracts are tested.

**Acceptance still required on Android:** look up a real barcode over mobile
data/Wi-Fi, edit the prefill, then repeat in airplane mode and confirm the
cached barcode resolves without a request. No-match and offline-first scans
must feel identical to the pre-OFF form.

### Phase B native-only completion gate

- Tap camera and gallery flows for customer, product, and receipt records on a
  real Android phone, including permission denial, Back/Cancel, replacement,
  removal, thumbnails, and parent cleanup.
- Confirm a large camera image is physically stored as a readable JPEG no
  larger than 800 px on its long edge, and interrupted picker/restore recovery
  leaves no mixed database/media state.
- Copy a backup outside ShopTrack before uninstalling. Restore on a second
  install/device; verify product and receipt media survive a shared backup,
  the shared plaintext file contains no customer/ID photo, and a complete
  encrypted/private route preserves customer media when available.
- Verify Open Food Facts once online and again from cache in airplane mode.

---

## Phase C — The backend epoch (accounts, cloud, revenue)

> ShopTrack's first server. Constitution holds: accounts optional forever,
> offline stays first-class, nothing free ever becomes paid.

### C0. Decision gate (owner, not code)  `[ ]`

- [ ] Supabase vs Firebase
- [ ] Is "account can restore *without* recovery phrase" offered? (explicit
      key-escrow choice — see BRAINSTORM #6)
- [ ] Plus price point (R15–R30/month zone; decide after pilot data)

### C1. Storage bucket + wire `HttpCloudBackupStore`  `[ ]`  (client contract complete; live bucket pending)

The provider-neutral `CloudBackupStore` and HTTP PUT/GET adapter are split from
encryption and covered by injected-fetch contract tests for URL encoding,
headers, payloads, protocol errors, bad JSON, and offline failure. Manual
encrypted upload/download remains behind `EXPO_PUBLIC_CLOUD_BACKUP_URL`.

**External gate:** choose and provision the authenticated object store, its
credentials/authorization contract, retention policy, and production URL.

### C2. Auto-push encrypted backup from the shop phone  `[ ]`  (code complete; live service/Plus acceptance pending)

The owner-facing opt-in is device-local so restoring a backup cannot silently
create a second writer. A Plus gate, configured-store gate, and remembered
recovery-phrase gate all fail closed. A newly-created daily snapshot queues
one payload-free outbox revision; later launches retry it, failures persist,
and concurrent requests coalesce without blocking startup. Enabling explicitly
queues the current state.

**External gate:** real entitlement/provider state plus an authenticated bucket,
then live online/offline/relaunch proof on Android.

### C3. "My Shop" read-only viewer  `[ ]`  (code complete; live/device acceptance pending)

Encrypted download now offers a Plus-gated **View only** path. A strictly
validated projection renders stock, credit, expenses, sales, latest count and
cash-up in the backup's own currency without opening SQLite or exposing PINs,
staff credentials, settings rows, recovery material, or photo bytes. It has
nested Android Back handling and 50-row pagination. Manual restore remains
permanently free. **This is the away-for-weeks feature and the Plus flagship.**

**External gate:** a real latest blob, active entitlement, two-phone Android
tap-through, and the single-writer operating rehearsal.

### C4. Optional Google sign-in  `[ ]`  (provider-neutral core complete; Google/backend pending)

Core now has strict optional identity/session and account-to-encrypted-blob
locator contracts. Session reads never trigger sign-in; malformed/offline
provider and locator results fail closed; credentials, email/profile data and
recovery phrases cannot enter core state. The account locates blobs — the
recovery phrase remains the encryption key unless C0 decides otherwise.

**External gate:** C0 provider/key-escrow decision, Google OAuth client/SDK,
server-side token verification, and an authenticated account-to-blob mapping.

### C5. ShopTrack Plus entitlements  `[ ]`  (policy complete; billing/price pending)

The provider-neutral policy gates only `automatic_cloud_backup`,
`remote_viewer`, and `account_restore`, fails closed for unknown/inactive Plus
state, and pins every original permanently-free feature in regression tests.
Local backup and restore remain free regardless of provider state.

**External gate:** Plus price, billing provider, receipt/server validation,
subscription lifecycle and real entitlement injection.

---

## Phase D — Later (parked, in rough order)

- [ ] **Pre-restore preview + safety snapshot** — code complete; local and
      cloud restores show the same validated shop/date/content summary, then
      require a verified private full snapshot before mutation. Three recent
      snapshots are retained; a successful restore offers immediate Undo,
      which is itself safely snapshotted. Real Android filesystem/Undo
      tap-through remains.
- [ ] **Sales-month statistics** — code complete; deterministic highest/lowest
      recorded day, adjacent-month and YTD/prior-year comparisons render in the
      Sales Book with honest missing-period/zero-base states. Real-phone layout
      and translation tap-through remains.
- [ ] **Community product catalog** — barcode → name/size shared across shops,
      seeded from Open Food Facts (needs Phase C backend).
- [ ] **Two-way sync** — only when the owner needs to *write* remotely.
- [ ] **Multi-shop support** — when shop #2 happens; natural Plus feature.
- [ ] **Integer-cents review** — reviewed in code: calculation boundaries now
      round money to cents and regression tests cover binary floating noise.
      A schema/backup conversion is not justified until pilot evidence shows a
      discrepancy and the owner chooses how to handle historical sub-cent data.

---

## Owner tasks (no code — from [ROADMAP.md](ROADMAP.md) status list)

- [ ] Commit the completed code work from a clean reviewed tree; tag `pilot-1.0`
- [ ] Real-Android rehearsal: upgrade-install, photo/OFF flows, explicit
      backup + second-install restore on physical phones
- [ ] Run the pilot ([PILOT-TRACKER.md](PILOT-TRACKER.md)) — you are shop #1; recruit 2–4 more
- [ ] **Remote-viewing acceptance:** configure the real encrypted store and
      Plus entitlement, push from the single writer, then use **View only** on
      the owner's physical phone without changing either shop database
- [ ] Decide Supabase/Firebase, recovery-key escrow, Plus price and billing/auth
      providers; provision the cloud bucket and Google OAuth client
- [ ] Sentry DSN (`EXPO_PUBLIC_SENTRY_DSN`) to activate crash reporting
- [ ] Native-speaker review of xh / st / af / sw / am / om string files
- [ ] EAS builds + release train ([RELEASE-TRAIN.md](RELEASE-TRAIN.md))

---

## Log

| Date | What landed |
|---|---|
| 2026-07-18 | Tracker created from BRAINSTORM-2026-07 + owner priorities |
| 2026-07-18 | A1 shop profile: shopProfile module, Settings section, named header, signed share messages, named backup filename (owner_name deliberately dropped) |
| 2026-07-18 | A2 owner lock: ownerLock module + gate screen, five money surfaces gated, worker today-sales path, relock on background, PIN in Settings |
| 2026-07-18 | Languages: Afaan Oromo (om) added; all draft languages selectable + persistent for in-app owner review |
| 2026-07-18 | A3 (om): full Afaan Oromo draft — all keys translated, typecheck-verified complete, awaiting owner review |
| 2026-07-18 | A3 (am): full Amharic draft — all keys translated, typecheck-verified complete, awaiting owner/font review |
| 2026-07-18 | A3 complete: explicit isiXhosa, Sesotho, Afrikaans and Kiswahili drafts replaced English scaffolds; one anti-scaffold/key/renderer/locale gate now covers all six review-pending languages |
| 2026-07-18 | Restore compatibility defect fixed: schema-stamped v2–v5 backups, UTF-8 BOM files, and Android providers with incorrect JSON MIME types are accepted and transactionally restored |
| 2026-07-18 | Pre-pilot design refinement: accessible reusable headers/chips/loading/forms, stock-in result + undo, visible expense correction, explicit month states, compact-width and long-translation validation |
| 2026-07-18 | B1 code complete: schema v11 photo columns, managed JPEG store, backup v7 embedded media, staged/journalled restore, orphan recovery, privacy redaction and lifecycle tests |
| 2026-07-18 | B2–B4 code complete: customer/manage-person, product/count and expense/receipt photo persistence, thumbnails, replacement and cleanup contracts; real Android acceptance remains |
| 2026-07-18 | B5 code complete: cache-first Open Food Facts parser/client, editable prefill, safe offline/no-match fallback and stale-response guard; live Android network/cache check remains |
| 2026-07-18 | Android OS backup disabled for private database/photo safety; owners must export an explicit backup before uninstalling |
| 2026-07-18 | C1–C5 code-achievable foundations complete: HTTP store contract, opt-in retrying encrypted outbox, Plus-gated read-only viewer, optional identity/locator contract and permanent-free entitlement regression policy; real backend/auth/billing remain external |
| 2026-07-18 | D1 code complete: shared restore preview, mandatory private pre-restore snapshot, three-file retention and immediate reversible Undo path |
| 2026-07-18 | D2 code complete: honest high/low day, adjacent-month and YTD statistics with localized Sales Book UI |
| 2026-07-18 | Owner lock now also protects Settings, recovery phrases and Home backup/restore controls; worker counting/stock/credit/cash-up flows remain available |
| 2026-07-18 | Integer-cents review fixed boundary rounding noise; schema conversion remains evidence-gated, while catalog/sync/multi-shop remain backend/demand-gated |
