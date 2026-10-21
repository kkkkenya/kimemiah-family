## Strategist Position: Scope and sequencing for the Kimemiah family app

**Core recommendation:** Ship all 8 sections in release 1, but at three depths: **deep** (Stock and Shopping, Jobs, Money), **standard** (Home, Meeting), **thin** (Meals, Contacts, with Budget folded into Money as a tab). Hold a short family meeting *before* the build to collect the input the app depends on, and launch the app at the second meeting.

**Key argument:**
The real goals are three: people volunteer (fairness), Dad's money is visible (trust), and gas, unga, oil and tokens don't run out (no surprises). Three sections carry nearly all of that: Jobs, Money, and Stock and Shopping. They need to work very well and take one tap each. The other five sections can be present and useful without being deep. Contacts is a list with copy buttons, an afternoon of work. Budget is category totals against a number on the Money screen, not its own feature. Meals can launch as a week grid with "I'll cook" and free text. The stock-aware "add ingredients to shopping list" is the most complex logic in the whole plan, so it goes to a fast follow. That keeps the user's "everything at once" decision while putting about 70% of the effort into the 30% that drives adoption. Two cross-cutting asks also need trimming. **Offline** writes are a Must only where signal really fails, which is ticking items in the shop and stock +/−. Everywhere else can show cached data with a clear "offline" banner. **Push** gets one event at launch, "I'm going to [shop]", because that event gets people adding requests before the trip. It ships behind a flag so iPhone install quirks cannot block the release.

**Meet first, build second.** The plan says the meeting should present the app as "a tool the family chose." Building all 8 sections before anyone else has given input works against that, and it loads the build with guesses: shops, meals, contacts, who logs spending, how many days before a job is flagged. A 30–40 minute meeting now (ground rules, appreciation, frustrations, the volunteer idea, Dad's money, "what should the app do for you?") costs nothing and starts the habit. The fairness and trust goals start there, not in the app. If the user still wants the app ready for the first meeting, the fallback is to talk to Mom privately first and run a WhatsApp poll for shops, meals and contacts.

**Success measure, one month after launch (meeting 2 to meeting 3):**
- **Adoption (north star):** at least 5 of 6 members do at least one action in the app in week 4, Dad included.
- **Fairness:** at least 4 different people complete jobs during the month, and no "Needs a volunteer" job is older than 7 days by the next meeting.
- **Money trust:** the app balance matches real cash/M-Pesa within KES 500 at month end, and the summary reaches Dad.
- **No surprises:** zero unexpected run-outs of gas, unga, oil or tokens.
- **Meeting habit:** meeting 3 happens and its decisions are logged.

These need one `activity_log` table (who, what, when). The same table also gives each person a name on their actions under the shared PIN.

**Risks if ignored:**
- **Long build, lost momentum:** eight equally deep sections plus full offline sync and push could take months of the user's review time. The family's interest, and the user's, fades before launch.
- **Building the wrong thing:** without family input first, effort goes into meal logic or budget screens nobody uses, while unclear job naming or slow stock updates quietly kill adoption.
- **Attribution failure kills fairness:** if a shared PIN means actions aren't tied to a person, thank-yous and "who spent what" stop working. That breaks the two values the app exists for.

**Dependencies on other domains:**
- **Architect:** identity under a shared PIN (PIN, then pick your name, device remembers). Stock changes stored as deltas so offline edits merge without conflicts. The activity log schema.
- **Pathfinder:** realistic iPhone/Android PWA push limits, to decide whether push is a launch item or a flagged extra.
- **Advocate:** confirm the deep/thin split matches how Mom and the others actually use the house.
- **Skeptic/Guardian:** the minimum protection for money records that doesn't add sign-in friction.

---

### Appendix A: MoSCoW per section

| Section / item | MoSCoW | Effort | Value | Phase |
|---|---|---|---|---|
| Foundation: PIN + name picker, data model, PWA shell, activity log, deploy | Must | L | High | R1 |
| Stock: +/−, Low/Out, add/edit, starter list | Must | M | High | R1 |
| Shopping list from Low/Out, one-offs, by shop, KES total | Must | M | High | R1 |
| "I'm going to [shop]" + "Put away" (offers to log spend) | Must | M | High | R1 |
| Offline writes for stock and shopping ticks | Must | L | High | R1 |
| Jobs: post, I'll do it, drop, done, repeat | Must | M | High | R1 |
| Thank-yous on done jobs | Must | S | High | R1 |
| "Needs a volunteer" after N days | Must | S | High | R1 |
| Help requests (a job with a time, not a separate feature) | Should | XS | Med | R1 |
| Money in/out, balance, who spent | Must | M | High | R1 |
| Summary for Dad (copy to WhatsApp) | Must | S | High | R1 |
| Budget as a tab in Money: category limits vs actual | Should | S | Med | R1 |
| Home dashboard (low stock, open jobs, balance, next meeting, thank-yous) | Must | S | High | R1 |
| Meeting: date, host, agenda with auto-added flagged jobs, notes, decisions log | Must | M | High | R1 |
| Decision → job | Could | S | Med | R1 if time |
| Meals: week grid, saved meals, "I'll cook" | Should | M | Med | R1 thin |
| Meals: ingredients → shopping list using stock | Could | L | Med | R1.1 |
| Copy last week's plan | Could | XS | Low | R1.1 |
| Contacts: list, copy number, pinned emergency | Should | XS | Med | R1 thin |
| Push: "I'm going to shop" only, behind flag | Should | M | Med | R1 |
| Push: low stock, bills, job flagged | Could | M | Med | R1.1 |
| Offline writes for all other sections | Won't | XL | Low | Later |
| GSAP/Lenis motion beyond small ticks | Could | S | Low | Last |
| Receipt photos, bill reminders, budget forecasting | Won't | M–L | Low | Later |

### Appendix B: Build order (each step ends with a two-phone check)

0. **Pre-build meeting** (or Mom + WhatsApp poll): shops, meals, contacts, who logs money, days before a job is flagged.
1. **Foundation:** PIN + name, schema, activity log, PWA shell, deploy to Vercel.
2. **Stock and Shopping, offline-first.** Check: two phones offline, both change stock, both sync, totals correct.
3. **Jobs + thank-yous + flags.** Check: the existing two-phone job check from 05.
4. **Money + Budget tab + summary.** Check: KES 10,000 in, 2,350 out, balance 7,650, budget bar updates.
5. **Home + Meeting.** Check: a flagged job appears on the agenda.
6. **Thin Meals + Contacts.** Check: "I'll cook" shows on Home.
7. **Push (one event, flagged)** and light motion polish.
8. **Launch at meeting 2**, then R1.1 (meal-to-shopping logic, more push events) based on what the activity log shows.

**Cut line rationale:** everything that drives the three goals sits above the line. Below it is work that is either complex for medium value (meal-stock logic, full offline) or polish.
