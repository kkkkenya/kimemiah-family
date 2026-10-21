# Design Document: Kimemiah Family App

Council: Architect, Advocate, Skeptic, Pathfinder, Strategist, Artisan. Session 2026-10-21. Full positions in `deliberation/round3/`.

## Overview

A family-owned, installable web app (PWA) built with Next.js on Vercel and Supabase, under the owner's existing free-tier accounts. Six members (Mom, sister, two brothers, the owner, and Dad remotely) open it from one link, add it to the home screen, unlock with a family PIN and pick their name once per phone. Every section reads offline and every action except claiming a job or cooking slot can be done offline, syncing on reconnect.

All 8 sections ship in release 1 and launch at family meeting 1. Stock & Shopping, Jobs and Money are built first and deepest. Home, Meeting, Meals and Contacts are plain but correct. Three push notifications at launch. The app never ranks people: no per-person totals, thank-yous go only to the person thanked, and "Needs a volunteer" names the job, not people.

## Architecture

- **Stack:** Next.js (App Router) PWA, every data page client-rendered; Serwist service worker precaches the app shell; Dexie (IndexedDB) holds a local copy of all tables; Supabase Postgres with RLS, one Edge Function (`notify`), pg_cron, pg_net.
- **Sign-in:** each phone signs in to Supabase anonymously. `/api/unlock` checks the family PIN against a bcrypt hash on the server, rate-limited per IP (5 per 15 min) plus a global cap (30 per hour, then 1-hour lock and an alert to the owner). Then "Who are you?" links the device to a member. `is_household()` checks the `devices` row (`revoked_at is null`, `member_id` set) on every request. Lost phone: revoke that device. Leaked PIN: change PIN, which revokes all devices. First unlock needs signal; afterwards the saved session opens offline.
- **Attribution:** `actor_id` is filled by the database from the device's member, overwriting anything the phone sends.
- **Sync:** outbox in Dexie, flushed on open, reconnect, focus and every 30 s while visible (Background Sync tag on Android). One `apply_mutations` RPC, `SECURITY INVOKER`, hard table/column allowlist, idempotent on mutation id, returns a reason for each rejection. Pull by `updated_at` cursor; soft deletes (`deleted_at`) everywhere. Realtime nudges a pull while open.
- **Conflict rules:** stock as +/- movements (sum is the count); money insert-only, corrections via `voids_entry_id`; claims server-checked, first claim wins, online only; everything else last-write-wins per row.
- **Data:** 25 tables and 3 views (`shopping_needed`, `money_balance`, `budget_vs_actual`). See `deliberation/round3/architect.md`.
- **Push:** trigger on `activity` calls `notify` via pg_net with a shared-secret header. `notify` applies quiet hours 21:00-07:00 Nairobi, per-person on/off, global kill switch, 60-second per-person grouping, drops events older than 1 hour, deletes dead subscriptions, logs failures.
- **Scheduled:** pg_cron daily flags jobs unclaimed for N days (default 3) and recreates repeating jobs. Nightly GitHub Action: `pg_dump`, age-encrypted, plus one REST call so the free project doesn't pause.
- **Repo:** `app/(tabs)/{home,shop,jobs,money}`, `app/more/{meals,meeting,contacts}`, `app/unlock`, `app/who`, `app/api/{unlock,revoke}`, `lib/sync`, `lib/supabase`, `supabase/{migrations,seed.sql,functions/notify}`, `scripts/setup-env.mjs`, `.env.example`, `.github/workflows/backup.yml`.

## User Experience

