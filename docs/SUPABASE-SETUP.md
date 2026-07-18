# Supabase Setup — the cloud backup store

*C0 provider decision, 2026-07-18: **Supabase** (over Firebase). Decided on
cost shape (free tier without a card; Pro is flat $25/month with a spend cap
on by default, where Firebase Storage now requires uncapped pay-as-you-go
Blaze), plain-HTTP fit with the existing `HttpCloudBackupStore` contract, one
flat project for storage + auth + edge functions, and an S3-compatible
open-source exit path. Supabase has no South Africa region; London is fine
because backup push/pull is background traffic in an offline-first app.*

The client side is already built and tested: `SupabaseCloudBackupStore` in
[src/net/cloudBackupStore.ts](../src/net/cloudBackupStore.ts) speaks the
storage REST API directly (no SDK), and every construction site goes through
`createConfiguredCloudBackupStore()`. What remains is the browser work below —
about fifteen minutes, once.

**What Supabase ever holds:** encrypted envelopes. Encryption happens on the
phone with a key derived from the recovery phrase; the object id is derived
from the same phrase. Supabase cannot read a shop's books, and neither can we.

---

## 1. Create the project

1. Sign up at [supabase.com](https://supabase.com) (GitHub login is fine).
   The Free plan needs no credit card.
2. **New project** → name `shoptrack`, generate a strong database password
   (store it in your password manager — the app never uses it), region
   **Europe West (London)** (`eu-west-2`). Closest offered to South Africa;
   ~160 ms is irrelevant for background blob transfer.

## 2. Create the bucket

Storage → **New bucket**:

- Name: `shop-backups` (must match `SUPABASE_BACKUP_BUCKET` in
  [src/net/cloudBackupStore.ts](../src/net/cloudBackupStore.ts))
- **Public bucket: OFF**
- Restrict file upload size: **50 MB** (an envelope is the JSON backup plus
  base64 photos; real shops sit far below this)
- Allowed MIME types: `application/json`

## 3. Add the access policies

SQL Editor → New query → run:

```sql
-- The app authenticates as the anon role. It may create, replace, and read
-- backup envelopes in this one bucket. There is deliberately NO delete
-- policy: nothing the app ships can erase a shop's cloud mirror.

create policy "anon can add shop backups"
on storage.objects for insert to anon
with check (bucket_id = 'shop-backups');

create policy "anon can replace shop backups"
on storage.objects for update to anon
using (bucket_id = 'shop-backups')
with check (bucket_id = 'shop-backups');

create policy "anon can read shop backups"
on storage.objects for select to anon
using (bucket_id = 'shop-backups');
```

## 4. Wire the app

Project Settings → API: copy the **Project URL** and the **anon public** key.

Locally, create `.env.local` in the repo root (already gitignored — the repo
is public, keep the key out of it):

```
EXPO_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon public key>
```

For EAS builds, add the same two variables as EAS environment variables
(`eas env:create`) or per-profile `env` entries in [eas.json](../eas.json).
`EXPO_PUBLIC_CLOUD_BACKUP_URL` stays supported as the provider-neutral
fallback; when both are set, Supabase wins.

## 5. Verify (part of the pilot rehearsal)

1. Start the app with the variables set. Settings → cloud backup: save a
   recovery phrase, upload. Storage should show one object named by a long
   hex id.
2. Download/restore on the same device: preview must render before anything
   mutates.
3. **Two-phone proof (C3 gate):** push from the shop phone, then View only
   from a second phone with the same phrase — read-only, no SQLite touched.
4. Airplane mode: upload fails with the offline message, the outbox retries
   on a later launch. Nothing blocks the counting loop.

---

## Honest security posture (pilot)

The anon key ships inside the app, so anyone who extracts it can talk to the
bucket within the policies above. Concretely they can: **list object ids,
upload junk, or overwrite an envelope**. They can not read anyone's books
(encryption), delete anything (no delete policy), or touch a phone (the phone
is the single writer and source of truth; the viewer rejects anything that
fails decryption, so a vandalized mirror degrades to "viewer unavailable
until the next push" — never to wrong numbers).

This is acceptable at pilot scale and is not the end state: **C4 accounts are
the real write-authorization fix** (per-account paths + owner-scoped
policies). Revisit this section when C4 lands.

## Cost posture

Free tier: 1 GB storage / 5 GB egress — hundreds of shops' latest envelopes;
egress only happens when the viewer or a restore pulls. One caveat: **free
projects pause after ~7 days with no traffic.** Daily outbox pushes keep it
warm; if it ever pauses, unpausing is one dashboard click and the app fails
closed meanwhile. The moment real shops depend on the mirror, move to Pro
($25/month) and **leave the spend cap on** — overruns then stop instead of
billing.
