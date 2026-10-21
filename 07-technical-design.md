# Technical design

Agreed by the council on 2026-10-21. Full reasoning: [.claude/council/sessions/kimemiah-family-app-20261021-1044/design.md](.claude/council/sessions/kimemiah-family-app-20261021-1044/design.md).

## Stack

| Part | Choice |
|---|---|
| App | Next.js (App Router), installable PWA, every data page rendered on the phone |
| Offline shell | Serwist service worker precaches the app; never caches database responses |
| Local data | Dexie (IndexedDB): a copy of every table plus an outbox of unsynced changes |
| Database | Supabase Postgres with row-level security on every table |
| Server code | Next.js route handlers (`/api/unlock`, `/api/revoke`), one Supabase Edge Function (`notify`) |
| Scheduling | pg_cron (daily job flags and repeats), pg_net (calls `notify`) |
| Push | Web Push with VAPID keys (`web-push`) |
| Animation | GSAP (+ `@gsap/react`, Flip, DrawSVG), Lenis, React Bits SplitText |
| Hosting | Vercel (Hobby), Supabase (Free), GitHub `kkkkenya/kimemiah-family` (private) |

## Sign-in

1. A phone opens the app and signs in to Supabase **anonymously** (its own user id).
2. The family PIN goes to `/api/unlock`, which checks it against a bcrypt hash on the server. Limits: 5 failures per IP per 15 minutes; 30 failures in an hour from anywhere locks unlocking for an hour and alerts the owner.
3. On success the phone gets a `devices` row. "Who are you?" sets its `member_id`.
4. Every database rule checks `is_household()`: the caller's device exists, isn't revoked and has a member.
5. The session is saved, so the app opens offline afterwards. The first unlock needs signal; the PIN is never checked on the phone.
6. Lost phone: remove it in Settings > Devices. Leaked PIN: change it, which signs out every phone.

**Accepted risk:** anyone with the PIN can pick any name. The activity log (with device id) records everything.

## Sync

- Changes go into the outbox and are sent by one `apply_mutations` database call when the app opens, reconnects, comes to the front, and every 30 seconds while open. Android also gets Background Sync.
- `apply_mutations` runs with the caller's own permissions (row rules still apply), only accepts listed tables and columns, ignores a change it has already applied, and returns a reason for anything it rejects.
- Phones pull rows changed since their last sync. Rows are never really deleted (`deleted_at`), so deletions reach every phone.
- The app shows "N changes not synced yet" and lists rejected changes in plain words.

**Conflict rules**

| Data | Rule |
|---|---|
| Stock counts | Stored as +/− movements; the count is their sum, so two offline phones add up correctly |
| Money | Insert only. No edit or delete permission exists. Corrections are new entries that void the old one |
| Taking a job or cooking slot | Checked on the server, first one wins, needs signal |
| Everything else | Last change wins, per row |

`actor_id` on every row is set by the database from the device's member, whatever the phone sends.

## Data

All tables have: `id` (made on the phone), `created_at`, `updated_at`, `deleted_at`, `actor_id`.

| Table | Purpose |
|---|---|
| settings | Days before a job is flagged, ground rules, push kill switch, PIN version |
| members | The six people |
| devices | Signed-in phones, their member, revoked or not |
| auth_failures | Failed PIN attempts (hashed IP) |
| shops | Supermarket, market, mama mboga, wholesaler |
| stock_items | Name, category, unit, minimum, price, shop, count or OK/Low/Out mode |
| stock_movements | +/− changes to stock |
| shopping_extras | One-off shopping items, optionally for a meal |
| shopping_trips, trip_lines | "I'm going to", ticked items, put away |
| jobs | Jobs and help requests: due, repeat, taken by, done by, waiting since |
| thanks | Asante to a person for a job, meal or money in |
| money_entries | Money in and out, insert only, voids |
| budget_categories, budgets | Monthly budget per category |
| meetings, agenda_items, decisions | Family meetings |
| meals, meal_ingredients, meal_slots | Saved meals and the week grid |
| contacts | House phone book |
| activity | Feed for Home and push alerts |
| push_subscriptions | Each phone's push address |
| audit_log | Every change: table, row, before, after, who, which device |

Views: `shopping_needed`, `money_balance`, `budget_vs_actual`.

## Push alerts

- A new `activity` row triggers `notify` (Edge Function) with a shared secret.
- `notify` skips the person who did the action, respects quiet hours (21:00 to 07:00 Nairobi), each person's on/off setting and the kill switch, groups bursts per person over about a minute, skips events older than an hour (old offline changes syncing), and removes dead subscriptions.
- Alert text never includes money amounts.

## Backups

- A nightly GitHub Action dumps the database (`pg_dump`), encrypts it with `age` and stores it. The same Action calls the API once so the free project never pauses for inactivity.
- One restore into a scratch project is tested before launch.

## Secrets

Never typed into chat, never committed.

- `scripts/setup-env.mjs` asks for each value with hidden input. Pressing Enter keeps the existing value. It writes a git-ignored `.env.local`.
- `.env.example` lists the names only:
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FAMILY_PIN_HASH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_SHARED_SECRET`, `BACKUP_AGE_RECIPIENT`.
- The PIN is typed twice, must be 6+ digits and not trivial, and is stored only as a hash. VAPID keys and the notify secret are generated by the script.
- The script checks each value (Supabase health call, service key admin call, VAPID keys parse) and says clearly what's wrong.
- It can also copy the values to Vercel and GitHub secrets.

## Repo layout

```
app/(tabs)/home  shop  jobs  money        Budget is a tab inside money
app/more/meals  meeting  contacts  settings
app/unlock  app/who                      PIN screen, "Who are you?"
app/api/unlock  app/api/revoke
lib/sync/      db.ts outbox.ts pull.ts claims.ts
lib/supabase/  client.ts server.ts
supabase/migrations/  supabase/seed.sql  supabase/functions/notify/
public/sw.ts
scripts/setup-env.mjs  .env.example  .github/workflows/backup.yml
```