- **Bottom bar:** Home · Shop · Jobs · Money · More. More holds Meals, Meeting, Contacts, Settings and remembers the last one opened. Budget is a tab inside Money.
- **Home ("Today"):** greeting, contact search, at most 5 cards by urgency: items Out, "X is heading to [shop]", open help requests, Today's meals with "I'll cook", Money left.
- **5-second rule:** taps save on the phone first, show "Saved on this phone · will sync", and offer Undo instead of confirm dialogs. Produce uses one-tap OK/Low/Out; packaged goods use +/-.
- **Volunteer mechanics:** Open / Taken / Done; dropping a job asks no reason and sends no alert; "Waiting 3 days · on the next meeting agenda"; one-tap "Asante" thank-you, push to recipient only. Money-in entries can be thanked too.
- **Language:** English with the family's own words (unga, sukuma wiki, mama mboga, fundi, KPLC tokens, Asante). KES 1,250. Tue 21 Oct. Nairobi time.
- **Offline and errors:** offline banner, "N changes not synced" badge, rejected changes listed with a plain reason ("Brian already took this job. Your change wasn't saved."). Claims offline are greyed: "Taking a job needs signal, so two people don't pick the same one."
- **Onboarding (meeting 1):** data pre-loaded, Mom walked through privately first, install to home screen, PIN, pick name, explain the 3 notifications, then Allow; first action is an Asante during the appreciation round; each person taps one low item and watches it sync; log Dad's latest transfer together. Dad gets the link on WhatsApp, PIN sent separately.

## Visual Design and Motion

