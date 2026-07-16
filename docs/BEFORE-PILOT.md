# Before the Pilot

Pilot-readiness record for the safeguards that protect a shop's data. Items
marked resolved are held by automated tests; the real-device check remains a
manual Day 0 gate.

ShopTrack is pre-release. Some code here trades safety for speed on purpose.
That is the right trade *today* and the wrong trade the moment a shop owner
counts their stock into it. This file is the list of those trades, what each
one does, why it exists, and what to do about it.

**Current status:** data-reset and backup-format tripwires are resolved. The
Android 1.0.1 preview build completed successfully on 14 July 2026
([install page](https://expo.dev/accounts/yasinali69/projects/ShopTrackApp/builds/7f20af1b-0663-41ab-ab0c-fbc9721f1601)). The real Android
upgrade/backup/restore rehearsal is still required before Day 0.

---

## Tripwire 1: Database updates preserve data — resolved

| | |
|---|---|
| **Where** | `src/core/schema.ts` — `migrateDatabase()` and `initDatabase()` |
| **Now** | Destructive reset removed; supported versions migrate in place |
| **Test** | `schema.test.ts` migrates a populated v4 database and proves every row survives |
| **If ignored** | An app update wipes every shop's books. Silently. |

### Current behaviour

On startup, `initDatabase()` compares `PRAGMA user_version` with
`SCHEMA_VERSION`. Fresh databases are created at the current shape. Committed
versions 2 through 4 follow additive, transactional migrations to version 5.
Unknown or future versions fail closed and leave every row untouched.

Every future `SCHEMA_VERSION` bump must add a migration and a populated upgrade
test. There is deliberately no reset flag and no drop-all fallback anymore.

---

## Tripwire 2: Backups have an independent format — resolved

| | |
|---|---|
| **Where** | `src/core/db.ts` — `BACKUP_FORMAT_VERSION`, `createBackup`, `restoreBackup` |
| **Now** | Format v2 is independent from the schema version; formats v1 and the old three-table file have upgraders |
| **Test** | All eight tables round-trip; an invalid restore rolls back without replacing current data |
| **If ignored** | Every backup a shop has made becomes unrestorable the first time you change the schema |

### Current behaviour

`backup_format_version` changes only when the JSON contract changes;
`schema_version` is informational. A backup contains products, stock movements,
count sessions, customers, credit entries, expenses, cash-ups, and sales
entries. Restore validates before writing, replaces all eight sets
transactionally, and rolls back to the existing shop if any row is invalid.
Format-1 files (made before the sales book existed) and the old pre-pilot
three-table version-5 file are upgraded on import with explicit empty newer
tables.

### The tripwire fired once — the sales book was missing from backups

When the sales book landed (schema v6, `sales_entries`), the backup stayed at
format v1 and never learned about the new table. A shop that filled in months
of takings and then restored a backup would silently lose the whole sales book
— and a restore left any existing sales entries mixed in with the restored
shop, because the delete block did not clear the table either. Found in a
pre-pilot review, July 2026; fixed by format v2.

The lesson, added to the schema-bump checklist: **every new table needs three
entries, not two** — the schema migration, the backup format bump with an
upgrader, and the round-trip test. The migration alone only protects data on
the phone it is already on.

---

## Tripwire 3: Run the migration and restore on a real phone — pending

| | |
|---|---|
| **Where** | `src/core/schema.ts`, exercised by `src/core/schema.test.ts` |
| **Now** | Tested against `node:sqlite` in CI-style tests only |
| **Before pilot** | Run on a real Android device with real data |
| **If ignored** | A schema step that works in node may behave differently under expo-sqlite |

### What it does

`schema.test.ts` builds real SQLite databases and asserts the schema is created,
stale versions are migrated without losing rows, and `database/schema.sql` has not drifted from the
code. That is real SQL against a real engine — but it is `node:sqlite`, not the
SQLite that ships inside expo on Android.

### Why it matters

They are different builds of SQLite, with different versions, defaults, and
compile flags. Behaviour around `PRAGMA`s, foreign keys, and `ALTER TABLE` has
changed across SQLite versions. The tests raise confidence; they do not prove
the device case.

### What to do

Before Day 0 of the pilot, on a real Android phone:

1. Install the previous build, add products, record a count, a credit entry, and an expense.
2. Install the 1.0.1 preview build over it without uninstalling the app.
3. Confirm every original row remains and the new column/table is usable.
4. Make a backup and restore it.

---

## Tripwire 4: The pilot is a feature freeze

| | |
|---|---|
| **Where** | `docs/PILOT-TRACKER.md` |
| **Now** | Start date is blank — the pilot has not begun |
| **Once it starts** | Copy fixes and critical bug fixes only |

`PILOT-TRACKER.md` is explicit: no new features, no UI redesigns, no "quick
improvements" during the 14 days. The pilot measures whether the current
product works. Changing it mid-flight means measuring nothing.

Anything on this page that is not done **before** Day 0 does not get done until
Day 15. That is the real deadline for tripwires 1–3.

---

## UI verification

Every engine here is covered. No screen is.

The credit book shipped completely unusable: tapping "Add" appeared to do
nothing. A new customer has a zero balance, the summary filtered zero balances
out of the array the screen was rendering, so the person vanished the moment
they were created — and could then never be given credit, because they never
appeared to tap. **Every test passed.** They asserted the engine's own intent
("paid-up customers drop off the list" — correct!) while the feature was dead. A
shop owner found it in about a minute on a real phone.

Two things came out of it, and neither is a fix:

- `CreditSummary` now names the arrays `owing` and `everyone`, so which one a
  screen should render is obvious. That reduces the odds; it does not close the
  hole.
- `db.test.ts` walks the journey — add a person, then look for them — rather
  than only checking the maths. Do this for new features.

**The remaining gap: nothing renders a component in CI.** Engine tests
answer "is the arithmetic right?", never "can a person use this?". Until that
changes, a feature is not done when the tests pass — it is done when it has been
tapped through on a phone. Budget for that on every feature, and expect the
pilot to find this class of thing.

`npm run test:ui-flow` now pins the critical screen wiring (Review before save,
first-count language, Undo, state-driven Home, scrollable Weekly Summary,
searchable Stock-In, and bilingual core copy), and both web and Android bundles
are compiled before a pilot build. That catches wiring and bundling regressions;
the real-phone tap-through remains the final proof.

---

## Never open the database twice

Not a pre-pilot item — a permanent rule, and the second web-only trap in a row.

**Symptom:** "Can't open your shop data — Error code 14: unable to open database
file". Clearing browser storage fixes it, until the next code change.

**Cause:** on web, SQLite lives in a worker holding an OPFS access handle, and
that handle is **exclusive** — one holder at a time. Nothing closes it, because
the database should stay open for the life of the app. So a second open, while
the first handle is still held, fails with `SQLITE_CANTOPEN` (14).

Opening used to happen inside a `useEffect` against a plain module variable.
Every remount opened the database again — and **a Metro fast-refresh is a
remount**. So editing any file could leave the app unable to open its own data.

**The trap, again:** native does not care. Two opens on Android are fine. This
only ever breaks on web, so it survives every device test.

**Rule:** the database is opened once per JS context via `openDatabase()` in
App.tsx, which caches the promise on `globalThis` — not in a module variable,
because fast-refresh re-evaluates the module while the previous worker is still
alive and still holding the file. A failed open is not cached, so "Try again" is
a real retry. `npm run test:ui-flow` asserts all three and fails if a second
open appears.

**Related:** the same shape as the sync-SQLite rule below. Both are web-only,
both are invisible on a device, both shipped. If a third one turns up, the
lesson is that the web build needs a smoke test in CI, not another rule here.

---

## Never call SQLite synchronously

Not a pre-pilot item — a permanent rule, recorded here because breaking it costs
an afternoon and the symptom points nowhere near the cause.

**Symptom:** on web, the UI, navigation and compilation all work perfectly, and
then saving anything fails with `Sync operation timeout`.

**Cause:** on web, expo-sqlite runs SQLite in a worker. The two APIs reach it
very differently (`expo-sqlite/web/WorkerChannel.ts`):

| API | How it reaches the worker | Fails when |
|---|---|---|
| `openDatabaseSync`, `execSync`, … | Spins on `Atomics.load` over a `SharedArrayBuffer` until the worker replies, then throws `Sync operation timeout` | The busy-wait is not satisfied — routine unless the page is properly cross-origin isolated |
| `openDatabaseAsync`, `execAsync`, … | `postMessage` + await a promise | Nothing to time out |

`SharedArrayBuffer` needs COOP/COEP headers *and* a browser that honours them.
`metro.config.js` and `serve.js` set those headers, but headless and
non-isolated contexts still leave the busy-wait unsatisfied. The async path
needs none of it.

**The trap:** on native, sync and async are interchangeable. A sync call works
perfectly on Android and iOS, so the regression is invisible until someone opens
the web build. That is why `db.test.ts` scans every source file for sync SQLite
calls and fails the suite if one appears. Do not delete that check.

**Rule:** every SQLite call goes through the async API. `src/core/db.ts` already
does; the database is opened once with `openDatabaseAsync` in `App.tsx`.

Worth knowing: expo-sqlite's own web driver is still experimental. If the async
path ever starts failing too, the fallback is to treat web as a UI preview only
and verify on a device — which is where it needs to be verified anyway
(tripwire 3).

---

## Writing a migration

The v0→v1 migration was written, then deleted when it became clear there were
no users to migrate. **It was removed before the first commit, so it is not in
git history.** The hard-won parts are recorded here so they are not rediscovered
the expensive way.

Rebuilding a table in SQLite is not just `ALTER TABLE`. Follow SQLite's
[documented procedure](https://www.sqlite.org/lang_altertable.html#otheralter),
and note these two traps, both of which bit during the v0→v1 work:

### `ALTER TABLE ... RENAME` rewrites *other* tables' foreign keys

Renaming `products` to `products_legacy` also rewrites the `REFERENCES
products(id)` clause inside `stock_movements` to point at `products_legacy`.
Dropping the old table then fails with `FOREIGN KEY constraint failed`, because
the child table now genuinely depends on it.

**Fix:** `PRAGMA legacy_alter_table = ON` for the duration of the rebuild.

### Both pragmas are no-ops inside a transaction

`PRAGMA foreign_keys` and `PRAGMA legacy_alter_table` silently do nothing if
set after `BEGIN`. They must be set *before* the transaction opens, or you get
no error and no effect — the worst combination.

### The shape that works

```
PRAGMA foreign_keys = OFF;        -- outside any transaction
PRAGMA legacy_alter_table = ON;   -- outside any transaction
BEGIN;
  ALTER TABLE x RENAME TO x_legacy;
  CREATE TABLE x (...);           -- new shape
  INSERT INTO x SELECT ... FROM x_legacy;
  DROP TABLE x_legacy;
  PRAGMA foreign_key_check;       -- inside: a violation must roll back
COMMIT;
PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;         -- restore prior value
```

Run `foreign_key_check` **inside** the transaction and throw on any row it
returns. A migration that would orphan data must roll back rather than commit
the damage.

### Test it against real SQLite

`schema.test.ts` already builds a database, mutates it, and asserts the result.
A migration test should assert, at minimum:

- every row survives (count before, count after)
- values are converted correctly, not just present
- running it twice is a no-op (idempotent)
- a database already at the target version is left alone

That last one is the dangerous case: a bug there wipes data on every launch,
not just on upgrade.

---

## Decisions that look like bugs — do not "fix" these

Five places where the obviously-correct-looking change is wrong. Each has a
test pinning it.

### Stock purchases are cash-out, but are *not* an expense

`src/core/cashup.ts` counts stock purchases. `src/core/expenses.ts` refuses to.

This looks like a contradiction and is the single sharpest edge in the codebase.
Both are right, because profit and cash disagree about what stock is:

- **Profit**: a delivery is not a cost until the goods sell. Every unit sold is
  already valued at its `buy_price`, so counting the delivery as an expense too
  would charge the owner twice and fake a loss.
- **Cash**: handing R800 to a supplier removes R800 from the till, today,
  whatever the accounting says.

Leave stock out of cash-up and every cash-up after a delivery reports a
shortfall exactly the size of that delivery — sending the owner hunting a thief
who is actually their supplier. A test asserts precisely this.

### The sales book is never added to counted profit

`src/core/sales.ts` and `src/core/calculations.ts`

Home can show both "you made R750" (from stock counts) and "R60,850 profit
across 6 months" (from the owner's book). Adding them, or showing one grand
total, would count the same trading twice — they are two *estimates of the same
money*, not two piles of it:

- **Counted profit** — what the shelf says. Exact, but needs two counts.
- **Book profit** — takings × the owner's own margin guess. Rough, but answers
  for January.

Where they disagree, that gap is the interesting number: shrinkage, a bad margin
guess, or an unrecorded delivery. Reporting the disagreement is useful. Summing
them is a lie. The screens keep them visually separate and the Sales Book says
so in plain words.

Related: a month is either detailed (days) or summarised (one total), never
both. If both exist the days win and `has_conflict` is raised, because one of
the two is wrong about the same month.

### A cash-up's `expected` is stored, not recalculated

`cash_ups.expected_amount` / `difference`

Everything feeding "expected" keeps moving after the fact: a backdated expense,
a late stock-in, a corrected count. Recomputing would silently rewrite history
and turn a cash-up that balanced into a shortfall nobody can explain. The owner
reconciled against the number the app showed them; that number is the record.

Note this is the *opposite* of the credit rule below, and deliberately so. A
credit balance is a live claim, so the ledger is the truth. A cash-up is an
event that happened, so the snapshot is the truth.

### Profit and credit are never subtracted

`src/core/credit.ts`

Home shows "R2,400 profit" and "R560 owed to you" side by side. Subtracting to
show "R1,840" looks tidier and is **wrong**: the count model already booked the
credit sale as profit when the goods left the shelf. The debt *is* that same
sale, seen from the cash side. Subtracting counts it twice.

They answer different questions — *did I make money?* and *where is the money?* —
and both need to be true at once.

### Expenses must never include stock purchases

`src/core/expenses.ts`, enforced by a `CHECK` in the schema

There is deliberately no `STOCK` expense category. Buying stock is already the
cost side of gross profit: `calculations.ts` values every unit sold at its
`buy_price`. Recording a delivery as an expense too charges the owner twice for
the same goods and invents a loss that never happened.

The database `CHECK` constraint rejects it, and `schema.test.ts` asserts the
category stays impossible.

### Balances are summed, never stored

`src/core/credit.ts`

A customer's balance is computed from the ledger every time, not kept in a
column. Storing it would be faster and is a trap: the day a stored balance and
its ledger disagree, you cannot tell which is right or when it broke. A ledger
alone always reconciles. The ledger is append-only for the same reason —
mistakes are corrected by adding the opposite entry, not by editing history.

---

## Known limitations (not blockers)

- **Expenses are cash-basis.** A month's rent paid on Monday lands entirely in
  that week's summary, so that week looks bad and the next looks good. This is
  what actually happened to the till, so it is honest — but it is not accrual
  accounting, and an owner may find it odd. Worth watching during the pilot.
- **Cash-up needs a stock count to be accurate.** Revenue is inferred from
  counts, so a cash-up with no count since the last one is comparing the till
  against a guess, and the gap is meaningless. The screen warns and lets the
  owner continue. If pilot shops routinely cash up without counting, the warning
  is not enough and the flow needs rethinking — watch for this.
- **Cash-up assumes one till and one person.** There is no shift handover and no
  way to attribute a gap. In a shop where a spouse or child also serves
  customers, a shortfall cannot be traced to a person or a time. That is
  probably the right scope for now, but it limits what the number can tell you.
- **Currency is hard-coded to Rands.** `R` is baked into strings and engines.
  Fine for South Africa; a real change if ShopTrack ever leaves it.
- **No crash reporting.** If the app dies on a shop's phone during the pilot,
  you will not know unless they tell you — and they will not tell you. Consider
  adding something before Day 0, or plan to ask directly at each check-in.
- **Adding an expense category is a schema change.** The category list is a
  `CHECK` constraint, so a new one needs a migration.
- **Pilot build identity:** `app.json` and `package.json` are bumped for each
  installable pilot build so a shop can report exactly which build it has.
