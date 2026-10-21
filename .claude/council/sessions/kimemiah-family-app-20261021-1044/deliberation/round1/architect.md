## Architect Position — Kimemiah family app: architecture, schema, identity, offline sync, push

**Core recommendation:** One Next.js PWA on Vercel talking straight to Supabase (Postgres + RLS + one Edge Function + pg_cron). Phones write locally first into IndexedDB with an outbox, and every table is shaped so sync is boring: client-generated UUIDs, soft deletes, server `updated_at` cursors, and append-only rows (stock movements, money entries) wherever two phones might collide.

**Key argument:**
The data is tiny (6 people, ~60 stock items, a few hundred rows a month), so the hard parts are identity and conflicts, not scale. **Identity:** the shared PIN gates the *device*, a profile picker names the *person*. Each phone calls Supabase anonymous sign-in, so it gets its own auth user. It then posts the PIN to one Next.js route (`/api/unlock`). That route checks a bcrypt hash held in a server env var, rate-limits by device and IP (5 tries, then a 15-minute lockout), and uses the service role to set `app_metadata.household = true` on that device. RLS on every table is one rule: `is_household()` reads that claim. After unlock, "Who are you?" stores `member_id` on the device row and locally. Every write carries `actor_id`, so thank-yous, claims and spending all record a name. This attribution runs on trust inside a family, not on security, and that's fine. Any phone can be revoked by setting `devices.revoked_at`, which clears the claim, without changing the PIN for everyone. **Offline:** Dexie (IndexedDB) mirrors each table. User actions apply locally and append to an `outbox`. A sync loop runs on reconnect, on focus, and every 30 s while online. It pushes the outbox through one RPC, `apply_mutations(jsonb[])`, which is idempotent on mutation id. It then pulls each table `where updated_at > cursor`, and Realtime nudges the pull while the app is open. **Conflict policy, per data type:** (1) Stock is never set as an absolute value. Each +/− is a `stock_movements` row with a delta, and a trigger keeps `stock_items.have_qty` as the running sum, so two offline phones simply add up. (2) Money entries are insert-only, so they never conflict; a correction is a new reversing entry. (3) Claiming a job or a cook slot goes through a server-checked RPC where the first claim wins. A late offline claim comes back rejected and the UI says "Sister already took this." (4) Everything else (titles, notes, contacts, meal slots, budgets) is last-write-wins per row by server receipt order. **Push:** Web Push with VAPID keys. Phones store subscriptions in `push_subscriptions`. An `activity` insert trigger calls the `notify` Edge Function through `pg_net`, and the function sends with `web-push`, skipping the actor's own devices. pg_cron runs daily for three jobs: the 3-day "Needs a volunteer" flag, regenerating repeating jobs, and low-stock or meeting-tomorrow reminders. The same `activity` table drives the Home feed, so one event log serves both. **Repo:** a single app, no monorepo tooling:

```
app/(tabs)/{home,stock,jobs,meals,money}  app/more/{budget,meeting,contacts}
app/api/unlock/route.ts   lib/sync/{db.ts,outbox.ts,pull.ts}   lib/supabase/
supabase/migrations/*.sql   supabase/functions/notify/   supabase/seed.sql (starter stock, jobs, meals)
public/sw (Serwist)   scripts/setup-env.mjs (+ .env.example)
```

**Risks if ignored:**
- *Structural:* If Have is stored as an absolute value, offline edits overwrite each other and stock silently drifts. Without `deleted_at`, the delta pull can't propagate deletes, and removed rows come back as ghosts on other phones.
- *Security/performance:* A 4–6 digit PIN on a public URL can be brute-forced unless the check stays server-side with rate limiting and per-device revocation. Never put the PIN in client JS, and never ship the service-role key to the browser.
- *Integration/platform:* iPhone web push only works after "Add to Home Screen" on iOS 16.4 or later, so install is a hard step in onboarding. Supabase free projects pause after 7 days without activity; daily family use and the daily cron should cover this, but watch it during holidays.

**Dependencies on other domains:**
- **Skeptic/Guardian:** confirm the PIN length, the lockout numbers and the revocation flow, and decide whether money edits are allowed or must use reversing entries.
- **Pathfinder:** Serwist caching strategy, the iOS install prompt, and permission UX for push.
- **Advocate:** the "Who are you?" picker (avatars, switching person on a shared phone), how sync and rejected-claim states appear, and which events notify by default.
- **Artisan/Tuner:** the GSAP + Lenis + React Bits budget on low-end Android. Sync must never wait on an animation.
- **Strategist:** build order. Sync and identity come first, since all 8 sections reuse them.
- **Craftsman:** two-device offline conflict tests for stock deltas and job claims.

---

### Appendix: schema (all tables share `id uuid` client-generated PK, `created_at`, `updated_at` set by trigger, `updated_by → members`, `deleted_at`; no hard deletes; RLS `is_household()` for select/insert/update, no delete policy)

| Table | Key columns |
|---|---|
| `settings` (1 row) | household_name, volunteer_after_days=3, ground_rules text, next_meeting_id |
| `members` | name, colour, avatar, is_remote (Dad), active |
| `devices` | id = auth.uid, member_id FK null, label, last_seen_at, revoked_at |
| `unlock_attempts` | device_id, ip_hash, ok bool, at (rate limiting) |
| `shops` | name, kind (supermarket/market/mama_mboga/wholesaler/other) |
| `stock_items` | name, category, unit, min_qty numeric, usual_price_kes, shop_id FK, have_qty (trigger-maintained cache) |
| `stock_movements` | item_id FK, delta numeric, reason (tap/put_away/correction), trip_id FK null, actor_id |
| `shopping_extras` | title, qty, shop_id, for_meal_slot_id null, added_by, bought_at, bought_by |
| `shopping_trips` | shop_id, member_id, started_at, finished_at ("I'm going to…") |
| `trip_lines` | trip_id, item_id or extra_id, qty_bought, ticked_at |
| `jobs` | title, notes, due_on, repeat (none/daily/weekly/monthly/quarterly), series_id, kind (job/help), claimed_by, claimed_at, done_by, done_at, needs_volunteer_since, from_decision_id |
| `thanks` | target_type (job/meal_slot), target_id, from_member, to_member, message |
| `money_entries` | direction (in/out), occurred_on, amount_kes numeric(12,2), method (mpesa/bank/cash), member_id, shop_id, category_id, trip_id, note, reverses_id null |
| `budget_categories` | name, sort |
| `budgets` | month date, category_id, amount_kes; unique(month, category_id) |
| `meetings` | held_on, host_id, notes text, status (planned/held) |
| `agenda_items` | meeting_id, title, minutes, source (manual/job/help), source_job_id, sort |
| `decisions` | meeting_id, decided_on, text, job_id null |
| `meals` | name |
| `meal_ingredients` | meal_id, item_id, qty; PK(meal_id, item_id) |
| `meal_slots` | day date, slot (breakfast/lunch/supper), meal_id null, custom_name, everyone_out, cook_id; unique(day, slot) |
| `contacts` | name, role, phone text, area, note, is_emergency, sort |
| `activity` | kind, actor_id, ref_table, ref_id, summary (feeds Home + push) |
| `push_subscriptions` | device_id, endpoint unique, p256dh, auth, prefs jsonb |

Views (not tables): `shopping_needed` (low/out items plus open extras, grouped by shop, with an estimated KES total), `money_balance`, and `budget_vs_actual` by month. Indexes: `updated_at` on every table (pull cursor), `stock_movements(item_id)`, `jobs(done_at) where deleted_at is null`, `money_entries(occurred_on)`, `meal_slots(day)`.
