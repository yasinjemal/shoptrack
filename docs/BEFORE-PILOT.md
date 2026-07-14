# Before the Pilot

Things that are deliberately unsafe while ShopTrack has no users, and must be
changed before a real shop puts real data in.

ShopTrack is pre-release. Some code here trades safety for speed on purpose.
That is the right trade *today* and the wrong trade the moment a shop owner
counts their stock into it. This file is the list of those trades, what each
one does, why it exists, and what to do about it.

**If you read one thing, read tripwire 1.**

---

## Tripwire 1: The database erases itself on a schema change

| | |
|---|---|
| **Where** | `src/core/schema.ts` — `ALLOW_DESTRUCTIVE_RESET` |
| **Now** | `true` |
| **Before pilot** | `false` |
| **If ignored** | An app update wipes every shop's books. Silently. |

### What it does

On startup, `initDatabase()` compares the database's `PRAGMA user_version`
against `SCHEMA_VERSION` in the code. If they differ:

- **`ALLOW_DESTRUCTIVE_RESET = true`** → drops every table and rebuilds empty.
- **`ALLOW_DESTRUCTIVE_RESET = false`** → throws, refusing to touch the data.

### Why it exists

The schema is still moving. Adding the credit book and the expenses table were
each a one-line change (`SCHEMA_VERSION = 2`, then `3`) instead of a
hand-written migration that would be thrown away a week later. With no users,
the data being erased is your own test data, and the cost is zero.

### Why it becomes dangerous

A shop's entire book — every count, every debt, every expense — lives in one
SQLite file on one phone. There is no server copy. The moment you ship a build
with a bumped `SCHEMA_VERSION` and this flag still `true`, that file is
deleted on next launch and the owner has no way to get it back. They will not
report it as a bug. They will just stop using the app.

### What to do

1. Set `ALLOW_DESTRUCTIVE_RESET = false`.
2. Run the app against a database at the previous version. It should throw.
3. From then on, every `SCHEMA_VERSION` bump needs a real migration
   (see [Writing a migration](#writing-a-migration-when-you-turn-the-reset-off)).

The throw is the point. It converts "silently destroyed a shop's data" into
"the app won't start on my machine", which you will notice.

---

## Tripwire 2: Backups die when the schema version changes

| | |
|---|---|
| **Where** | `App.tsx` — `handleBackup` writes `version: SCHEMA_VERSION`; `handleRestore` rejects any mismatch |
| **Now** | Backup format version is hard-tied to the schema version |
| **Before pilot** | Decouple them, or write backup upgraders |
| **If ignored** | Every backup a shop has made becomes unrestorable the first time you change the schema |

### What it does

A backup file records the current `SCHEMA_VERSION`. Restore refuses any file
whose version does not match exactly, showing "Backup is too old".

### Why it exists

Post-reset the table shape changes, so an old backup would restore rows that
no longer fit the tables. Refusing is better than restoring a broken shop.

### Why it becomes dangerous

This is the *second-order* effect of tripwire 1, and it survives fixing
tripwire 1. Even with migrations written and the reset turned off, bumping
`SCHEMA_VERSION` still invalidates every backup file already sitting in
someone's WhatsApp. The backup is the shop's only safety net, and the app
tells them to keep it somewhere safe — then stops reading it.

Worse: this fails at the exact moment it matters. A shop restores a backup
because something went wrong. That is when they discover it is unreadable.

### What to do

Pick one:

- **Give backups their own version number** that only changes when the *file
  format* changes, and upgrade old files on restore (the same shape as a
  migration, but for JSON).
- **Or** keep them coupled and write an upgrade path per version, so restore
  transforms an old file instead of rejecting it.

Either way, `RESTORE_OLD_VERSION` should become a genuinely rare last resort,
not the normal outcome of shipping an update.

---

## Tripwire 3: The migration has never run on a real phone

| | |
|---|---|
| **Where** | `src/core/schema.ts`, exercised by `src/core/schema.test.ts` |
| **Now** | Tested against `node:sqlite` in CI-style tests only |
| **Before pilot** | Run on a real Android device with real data |
| **If ignored** | A schema step that works in node may behave differently under expo-sqlite |

### What it does

`schema.test.ts` builds real SQLite databases and asserts the schema is created,
stale versions are rebuilt, and `database/schema.sql` has not drifted from the
code. That is real SQL against a real engine — but it is `node:sqlite`, not the
SQLite that ships inside expo on Android.

### Why it matters

They are different builds of SQLite, with different versions, defaults, and
compile flags. Behaviour around `PRAGMA`s, foreign keys, and `ALTER TABLE` has
changed across SQLite versions. The tests raise confidence; they do not prove
the device case.

### What to do

Before Day 0 of the pilot, on a real Android phone:

1. Install a build, add products, record a count, a credit entry, an expense.
2. Install the next build with a bumped `SCHEMA_VERSION`.
3. Confirm the intended behaviour (rebuild now; migration later).
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

## There are no UI tests, and that has already cost a shipped bug

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

**The real gap remains: nothing renders a component in CI.** Engine tests
answer "is the arithmetic right?", never "can a person use this?". Until that
changes, a feature is not done when the tests pass — it is done when it has been
tapped through on a phone. Budget for that on every feature, and expect the
pilot to find this class of thing.

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

## Writing a migration when you turn the reset off

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
  `CHECK` constraint, so a new one needs a migration once the reset is off.
- **`app.json` version is still `1.0.0`.** Bump it for the pilot build so you
  can tell which build a shop is actually running when something goes wrong.
