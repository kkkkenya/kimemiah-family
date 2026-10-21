# Build plan

## How it works

- **Our own web app**, not a Claude Artifact. Built with Next.js, hosted on Vercel, data in Supabase. All on the owner's existing free accounts, code in the private GitHub repo `kkkkenya/kimemiah-family`.
- **Installs like an app.** Open the link, add it to the home screen, and it opens full-screen with its own icon. No Play Store, no Claude accounts.
- **Family PIN plus "Who are you?".** Each phone unlocks once with the family PIN (needs signal), then picks its owner's name. After that it stays signed in and opens even offline.
- **Works offline.** Every section can be read and changed without signal, except taking a job or cooking slot. Changes sync when signal returns.
- **Push alerts** on Android, and on iPhones with iOS 16.4+ after adding to the home screen.

Technical detail is in [07-technical-design.md](07-technical-design.md). Look and motion are in [08-design-system.md](08-design-system.md). Pre-launch checks are in [09-launch-checklist.md](09-launch-checklist.md).

## Phases

Each phase ends with a check on two real phones that must pass before the next one starts. Stock, Jobs and Money are built first and fully. The rest are plain but correct.

| Phase | What gets built | Check |
|---|---|---|
| **0. Input** | Walk Mom through the plan privately. WhatsApp poll: shops we use, 10 to 15 usual meals, contacts, who logs spending, days before a job is flagged | Answers written into the starter data |
| **1. Foundation** | App shell that installs and works offline, database, PIN unlock, "Who are you?", sync queue, activity log, deploy, nightly backup, secrets setup script | Two phones unlock. Removing one phone cuts it off. A change shows the right person. A backup restores |
| **2a. Shopping list (done)** | List by shop (each supermarket and the market on its own, no kiosk). Essentials / Full shop / + Upgrades with totals. Best brand and store, brand drawer, bulk value, store basket and split run, deals drawer, catalog search. "I'm going to" with the running-low check. Weekly Quickmart prices (`scrape-supermarkets.yml`, Thursday 23:00 UTC) | Toggle modes offline and the totals change. Prices and the brand drawer show with no signal |
| **2c. Catalog-first Shop (done)** | Catalog / Cart / Kitchen stock switch. Whole catalog offline with weekly price-change-only updates, search, aisles, sorting, store and tier filters, side-by-side store prices, add with tier and quantity, cart bar. "+ Add all" for low fast movers | Search, add and change tier with no signal. Second sync downloads only changed prices |
| **2b. Stock (done)** | Stock / Shopping list switch on the Shop tab. +/− and OK/Low/Out by category, short history per item, edit item. Low/Out items join the list on their own. Put away with real-price fix into a spend entry. "Ran out early" note | Both phones offline lower the same item. After reconnecting the total is right on both (checked 21 Oct 2026 on two local test phones: 3, each −1 offline, 1 on both and on the server) |
| **3. Jobs (done)** | Anyone posts. Size from time × people, Light/Medium/Heavy tag. Team-ups with % shares, two-stage kitchen, money runs 2–4 days ahead, WhatsApp to Peter, 2-hour in-app reminders, overdue rescue (help or take over), repeat, Asante, Meeting 14-day summary. Presence (At home / Out / Away) | Two local test phones: Greg 60% and Vinnie 40% on "Wash the dog", a 50% share refused when only 40% was left, done, Asante (21 Oct 2026). Rescue and stage 2 checked on the server |
| **4. Money** | Money in and out, corrections, balance, Budget tab, Summary for Dad | KES 10,000 in, 2,350 out shows 7,650. A correction restores it. Editing an entry is refused |
| **Gate** | **Set the family meeting date** | Phases 2 to 4 pass on two real phones |
| **5. Home and Meeting (done)** | Home: contact search, job reminders and rescues, 2-week job picture with suggestions and "take it easy", presence, alerts. Meeting: next meeting and rotating host, usual agenda, waiting jobs, notes, decisions to jobs, past meetings. Settings: your job preferences and house settings | A waiting job can be added to the agenda; a decision becomes a job (checked locally 21 Oct 2026) |
| **6. Contacts (done; Meals dropped)** | Contacts with search, call and copy, emergency first, search from Home. Meals removed: cooking is a job | A contact found from Home dials +254 |
| **7. Push alerts (Jobs done)** | Job alerts (urgent, covered, past its time, every-2-hours reminders, handover), quiet hours, on/off per phone, kill switch. Still to add: "going to the market" and "asante" | Android and an installed iPhone get "Water is back!". Nothing arrives at 10pm. (Server side checked 21 Oct 2026: wrong secret refused, quiet hours respected, each alert sent once. Delivery to a real phone not checked yet) |
| **8. Polish** | Fonts, animation, reduced motion, dark mode | First load under about 250 KB on a slow connection. Reduced motion turns animation off |
| **9. Launch** | Family meeting 1 (see [03-family-meeting.md](03-family-meeting.md)) | All six people do one thing in the app |

## After launch

- **Release 1.1**, guided by what the activity log shows: suggested shopping quantities. Alerts for help requests, money received and meeting day. Muting each alert type.
- **Later:** receipt photos, bill reminders.

## How we'll know it worked (one month after the meeting)

- At least 5 of the 6 people use the app in week 4.
- At least 4 different people complete jobs, and no job waits more than 7 days. (Counted from the log for the meeting. Never shown in the app per person.)
- The app's balance matches real cash and M-Pesa within KES 500, and Dad got the summary.
- No surprise run-outs of gas, unga or cooking oil.
- Meeting 2 happens and its decisions are logged.

## What I need from you before building

- Walk Mom through the plan, and send the WhatsApp poll (questions in [06-open-questions.md](06-open-questions.md)).
- Choose the family PIN (6 or more digits, not a birth year or 123456). You'll type it into the setup script. It's never written down in the code.
- Have your Supabase and Vercel logins ready. The setup script asks for the keys with hidden input.