- **Identity:** warm Nairobi home. Jacaranda purple brand, warm paper (light) / charcoal (dark), chai as decoration, a CSS kanga stripe on the header and thank-you cards only. Status is icon + word + colour (OK green, Low amber, Out red), never the brand colour.
- **Type:** self-hosted Atkinson Hyperlegible Next 400/700 (UI) and Young Serif (titles, thank-yous), 55 KB or less; tabular figures for KES. 48px minimum targets, 56px for stock +/-.
- **Motion (owner's GSAP + Lenis + React Bits stack, sized for budget phones):** GSAP for 9 feedback moments (stock tap, shopping tick, put away, claim confirmed, done + thank-you, tab/sheet, money-left tween, sync banner); React Bits SplitText only, for the daily greeting; Lenis only on money history and the meeting archive with touch smoothing off. Transforms and opacity only, every moment has a reduced-motion fallback, no WebGL, no scroll-linked effects. Tokens and motion table in `deliberation/round3/artisan.md`.
- **Budget:** first load at most ~250 KB; later opens near zero.

## Risk Assessment

| Risk | Mitigation |
|---|---|
| Shared PIN on a public URL | Server-side bcrypt check, per-IP + global rate limits, RLS with no anon access, per-device revoke, change-PIN revokes all |
| Anyone with the PIN can act as any member | Accepted; audit log with device id is the deterrent |
| Money disputes | Insert-only money, voids not edits, `recorded_by` separate from `spent_by`, audit log |
| Data loss on free tier | Nightly encrypted backup, restore tested before launch; keep-alive call |
| Offline edits lost or duplicated | Idempotent mutations, deltas for stock, visible unsynced badge and rejected list, `storage.persist()` |
| Push unreliable | iPhone needs home-screen install (iOS 16.4+); Android battery setting card; push is a bonus, the app works without it |
| Notification fatigue | 3 events only, quiet hours, on/off switch, grouping, kill switch |
| Scope ("everything at once") | Core three built first; meeting date set only after their two-phone checks pass |
| Secrets leak | Server-only keys, setup script with hidden input, git-ignored `.env.local`, bundle scan in checklist |

10-item pre-launch security checklist: `deliberation/round3/skeptic.md`.

## Quality Strategy

- Every build phase ends with a two-phone check (see Build Plan).
- 11-scenario device matrix on a low-end Android, a mid-range Samsung and the family iPhone (`deliberation/round3/pathfinder.md`): offline edits, offline deltas on two phones, claim race, app killed mid-save, push with app closed, quiet hours, cleared storage, Slow 3G cold start, reduced motion + dark, revoked device.
- Automated: database tests for RLS and money insert-only, unit tests for the sync outbox and conflict rules, Playwright for the main journeys.

## Build Plan (Strategist)

| Phase | Scope | Check |
|---|---|---|
| 0 Input | Mom walkthrough; WhatsApp poll (shops, 10-15 meals, contacts, who logs spending, days before flag) | Answers in seed files |
| 1 Foundation | PWA shell, schema, PIN + device auth, picker, outbox, audit log, deploy, backup, setup script | Two phones unlock; revoked phone loses access; correct actor_id; restore works |
| 2 Stock & Shopping | Deltas, OK/Low/Out, list by shop, KES total, "I'm going to", Put away to spend | Two offline phones edit the same item; total right after sync |
| 3 Jobs | Post, claim, drop, done, repeat, flag, Asante | Claim race: first wins, other sees it taken |
| 4 Money | In/out, voids, balance, Budget tab, Summary for Dad | 10,000 in, 2,350 out = 7,650; void restores; edit refused |
| Gate | Set meeting date | Phases 2-4 pass on two real phones |
| 5 Home & Meeting | Today cards, agenda with flagged jobs, notes, decisions to jobs | Flagged job appears on agenda |
| 6 Meals & Contacts | Week grid, I'll cook, copy last week, add ingredients; contacts | Githeri with beans Out adds beans, skips onions |
| 7 Push | 3 events and all safeguards | Android + installed iPhone get "going to market"; nothing at 22:00; kill switch works |
| 8 Polish | Fonts, motion, reduced motion | First load under ~250 KB; reduced motion stops all motion |
| 9 Launch | Meeting 1 | All 6 take one action |

**Release 1.1:** suggested shopping quantities; push for help requests, money received, meeting day; per-type mute. **Later:** receipt photos, bill reminders.

**Success after one month:** 5 of 6 act in week 4; at least 4 different people complete jobs; no job waits over 7 days; balance matches real money within KES 500; no unexpected gas/unga/oil/token run-outs; meeting 2 held with decisions logged.

## Tension Resolutions

| Tension | Agents | Resolution | Reasoning |
|---|---|---|---|
| Offline everywhere vs stock/shopping only | Architect, Skeptic | Read everywhere offline; write everything offline except claims | User asked for it; deltas, insert-only money and soft deletes make conflicts safe; one outbox serves all tables |
| Sign-in model | Architect, Skeptic | Anonymous auth per device + server PIN + device table | No member passwords to store; a lost phone is revoked alone; Skeptic's rate-limit and revocation fixes adopted |
| Fonts and React Bits vs data budget | Artisan, Pathfinder | Two self-hosted fonts (55 KB or less), SplitText only, CountUp replaced by GSAP | Keeps identity and the owner's stack inside a 250 KB first load |
| Meet first vs build first | Strategist, Advocate | Launch at meeting 1; gather input by Mom walkthrough + WhatsApp poll | User chose everything at once; poll keeps "a tool the family chose" |
| Push scope | Strategist, Advocate, Skeptic, Pathfinder | 3 events at launch with safeguards; more in 1.1 | User wants push; thank-you push is the volunteer model's only reward |
| Money vs Meals on the bottom bar | Advocate, Pathfinder | Money on the bar; Meals under More with a Home card | Money is used after every shop and is Dad's main screen; bar stays at 5 tabs |

## Decision Log

| Decision | Options considered | Chosen | Reasoning |
|---|---|---|---|
| Platform | Claude Artifact; own web app; native app | Own PWA (Next.js, Vercel, Supabase) | No Claude accounts needed; family owns it; installable |
| Native wrapper | Capacitor / Play Store; PWA only | PWA only | Store accounts and iPhone fees not worth it for 6 users |
| Who did what under a shared PIN | Nothing; per-device picker | "Who are you?" once per phone, server-set actor_id | Thank-yous, money records and success measures depend on it |
| Money records | Editable; insert-only | Insert-only with voids and audit log | Prevents disputes about edited history |
| Budget | Own section; tab in Money | Tab in Money | Same data, one fewer place to look |
| Produce tracking | Exact counts; OK/Low/Out | OK/Low/Out | Nobody counts tomatoes |
| Meal ingredients to shopping | Defer; simple version | Simple version in release 1 | Adds Low/Out/untracked ingredients; quantities later |
| Backups | Rely on Supabase; own nightly dump | Nightly encrypted pg_dump via GitHub Action | Free tier has no downloadable backups; also prevents pausing |
| Motion | Full stack everywhere; minimal | GSAP for feedback, SplitText once, Lenis on two pages | Honors the stack without slowing budget phones |
