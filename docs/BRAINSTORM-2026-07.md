# Brainstorm — July 2026 (owner ideas + research)

*The owner now runs ShopTrack daily in their own spaza shop in the Eastern Cape —
shop #1 of the pilot. These ideas come from that real use, plus a research pass
(sources at the bottom). Each idea gets: what, why, feasibility, effort, and a
verdict. Effort: **S** = a day or two, **M** = about a week, **L** = multi-week
and/or needs ShopTrack's first server.*

*Nothing here overrides the constitution in [ROADMAP.md](ROADMAP.md): offline-first,
no mandatory accounts, never cap or paywall an existing free feature, record
money but never move it.*

---

## 1. Shop profile — name the shop (S, build now)

The app is identical for every shop: no shop name, no owner name. Every
WhatsApp message the app builds (credit reminders, receipts, reorder sheets)
goes out anonymous, when it should say **"From Nomsa's Shop"** — that is what
makes a reminder feel legitimate to the customer receiving it.

Store `shop_name`, `owner_name`, optional `shop_phone` in the existing
`settings` table, so it travels inside backups (a restored shop keeps its
name). Use it in: the home header, every message builder in
`src/core/messages.ts`, the health-report header, and the backup filename
(`nomsas-shop-2026-07-18.json` beats `shoptrack-backup.json` in a WhatsApp
chat full of them).

No schema change — settings rows already back up. **Verdict: quick win, do
before the photo work.**

## 2. Owner PIN + hidden profit/expenses (S–M, already priority #1)

Decided 2026-07-17. The shop phone lives with the worker for weeks; Expenses,
Sales Book totals, profit cards, and the health report must ask for the
owner's PIN. Staff PINs and `recorded_by` attribution already exist — only the
visibility gate is missing.

## 3. Credit customer photos / ID photos (M, already priority #2)

Decided 2026-07-17. The paper book keeps ID copies; the app should too.
Resize photos before saving (a readable ID photo fits in a few hundred KB) so
backups stay WhatsApp-sized. POPIA: this is *safer* than the paper book —
photos live only on the phone and inside encrypted backups — but store the
minimum, and deleting a customer must delete their photo. Schema + backup
format bump.

## 4. Product photos (M)

Same photo infrastructure as #3, applied to products. The quiet win is
**counting**: a worker or a low-literacy owner recognises a photo faster than
the text "Simba Chips 120g" in a long count list. Optional per product, never
required. Do it in the same change as #3 so the photo plumbing (capture,
resize, storage, backup embedding, deletion) is built once.

## 5. Barcode → automatic product name (M online, L community catalog)

**Researched, feasible with honest limits.** Open Food Facts is a free, open
product database with a keyless JSON API
(`world.openfoodfacts.org/api/v2/product/{barcode}`). It lists **~9,900
South-Africa-tagged products** plus a global database in the millions — big
FMCG brands (Coca-Cola, Simba, Albany…) mostly resolve; local/no-name products
mostly won't. GS1 South Africa runs the official registry but API access is
enterprise-priced on request — not for us now.

Design for the miss, not the hit:

- On scan in Add Product, if there's signal, look up the barcode and **prefill**
  the name — owner can edit or ignore. No signal or no match: the form works
  exactly as today. Cache every successful lookup on the phone.
- **Later, the strategic version:** a ShopTrack community catalog — barcode →
  name/size only (no prices, nothing private), seeded from Open Food Facts and
  grown by every shop that names a scanned product. Spaza-specific products
  that exist in no global database get named once, by one shop, for every
  shop. This is a real moat, but it needs the backend from #6 — park it until
  that exists.

## 6. Optional accounts + cloud restore (L — ShopTrack's first server)

