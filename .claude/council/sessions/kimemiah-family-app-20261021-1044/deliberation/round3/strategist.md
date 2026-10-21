## Strategist Final Position: Kimemiah family app scope and sequencing

**Revised recommendation:** Release 1 has all 8 sections and launches at family meeting 1. Stock and Shopping, Jobs, and Money are built first and to full depth. The meeting date is set only after those three pass their two-phone checks. Everything else is built to "plain but correct."

**Concessions made:**
- Launch at meeting 1, not meeting 2. Input comes from Mom's private walkthrough and a WhatsApp poll before data is loaded.
- Push at launch goes from 1 event to 3 (shop run, gas/tokens Out, thanked you).
- Offline writes cover every action except claims. One mutation queue serves all tables, so the extra cost is small.
- Meals gets the simple ingredients-to-shopping button, plus copy last week.

**Non-negotiables:**
- Build order: foundation, then the core three, then the rest. Polish and motion come last.
- The meeting-date gate.
- One `activity_log`/`audit_log` with a server-set `actor_id`. Without it there is no attribution, no thank-yous and no success measures.
- Suggested quantities, extra push types, per-type mute, receipts and bill reminders stay in 1.1 or later.

**Implementation notes: final build order**

| Phase | Scope | Verify check |
|---|---|---|
| 0. Input | Mom walkthrough; WhatsApp poll: shops, 10–15 meals, contacts, who logs spending, days before a job is flagged | Answers written into seed files |
| 1. Foundation | Next.js PWA shell, Supabase schema, anonymous auth per device + PIN (rate limits, revoke), "Who are you?" picker, mutation queue, audit log, Vercel deploy, nightly encrypted backup | Two phones unlock; one is revoked and loses access; a write shows the correct `actor_id`; one test restore succeeds |
| 2. Stock and Shopping | +/− deltas, OK/Low/Out chip for produce, list grouped by shop, KES total, "I'm going to [shop]", Put away with prefilled spend | Both phones offline, each changes the same item, both sync and the total is right; Low item appears on the other phone's list; Put away raises stock |
| 3. Jobs | Post, claim (online, first claim wins), drop, done, repeat, "waiting N days" flag, Asante | Two phones claim the same job at once: one wins, the other sees it taken; done, then thanked, and the thank-you appears |
| 4. Money | Insert-only in/out, voids, balance, Budget tab, Summary for Dad | KES 10,000 in, 2,350 out: balance 7,650; a void restores it; an UPDATE is refused; summary text matches |
| **Gate** | Set meeting date | Phases 2–4 pass on two real phones |
| 5. Home + Meeting | Today cards (Money left, Today's meals), agenda with auto-added flagged jobs, notes, decisions log | A flagged job appears on the agenda |
| 6. Meals + Contacts | Week grid, I'll cook (online claim), copy last week, add ingredients (Low/Out/untracked); contacts with copy button and pinned emergency numbers | Githeri with beans Out: beans added "for githeri", onions (OK) skipped |
| 7. Push | 3 events, quiet hours, on/off per person, kill switch, coalescing, shared-secret header | Android and installed iPhone both receive "going to market"; nothing arrives at 22:00; the kill switch stops all pushes |
| 8. Polish | Fonts, SplitText greeting, GSAP ticks, reduced-motion | First load under ~250 KB; reduced-motion turns all motion off |
| 9. Launch | Meeting 1: install, PIN, name, allow push, first Asante | All 6 members (Dad by WhatsApp link) take one action |

**Release 1.1, based on what the activity log shows:** suggested shopping quantities; push for help requests, money received and meeting day; per-type mute; decision-to-job if not done earlier.
**Later:** receipt photos, bill reminders, budget forecasting.

**Success measures, one month after meeting 1:**
- **Adoption (north star):** at least 5 of 6 members take an action in week 4.
- **Fairness:** at least 4 different people complete jobs; no job waits longer than 7 days by meeting 2. No per-person totals are shown in the app; these are counted from the log only.
- **Money trust:** app balance matches real cash/M-Pesa within KES 500 at month end; summary sent to Dad.
- **No surprises:** zero unexpected run-outs of gas, unga, oil or tokens.
- **Habit:** meeting 2 is held and its decisions are logged.
