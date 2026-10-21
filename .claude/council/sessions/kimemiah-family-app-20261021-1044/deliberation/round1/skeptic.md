## Skeptic Position: Kimemiah family app (shared PIN, money records, offline, push, all 8 sections)

**Core recommendation:** Keep the shared PIN, but treat it as a gate and not an identity. Check it on the server, rate-limit it, and add a "Who's using this phone?" picker so every action is attributed. Make money and stock records append-only, and take nightly off-Supabase backups. The bigger risk is scope: offline sync and push for all 8 sections in release 1 is where this project actually fails.

**Key argument:**
Six months from now, the likely failure is not a hacker. One of three things happens. (1) A dispute: "who logged KES 3,000 at Naivas?", and nobody can answer, because everyone signed in as "the family" and someone edited or deleted the row. (2) Data loss: two phones changed stock offline and last-write-wins dropped one change, or iOS Safari cleared a non-installed site's IndexedDB queue after 7 days without use, or the free Supabase project paused or broke and nobody had a backup (the free tier has no downloadable backups). (3) The app never shipped, because offline sync, push and auth were built across 8 sections at once. A shared PIN on a public URL is a real but modest risk if it is checked server-side and throttled. Nothing here can move money. The worst disclosure is family names, contacts and household spending. That deserves care, not bank-grade security.

**Minimal PIN hardening (keeps the user's choice):**
- PIN of at least 6 digits, stored only as an argon2/bcrypt hash on the server. Never compare it in client code.
- Check it in a Next.js route handler. Rate limit: 5 failures per IP per 15 minutes, plus a global cap (say 30 failures an hour) that locks sign-in for an hour and sends a push to the user.
- After a correct PIN, the person picks their name. Server-side, the route signs in as that member's own Supabase Auth user (6 users with random passwords the server holds), so you get real per-member sessions, refresh tokens and `auth.uid()` for RLS. Long-lived device session, about 90 days.
- RLS on every table: `authenticated` only, with no anon policies at all, so the public anon key exposes nothing. Keep the service-role key server-only (never `NEXT_PUBLIC_`). Put the PIN hash, service key and VAPID private key in a git-ignored `.env`, with a setup script and `.env.example` as CLAUDE.md requires.
- "Change PIN" plus "Sign out all devices" (Supabase admin global sign-out for all 6 users). Use it when the PIN leaks, which with 6 people it will.
- Set `noindex`, and keep Vercel Deployment Protection on preview URLs (previews use the same database).

**Push back on overbuild:**
- **Offline for everything is overbuilt.** Make offline writes work only where signal fails: stock +/-, shopping ticks and "Put away", and queued money entries. Everything else is a read-only cache. Store stock changes as deltas (`stock_movements`: +2 / -1, client UUID, idempotent insert) instead of overwriting `have`. That removes most conflict handling. Show an "N changes not synced" badge.
- **Push: keep it to 3 events at most** ("I'm going to [shop]", a job needs a volunteer, a meeting reminder). iOS only delivers push to a PWA added to the home screen (16.4+), and permission must come from a tap. Subscriptions expire, so delete them on a 404/410. Vercel Hobby cron runs once a day, which suits the 3-day volunteer flag. Never put money amounts in a push payload, because lock screens show them.
- **"All 8 at once":** fine as a goal for the meeting, but build the core first (stock/shopping, jobs, money, auth, backups). Meals, contacts, meeting and budget are mostly simple CRUD on top. Push and offline go in a hardening pass after that, not alongside it. Lenis smooth scroll and heavy React Bits effects on budget Android phones work against a daily-use tool. Motion should stay light.

**Risks if ignored:**
- **High (integrity/family trust):** with editable, unattributed money rows, nobody can settle a spending dispute, and the summary sent to Dad stops being trustworthy.
- **High (data loss):** last-write-wins sync plus no backups means silent loss of stock and money history, and it can't be recovered.
- **High (scope):** offline, push and PIN-auth across 8 sections means the meeting date slips, or it ships fragile and the family drops it after week one.

**Dependencies on other domains:**
- Architect: an append-only `money_entries` table with `voids_entry_id` corrections, `created_by` and `device_id`; a `stock_movements` delta log; an `audit_log` written by a trigger.
- Operator: a nightly GitHub Action that runs `pg_dump` into encrypted storage (it doubles as a keep-alive ping), the setup script, and a restore drill once.
- Pathfinder: the iOS install-to-home-screen prompt, the storage-eviction caveat, and which push events to send.
- Craftsman: sync tests (two offline devices, the same item, replay twice, and the expected final count).
- Advocate: an easy name picker and "switch person" so attribution doesn't add friction.

### Appendix: Threat table

| Threat (STRIDE) | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PIN leaked or shared outside the family (S) | Likely | Moderate | Change PIN, sign out all devices, alert on failures |
| Online PIN brute force (S) | Possible | Moderate | 6+ digits, per-IP and global rate limits, lockout |
| Anon key used to read tables directly (I) | Likely if RLS is missed | Severe | RLS on every table, no anon policies, run Supabase advisors in CI |
| Service key or VAPID key leaks via client bundle or repo (E) | Possible | Severe | Server-only env vars, git-ignored `.env`, secret scanning |
| Money row edited or deleted in a dispute (T/R) | Likely | Moderate | Append-only ledger, void plus re-entry, audit log with member and device |
| "Spent by" set to someone else (R) | Possible | Moderate | Record the signed-in member separately from "spent by" |
| Offline conflict drops stock changes (T) | Likely | Minor to moderate | Delta movements, idempotent client UUIDs |
| Unsynced queue evicted (iOS 7-day rule) (D) | Possible | Moderate | Install as PWA, unsynced badge, sync on open |
| Supabase pause, outage or accidental drop (D) | Possible | Severe | Nightly encrypted `pg_dump`, tested restore |
| Push leaks amounts on lock screen (I) | Likely | Minor | Generic push text, no amounts |
| XSS via notes or thank-yous (T) | Unlikely | Moderate | React escaping, no `dangerouslySetInnerHTML` |
| Preview deployment publicly reachable (I) | Possible | Moderate | Vercel Deployment Protection on previews |

**Residual risk accepted:** anyone with the PIN and a phone can act as any member. In a 6-person family the audit log, not cryptography, is the deterrent. That trade-off is reasonable for this app.
