## Architect Final Position — Kimemiah family app

**Revised recommendation:** One Next.js PWA on Vercel talking directly to Supabase. Each phone gets its own anonymous auth user and is unlocked by a server-checked family PIN. The person is named by a "Who are you?" picker, and the database fills in `actor_id` itself. The app reads every section offline and accepts offline writes for every action except claims. Data shapes keep sync simple: stock as deltas, money as insert-only rows, and last-write-wins per row for everything else.

**Concessions made:**
- *Auth goes back to anonymous-per-device, with Skeptic's fixes.* Rate limiting is per IP plus a global cap of 30 failures an hour, which locks sign-in for an hour and pushes an alert to the owner. It is no longer per device, because a fresh anonymous user per attempt would get around that. `is_household()` reads `devices.revoked_at` from the table, not a JWT claim, so revoking a phone takes effect on the very next request. Why: per-device revocation for a lost phone beats signing out all 6 people.
- *Offline writes cover every action except claims.* My Round 2 narrowing goes too far for a household with patchy signal. The conflict risk was always in four places, and each has its own rule.
- *Money:* no UPDATE or DELETE policy at all. Corrections only through `voids_entry_id`.
- *Push:* 3 events at launch. Amounts never appear in the text.

**Non-negotiables:**
1. **`actor_id` is never trusted from the client.** A column default `current_member_id()` reads `devices.member_id` for `auth.uid()`, and a trigger overwrites any value the client sends.
2. **`apply_mutations` is `SECURITY INVOKER`**, so RLS still applies to every row. It also has a hard allowlist of tables and columns and is idempotent on mutation id. Each rejection comes back with a reason the app can show.
3. **Claims are server-checked and need a connection.** `claim_job` and `claim_cook_slot` both use an atomic `update … where claimed_by is null`.
4. **Soft deletes plus pulls by `updated_at` cursor everywhere.** Without them deletes never reach other phones, and removed rows reappear.

**Implementation notes:**
- **First unlock needs a connection.** The saved Supabase session (refresh token kept for about 90 days) then opens the app offline. "Change PIN" sets `revoked_at` on every device in one go.
- **Sync loop:** runs on reconnect, on focus, and every 30 s while online. Realtime nudges a pull while the app is open. The app shows an "N changes not synced" badge and a rejected-changes list.
- **Push:** an `activity` insert trigger calls `notify` through `pg_net` with a shared-secret header. `notify` does the following:
  - applies quiet hours (21:00–07:00 Nairobi time), each person's on/off switch and the kill switch in `settings`
  - groups bursts per person over about 60 s
  - drops events older than 1 hour
  - deletes subscriptions that return 404 or 410
  - logs failures
- **pg_cron, daily:** sets the 3-day "Needs a volunteer" flag and recreates repeating jobs.
- **Backups:** a nightly GitHub Action runs `pg_dump`, encrypts it with age, and sends one REST call so the free project doesn't pause. One test restore before launch.
- **Secrets:** `scripts/setup-env.mjs` asks for each value with hidden input and checks it, and `.env.example` lists the names. Secrets: PIN hash, service key, VAPID private key, notify secret.

### Final table list
All tables share: a client UUID `id`, `created_at`, `updated_at` (set by trigger), `deleted_at`, and `actor_id` (set on the server). RLS everywhere uses `is_household()`. No delete policies.

| Table | Key columns |
|---|---|
| settings (1 row) | volunteer_after_days, ground_rules, push_kill_switch, pin_version |
| members | name, colour, is_remote, active |
| devices | id=auth.uid, member_id, label, last_seen_at, revoked_at |
| auth_failures | ip_hash, at |
| shops | name, kind |
| stock_items | name, category, unit, min_qty, usual_price_kes, shop_id, track_mode (count/level), level (ok/low/out), have_qty (cache kept by trigger) |
| stock_movements | item_id, delta, reason, trip_id |
| shopping_extras | title, qty, shop_id, for_meal_slot_id, bought_at |
| shopping_trips | shop_id, member_id, started_at, finished_at |
| trip_lines | trip_id, item_id or extra_id, qty_bought, ticked_at |
| jobs | title, notes, due_on, repeat, series_id, kind (job/help), claimed_by, claimed_at, done_by, done_at, needs_volunteer_since, from_decision_id |
| thanks | target_type, target_id, to_member, message |
| money_entries | direction, occurred_on, amount_kes, method, spent_by, shop_id, category_id, trip_id, note, voids_entry_id (insert-only) |
| budget_categories | name, sort |
| budgets | month, category_id, amount_kes; unique(month, category_id) |
| meetings | held_on, host_id, notes, status |
| agenda_items | meeting_id, title, minutes, source, source_job_id, sort |
| decisions | meeting_id, decided_on, text, job_id |
| meals | name |
| meal_ingredients | meal_id, item_id, qty |
| meal_slots | day, slot, meal_id, custom_name, everyone_out, cook_id; unique(day, slot) |
| contacts | name, role, phone, area, note, is_emergency, sort |
| activity | kind, ref_table, ref_id, summary (feeds Home and push) |
| push_subscriptions | device_id, endpoint, p256dh, auth, enabled |
| audit_log | table_name, row_id, op, old, new, actor_id, device_id |

Views: `shopping_needed`, `money_balance`, `budget_vs_actual`.

### Repo layout
```
app/(tabs)/{home,shop,jobs,money}/        money/ holds Budget as a tab
app/more/{meals,meeting,contacts}/
app/unlock/  app/who/                      PIN screen, profile picker
app/api/{unlock,revoke}/route.ts
lib/sync/{db.ts,outbox.ts,pull.ts,claims.ts}
lib/supabase/{client.ts,server.ts}
supabase/migrations/*.sql  supabase/seed.sql  supabase/functions/notify/
public/sw.ts (Serwist)
scripts/setup-env.mjs  .env.example  .github/workflows/backup.yml
```
