# ShopTrack

A profit tracker for spaza shops. Offline, no login, no barcodes, no till.

Most shop software asks the owner to record every sale. Nobody with a queue at
the counter is going to do that, so the data is wrong by lunchtime and the app
gets uninstalled. ShopTrack asks for something a shop owner already does:

> **Count what's on the shelf.**

Everything else is inferred from that.

```
sold = stock you had + stock you bought − stock that's left
```

Count on Monday, count on Friday, and the app can tell you what sold and what
it earned — without a single sale being typed in.

**Status: pre-release, under active development.** Not yet piloted in a real
shop. If you are going to run it in one, read
[docs/BEFORE-PILOT.md](docs/BEFORE-PILOT.md) first — some things are
deliberately unsafe right now.

---

## What it answers

Four different questions, kept separate on purpose.

| Question | Where the answer comes from |
|---|---|
| **Did the stock make money?** | `src/core/calculations.ts` — revenue minus what the goods cost |
| **What do I actually keep?** | `src/core/expenses.ts` — the above, minus rent, transport, wages |
| **What am I still owed?** | `src/core/credit.ts` — the book: who owes what |
| **Is the money actually here?** | `src/core/cashup.ts` — count the till, explain the gap |

They are shown side by side and never quietly folded into one number. An owner
whose shelf sold R2,400 but who paid R500 rent and is owed R560 on the book has
not made R2,400 — and has not made R1,340 either. Every number is true, and they
mean different things.

That last question is the one that catches things. A shop can be profitable and
still bleed cash: stock walks, change is given wrong, an expense is paid and
never written down. None of it shows up in profit — the stock left the shelf
either way, so the profit engine books the sale regardless. Only counting the
cash finds it.

### Features

- **Count stock** — the core loop; profit falls out of it
- **Add stock** — record a delivery, with the price you actually paid
- **Credit book (izikweletu)** — who owes what, who paid, who has gone quiet
- **Expenses** — rent, electricity, transport, wages, airtime
- **Cash up** — count the till, see the whole money trail, find what's missing
- **This week** — gross profit, costs, what you kept, top product
- **Recent activity** — what moved, and what's losing money
- **Backup & restore** — a file you can keep in WhatsApp
- **English and Zulu**

---

## Running it

```bash
npm install
npm start          # Expo dev server
npm run android    # or: npm run ios / npm run web
```

### Tests

Pure logic runs in plain node — no simulator, no device, about a second.

```bash
npm test              # everything (190+ assertions)
npm run typecheck

npm run test:calc     # the profit engine
npm run test:credit   # the credit book
npm run test:expenses # expenses and net profit
npm run test:cashup   # the till reconciliation
npm run test:schema   # schema creation, reset, and drift
npm run test:db       # the adapter's real SQL against real SQLite
```

`test:db` exists because SQL is just a string: a query with a wrong column name
typechecks perfectly and fails on a shop's phone. It runs the real statements
against the real schema. That is not hypothetical — it is how a live
`movement_type` bug was caught.

---

## How it's put together

```
App.tsx              Screens and navigation (being split out over time)
src/core/            Pure logic — no SQLite, no React, runs in node
  calculations.ts      sold / revenue / gross profit / confidence
  credit.ts            balances, outstanding, stale debts
  expenses.ts          category totals, net profit
  cashup.ts            expected cash, reconciliation
  schema.ts            table definitions — source of truth
  db.ts                the only file that knows about SQL
src/ui/              Screens and styles, one folder per feature
database/schema.sql  Reference copy of the schema, pinned by a drift test
docs/                Design notes, pilot plan, pre-pilot tripwires
```

Two rules hold this together:

1. **`src/core/*` never imports SQLite or React.** That is why the engines are
   testable in node in a second, and why the tests are worth writing.
2. **`db.ts` is the only place SQL lives.** Screens call functions, not queries.

New features follow the same split: `src/core/<feature>.ts` for the logic,
`src/ui/<feature>/` for the screens.

`database/schema.sql` is documentation, and documentation that quietly
disagrees with the code is worse than none — so a test builds both and fails if
they drift apart.

---

## Design decisions worth knowing

Several things look like bugs and are not. Each has a test holding it in place;
[docs/BEFORE-PILOT.md](docs/BEFORE-PILOT.md) explains them in full.

- **Profit and credit are never subtracted.** The count model already booked the
  credit sale when the goods left the shelf. Subtracting the debt counts it twice.
- **Stock purchases are not expenses — but they *are* cash-out.** `expenses.ts`
  refuses them (they're already the cost side of profit; counting them twice
  fakes a loss). `cashup.ts` counts them (handing cash to a supplier empties the
  till). Profit and cash disagree about what stock is, and both are right.
- **Balances are summed, never stored.** A stored balance that disagrees with its
  ledger cannot be untangled later. The ledger is append-only.
- **A cash-up's expected figure *is* stored.** The opposite of the rule above,
  on purpose: a balance is a live claim, a cash-up is an event that happened.
  Recomputing it later would rewrite history.

---

## Contributing

The pilot plan in [docs/PILOT-TRACKER.md](docs/PILOT-TRACKER.md) is the compass:
3–5 real shops, 14 days, and one question — *"did this help you?"*

Before adding anything, it is worth asking whether a shop owner with a queue at
the counter would actually do it.