The owner's ask: if a shop loses phone *and* backup, signing back in should
bring the data home. This is the right long-term answer and it is also the
revenue foundation (#7). Constitutional line: **accounts stay optional
forever.** Offline with WhatsApp backups remains the default and stays
first-class; an account only *adds* recovery, the mirror (#8), and later sync.

- **Sign-in order:** Google first (every SA Android phone has a Google
  account, zero per-login cost, no forgotten-password support burden), phone
  OTP second (SMS costs money per message), email+password last or never
  (highest support burden for this audience).
- **Build on Supabase or Firebase** — do not hand-roll auth. Either handles
  Google sign-in + blob storage on a generous free tier.
- **Encryption tension, decide explicitly:** today's cloud-backup client
  encrypts on the phone with a recovery-phrase key — the server *cannot* read
  a shop's books, which is a trust promise worth keeping. An account that can
  restore *without* the phrase means the server holds a key. Offer it as an
  explicit choice at setup: "phrase only (most private)" vs "account can
  recover (easier if you lose the paper)". Never silently the second.

## 7. Revenue — ShopTrack Plus (policy decision + depends on #6)

Research says small merchants **do** pay small monthly amounts: OkCredit's
premium runs ₹30/month (~R7). It also repeats the churn lesson we already
pinned: Khatabook/OkCredit bled users by capping transactions and paywalling
formerly-free features. So:

- **Free forever:** everything that exists today — counting, credit book,
  sales book, expenses, cash-up, WhatsApp backups, health report. No caps, no
  ads, ever.
- **ShopTrack Plus (new capabilities only):** account cloud backup + restore
  by login, the remote "My Shop" viewer (#8), later multi-device sync and
  multi-shop. Anchor price to airtime money — R15–R30/month feels like a data
  bundle, not an accounting bill. Decide the number after the pilot.
- **Second stream, B2B:** distribution partner referrals (Flash ~170k spazas,
  Kazang ~50k, Shop2Shop) paid on the activation metric that already exists —
  partners pay for *active* shops, not installs.
- Still never: ads, transaction fees, payments processing, lending from our
  balance sheet.

## 8. Remote read-only "My Shop" viewer (M–L, decided 2026-07-17)

The away-for-weeks answer: shop phone auto-pushes its encrypted backup (client
already written in `src/net/cloudBackup.ts`, needs the bucket), owner's phone
pulls and views read-only. Single writer, so no merge conflicts. This is the
flagship Plus feature. Stage 0 works today: worker WhatsApps the backup, owner
restores on a viewer-only phone.

## 9. Smaller ideas from the same pass

- **Expense receipt photos** (S once #3's photo plumbing exists) — snap the
  wholesaler slip onto the expense entry.
- **Backup freshness nudge** — already built (7-day home-screen nudge).
- **Multi-shop support** — real for entrepreneurial owners (shop #2 happens);
  park until accounts exist, then it's a natural Plus feature.
- **Anything storefront/marketplace/payments** — still on the do-not-build
  list; the research keeps agreeing.

---

## Build order

| When | What | Effort |
|---|---|---|
| Now, pre/during pilot | #1 Shop profile, #2 Owner PIN | S, S–M |
| Next | #3 Credit photos + #4 product photos (one change), #5 barcode lookup (online prefill) | M |
| The backend epoch | #6 accounts, #8 viewer, #7 Plus launch | L |
| After that | Community catalog, two-way sync, multi-shop | L |

**Decisions the owner still has to make:** Plus price point (after pilot);
Supabase vs Firebase; whether "account can recover without phrase" is offered;
photo size caps.

---

## Sources

- [Open Food Facts — data & API](https://world.openfoodfacts.org/data) and
  [South Africa product count (~9,943)](https://za.openfoodfacts.org/)
- [GS1 South Africa — barcode search](https://gs1za.org/search-barcodes/) and
  [Verified by GS1](https://www.gs1.org/services/verified-by-gs1) (API =
  enterprise, price on request)
- [OkCredit](https://okcredit.com/) premium ₹30/month;
  [Khatabook vs OkCredit comparison](https://blog.slantco.com/khatabook-vs-okcredit-indias-bookkeeping-apps-compared/)
- [Shop2Shop](https://www.shop2shop.co.za/maximise-your-spaza-shop-sales-easily/),
  [Kazang](https://www.kazang.com/),
  [BFA Global — Digital Spazas](https://bfaglobal.com/our-work/digital-spazas-digitizing-and-connecting-informal-spaza-shops-in-south-africas-townships/)
