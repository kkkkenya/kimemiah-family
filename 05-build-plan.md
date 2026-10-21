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
| **2b. Stock** | +/− and OK/Low/Out, Low/Out items join the list on their own, Put away with real-price fix into a spend entry, "ran out early" note | Both phones offline lower the same item. After reconnecting the total is right on both |
| **3. Jobs** | Post, take, drop, done, repeat, "waiting N days", Asante | Two phones tap "I'll do it" at once: one gets it, the other sees it's taken |
| **4. Money** | Money in and out, corrections, balance, Budget tab, Summary for Dad | KES 10,000 in, 2,350 out shows 7,650. A correction restores it. Editing an entry is refused |
| **Gate** | **Set the family meeting date** | Phases 2 to 4 pass on two real phones |
| **5. Home and Meeting** | Today cards, agenda with waiting jobs added, notes, decisions to jobs | A waiting job appears on the agenda |
| **6. Meals and Contacts** | Week grid, I'll cook, copy last week, add ingredients. Contacts with call and copy | Githeri with beans Out adds "beans · for githeri" and skips onions |
| **7. Push alerts** | The 3 alerts, quiet hours, on/off, kill switch | Android and an installed iPhone get "going to the market". Nothing arrives at 10pm |
| **8. Polish** | Fonts, animation, reduced motion, dark mode | First load under about 250 KB on a slow connection. Reduced motion turns animation off |
| **9. Launch** | Family meeting 1 (see [03-family-meeting.md](03-family-meeting.md)) | All six people do one thing in the app |

## After launch

- **Release 1.1**, guided by what the activity log shows: suggested shopping quantities. Alerts for help requests, money received and meeting day. Muting each alert type.
- **Later:** receipt photos, bill reminders.

## How we'll know it worked (one month after the meeting)

- At least 5 of the 6 people use the app in week 4.
- At least 4 different people complete jobs, and no job waits more than 7 days. (Counted from the log for the meeting. Never shown in the app per person.)
- The app's balance matches real cash and M-Pesa within KES 500, and Dad got the summary.
- No surprise run-outs of gas, unga, cooking oil or tokens.
- Meeting 2 happens and its decisions are logged.

## What I need from you before building

- Walk Mom through the plan, and send the WhatsApp poll (questions in [06-open-questions.md](06-open-questions.md)).
- Choose the family PIN (6 or more digits, not a birth year or 123456). You'll type it into the setup script. It's never written down in the code.
- Have your Supabase and Vercel logins ready. The setup script asks for the keys with hidden input.
