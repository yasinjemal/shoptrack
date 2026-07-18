# ShopTrack tracker audit

Date: 18 July 2026  
Authority: the current worktree and tests override older status prose.

## Why this audit exists

`ROADMAP.md` previously said every code-achievable item was finished while
`PHASE-TRACKER.md` still listed substantial unfinished work. A green typecheck
also masked four English locale scaffolds because `{ ...en }` has the right
TypeScript shape. This document records the evidence boundary so future tracker
updates cannot turn intention into completion.

## Dependency-ordered state

| Order | Work | Evidence now | Completion proof still required |
|---|---|---|---|
| Pilot safety | Schema v11 migrations, backup v7, Android hardware-Back contracts, web/Android export gates, doctor, tests and typecheck are wired | Android OS app-data backup is disabled; explicit backup is required before uninstall | Physical install-over, native SQLite migration, document-provider restore and second-install proof |
| A3 | All six review-pending locales are explicit machine drafts protected by an anti-scaffold/key/renderer test | Drafting is complete | Native-speaker approval and target-phone font review remain external |
| B1 | Schema v11 photo columns, 800 px managed-JPEG store, backup v7 media manifest, staged/journalled restore, pending-picker metadata and orphan sweep are built | Core commit/rollback/marker, validation, old-format, cleanup and recovery-order contracts pass | Real Android camera/gallery/resize/file-system interruption and second-device media round-trip |
| B2–B4 | Customer, product and receipt add/view/manage/delete flows persist accessible thumbnails and obey cleanup ordering | Plaintext sharing redacts customer-photo references/bytes; private/encrypted backups remain complete; `allowBackup` is false | Real-phone permission/Back/Cancel/replace/delete tap-through and encrypted customer-photo round-trip |
| B5 | Open Food Facts v2 parser/client, versioned persistent success cache, cache-first safe fallback, editable prefill and stale-response guard are built and tested | Offline, timeout, malformed and no-match paths are safe misses | Live Android lookup followed by airplane-mode cached lookup |
| C0 | No provider/escrow/price choice | Product decision, not an engineering gap | Owner decision after pilot evidence |
| C1 | Provider-neutral HTTP PUT/GET store contract and manual encrypted client are tested | No live authenticated bucket, credentials, retention or authorization contract | Provision real service and prove it on-device |
| C2 | Device-local owner opt-in, Plus/store/phrase gates, payload-free persistent outbox, daily coalescing and relaunch retry are built | No real entitlement or live backend | Online/offline/relaunch Android proof against production-like storage |
| C3 | Strict Plus-gated read-only backup projection/UI is built without SQLite writes, secrets or media bytes | No real two-phone blob/viewer exercise | Active entitlement + live encrypted blob + physical-phone tap-through |
| C4 | Optional provider-neutral identity/session and account-to-blob locator fail closed and never trigger implicit sign-in | Google OAuth client/SDK and authenticated backend mapping absent | C0 decision, provider/backend implementation and device auth proof |
| C5 | Only automatic backup, remote viewer and account restore are Plus; every existing free feature is pinned free | Price, billing provider and entitlement validation absent | Owner decision and production billing integration |
| D1 | Local/cloud content preview, mandatory verified private snapshot, retention and reversible Undo are wired | Expo private-filesystem/Alert path not physically tapped | Real Android restore + Undo acceptance |
| D2 | High/low recorded day, adjacent-month and YTD statistics with honest gaps/zero bases are tested and rendered | New card not physically tapped at compact/large-font sizes | Real-phone layout and locale review |
| D3–D5 | Dependency audit found no honest implementation without backend governance, remote-write demand or shop-tenancy decisions | Backend/demand/pilot evidence absent | Keep blocked until the documented triggers occur |
| D6 | Money calculation boundaries now round to cents and binary-noise regressions are tested | No pilot discrepancy or policy for historical sub-cent values | Do not migrate schema/backup until evidence triggers the review |

## Tracker corrections made in this audit

- `ROADMAP.md` now describes the verified baseline and points to the phase
  tracker for unfinished code instead of saying only owner work remains.
- Schema/backup status now matches source: schema v11, backup v7, ten database
  collections plus an exact embedded managed-media manifest.
- `BEFORE-PILOT.md` now describes the actual v2→v11 migration range, formats
  1–6 plus legacy schema-stamped v2–v5 compatibility, staged media recovery,
  and the plaintext/encrypted photo privacy boundary.
- Afaan Oromoo is labelled as a machine draft awaiting review; metadata and
  prose no longer disagree.
- The stale “pending app.json/eas.json changes” owner task now refers to a clean
  reviewed worktree, and the review list includes Afaan Oromoo.
- Phase B is recorded as code-complete but not device-complete: unchecked boxes
  now name the exact Android camera/gallery, second-install restore, cleanup,
  and Open Food Facts online/offline evidence still required.
- C1–C5 now distinguish completed provider-neutral client/policy code from the
  unbuilt live bucket, Google/account backend, billing and owner decisions.
- D1 and D2 are code-complete and remain device-open only for their explicit
  Android filesystem, Undo, layout and locale acceptance checks.
- The D3–D5 dependency audit records why speculative catalog/sync/multi-shop
  code would freeze missing product/backend decisions; D6 records the cents
  boundary fix without pretending a schema migration is evidence-backed.
- Android OS app-data backup is intentionally disabled. The trackers now warn
  that uninstall removes private snapshots unless the owner first copies an
  explicit backup outside ShopTrack.

## External-only evidence

No code or simulator result can complete these items:

- 14-day observations in 3–5 real shops;
- physical Android install-over, native SQLite migration/restore, camera and
  gallery resize, process-interruption recovery, document picker, share sheet,
  keyboard, large-font and background checks;
- second-install photo restore, encrypted customer-photo recovery, uninstall
  behavior, and live-then-airplane-mode Open Food Facts verification;
- Sentry account/DSN and production cloud storage/credentials;
- Supabase/Firebase, recovery-key escrow and Plus price/billing decisions;
- production bucket/auth rules, Google OAuth client, server-side token
  verification, account-to-blob mapping and live Plus entitlement state;
- native-speaker approval and target-phone Amharic font review;
- authenticated EAS builds, pilot tag/promotion and store release sign-off.

The goal stays active until every code-achievable row is implemented and every
external row is either proven outside this machine or explicitly left as an
external gate—never silently marked done.
