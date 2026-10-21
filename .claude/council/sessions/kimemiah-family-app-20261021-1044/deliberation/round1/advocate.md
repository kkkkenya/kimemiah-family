# Advocate Position — Kimemiah family app UX

**Core recommendation:** Build every screen around a five-second job done on a cheap Android phone, often offline, with no question of "who am I" and no chance of public shame. Ship all 8 sections, but only three need to feel great on day one: the stock tap, the market run, and picking up a job. The rest can be plain and still correct.

**Key argument:**
Mom opens the app while cooking and sees the unga is nearly finished. She taps **−**, the item turns amber, and an "Undo" bar appears for 5 seconds. No confirmation dialog, no spinner, no sign-in prompt, and it works with no data bundle. If that tap ever takes longer than the 5 seconds it would take to shout "unga imeisha!" across the house, people stop using the app, and a stock list that is wrong is worse than no list. The same goes for everything else: attribution has to be automatic (the shared PIN plus a "Who's using this phone?" name picker, asked once per device and remembered, switchable from the avatar), and actions save on the phone first and sync afterwards, with a small "Saved on this phone · will sync" chip instead of error popups. The sensitive part is the social layer. In this house, money comes from Dad and three of five adults don't earn. The app must never turn into a scoreboard. That means **no per-person totals anywhere**: no "jobs done by Sam: 12", no "spent by person" chart. The "Needs a volunteer" flag describes the job ("waiting 3 days"), never the people. Dropping a job is neutral ("Back on the board"). A thank-you is one tap (an **Asante** button with an optional short note) that only the recipient gets as a notification. Money-in entries can be thanked too, so Dad sees gratitude, not just a ledger. Spending entries stay strictly factual, as 01 already says.

**Revisions to earlier plan decisions:**
- **Navigation:** the bottom bar stays at 5 (Home, Stock, Jobs, Meals, Money). Budget becomes a tab *inside* Money (it is about the same money), so More holds only Meeting and Contacts. Contacts also become searchable from Home, because a fundi number is needed in a hurry.
- **Home becomes "Today":** at most 5 cards, ordered by urgency (Out items, someone heading to the shop, open help requests, today's cook, money left). Thank-yous go on the Jobs tab, not Home, so nobody's absence from them is on display every morning.
- **Stock entry:** keep + / −, but add a tap on the status chip to set **OK / Low / Out** in one go for produce (nobody counts sukuma bunches). Exact counts stay for packaged goods.
- **Language:** English UI using the family's own words for items and roles (unga, sukuma wiki, mama mboga, fundi, KPLC tokens), plus "Asante" on the thank-you button. No Swahili toggle in v1. Money is shown as **KES 1,250** (no decimals, comma thousands), dates as **Tue 21 Oct**, everything in Africa/Nairobi time.
- **Motion:** GSAP for the tick, the undo bar and a small thank-you burst only. Turned off under reduced-motion and kept off the stock list for budget phones. React Bits is fine for the thank-you moment, not for core lists.

**Notifications: send / never send**
- Send: "Brian is going to the market in ~20 min, add requests" (the most valuable one). Gas or tokens hit **Out**. A help request is posted. Someone thanked *you*. Money received (to everyone, neutral wording). Meeting day at 9am. The monthly summary to Dad.
- Never: unpicked-job nags, a push for every Low item, "you haven't opened the app", personal reminders sent by other people, spending alerts, anything comparing people. Quiet hours 21:00 to 07:00, and each person can mute each type in settings.

**Onboarding at the meeting:** load the starter stock, jobs and meals before the meeting so nobody's first screen is empty. Do a private walkthrough with Mom first. At the meeting, the steps go open link → Add to Home Screen (iPhone push only works after this) → PIN → pick your name → allow notifications, asked *after* saying which ones they'll get. Their first tap comes during the existing **appreciation round**, where each person sends one Asante in the app, so the first experience is warmth rather than a chore. Dad gets the link on WhatsApp with three screenshots and a "Money" deep link.

**Risks if ignored:**
- Attribution friction or slow taps make people stop updating within two weeks, and the stock list drifts away from reality.
- Per-person counts, or nags about unpicked jobs, turn "volunteer, don't assign" into public guilt for the members who don't earn, and they quietly stop opening it.
- If Add to Home Screen is skipped at the meeting, iPhone users never get push and the market-run coordination fails.

**Dependencies:**
- **Architect:** a local-first store with optimistic writes. A device-level "current member" setting under the shared PIN. Conflict rule for stock is "last tap wins plus a visible history" (counts change by deltas, not overwrites).
- **Pathfinder:** PWA install flow, web push on Android and on iOS 16.4+, quiet hours, deep links.
- **Skeptic/Guardian:** the PIN design must not add a sign-in step to every visit (long-lived device session).
- **Artisan/Tuner:** 48px touch targets, WCAG AA contrast in both themes, colour plus label for status (never colour alone), motion budget for low-end phones.

---

## Appendix: journey maps

### J1. Daily stock tap (Mom, offline, mid-task)
| Step | Action | System response | Emotion |
|---|---|---|---|
| 1 | Opens app from home screen | Today shows; no PIN (device remembered) | Neutral |
| 2 | Taps Stock, finds Cooking oil (search or category) | List loads from local store instantly | Confident |
| 3 | Taps − | Item turns amber "Low"; Undo bar 5s; goes on shopping list | Satisfied |
| Err | No network | "Saved on this phone" chip; syncs later | Unbothered |
| Err | Mis-tap | Undo; history shows "Mom −1, 10:42" | Relieved |
Friction: finding items in a list of 50+, so sort by most-recently-tapped. Delight: oil appears on the shopping list without anyone typing it.

### J2. Market run (brother, 25)
| Step | Action | System response | Emotion |
|---|---|---|---|
| 1 | Shopping → "I'm going to Market" | Push to others; list is locked to him as shopper | Purposeful |
| 2 | Others add requests within ~20 min | Items appear live, tagged with who asked | Included |
| 3 | Ticks items at the market (offline) | Ticks saved locally; running KES total | In control |
| 4 | Home → "Put away" | Stock goes up; spend form prefilled with total, shop, his name, category split | Quick |
| 5 | Confirms spend | Balance updates; Mom can tap Asante | Appreciated |
Err: an item isn't available, so mark it "Not found" and it stays on the list. Friction: entering the spend, so prefill everything and make the amount the only required edit.

### J3. Picking up a job (sister, after work)
| Step | Action | System response | Emotion |
|---|---|---|---|
| 1 | Jobs tab | Open jobs first; "waiting 3 days" tag on old ones, no names | Calm |
| 2 | "I'll do it" | Card shows her name; others see it taken | Committed |
| 3 | "Done" | Tick animation; repeating job rescheduled | Accomplished |
| 4 | Someone taps Asante | She gets one push: "Mom said asante for Clean bathroom" | Valued |
Alt: "Drop it", and it goes back on the board with no reason asked and no notification. Empty state: "Nothing open. The house is sorted." Delight: thank-yous feel personal and private, not ranked.
