## Skeptic Response to Architect

**Their position:** A Next.js PWA writing to Supabase. Every table is mirrored in Dexie with an outbox and an idempotent `apply_mutations` RPC. Each device gets an anonymous auth user, which is unlocked by a server-checked PIN that sets `household=true`, and devices can be revoked one at a time. Push runs on an `activity` trigger, then `pg_net`, then a `notify` Edge Function, plus a daily pg_cron.

**(1) Offline scope: Modify (I concede full offline).**
The user asked for offline. Architect's data shapes deal with my sync worries: stock as deltas, insert-only money, server-checked claims and soft deletes. The outbox cost is paid once and shared by all 8 sections. Conditions:
- `money_entries` gets no UPDATE policy (corrections are reversing entries only). Today the blanket "select/insert/update" rule would allow edits.
- `apply_mutations` must be `SECURITY INVOKER`, or check against a hard allowlist of tables and columns, and set `actor_id` on the server. A `SECURITY DEFINER` RPC that takes generic jsonb skips RLS entirely.
- Rejected mutations need to show up in the app, and there should be an "N changes not synced" badge.

**(2) Auth: Defer to Architect, with fixes.**
Anonymous auth per device is simpler and safer than my 6 users with server-held passwords. There are no member passwords to store, and you can revoke a lost phone without changing the PIN for everyone. Fixes:
- Rate-limit by IP and with a global cap, not by device. An attacker gets a new anonymous user (and so a new device) on every try, so per-device limits do nothing.
- `is_household()` should check `devices.revoked_at is null` in the table. A JWT claim alone stays valid until the token expires (about 1 hour by default).
- Keep "change PIN plus revoke all devices".
- Supabase's limits on anonymous sign-ups stop sign-up spam; leave them on.

**Offline at unlock** is the same under both designs. The first unlock has to be online, because checking the PIN offline would mean shipping the hash to the phone, and a short PIN is easy to crack offline. After that, the saved session opens the app offline, and the outbox waits for a token refresh. If storage gets cleared, the person unlocks again, which is acceptable.

**(3) Push: Modify.**
Trigger, then `pg_net`, then Edge Function is fine, with these rules:
- The function checks a shared-secret header.
- `pg_net` is fire-and-forget, so log failures to a table.
- Combine bursts: one offline phone syncing 10 mutations must not send 10 pushes. Group per actor over about 60 seconds, and drop pushes for replayed events older than about 1 hour.
- Never include amounts in push text.
- Don't count on in-database pg_cron to keep the project from pausing. The external nightly `pg_dump` takes care of that and the backup.

**Reasoning:** Architect's design is sound and in places better than mine. Per-device revocation is better than a global sign-out every time a phone goes missing. The risks I'm left with sit at the joins: a generic mutation RPC that could get around RLS, a blanket update policy that undoes "append-only money", rate limits keyed on something the attacker controls, and a claim that outlives revocation. Each fix is a few lines of SQL. Once they're in, I accept full offline and anonymous-device auth.
