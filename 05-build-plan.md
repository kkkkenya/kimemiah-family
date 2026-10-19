# Build plan

## How it works

- **A web page published on Claude (claude.ai).** It's private to you by default. You share it with family members as **Contributors**, so they can update data.
- **Everyone signs in** with a free Claude account on their phone browser. Updates show on all phones within moments.
- **Data lives in the app's own shared database**, so it survives updates to the app. Claude can also read it later to help, for example to write the monthly summary.
- **Phone first:** big buttons, bottom navigation, works in light and dark mode.
- **Motion:** GSAP for small transitions (ticks, list changes), Lenis for smooth scrolling, both turned off for people who prefer reduced motion. React Bits components need a build setup, so they're left out of this single-page app.

## Phases

Each phase ends with a check that must pass before the next one starts.

### Phase 1: Stock and Shopping
- Stock list with + / −, Low/Out status, add/edit/remove items
- Shopping list built from Low/Out items, one-off items, grouped by shop, total in KES
- "I'm going to [shop]" and "Put away"
- Starter list from [04-starter-stock-list.md](04-starter-stock-list.md) loaded in

**Check:** lower an item to its minimum on one phone and see it appear on the shopping list on a second phone. Put it away and see stock go back up.

### Phase 2: Jobs board
- Post, "I'll do it", drop, "Done", repeating jobs
- "Needs a volunteer" after 3 days unpicked
- Help requests and thank-you wall

**Check:** two people on two phones. One posts a job, the other picks it up and marks it done, and a thank-you shows on Home.

### Phase 3: Dad's money and budget
- Money in, money out, balance
- Category budgets and actual spend
- "Summary for Dad" copy button

**Check:** log KES 10,000 in and KES 2,350 out. The balance shows KES 7,650 and the summary text matches.

### Phase 4: Family meeting
- Agenda, host rotation, notes, decisions log, decision-to-job
- Unpicked jobs and help requests added to the agenda on their own

**Check:** a job left unpicked shows on the agenda, and turning a decision into a job puts it on the Jobs board.

### Phase 5: Meals and contacts
- Week grid, saved meals with ingredients, "I'll cook"
- "Add ingredients to shopping list", using stock to skip what we already have
- Copy last week's plan
- Household contacts with copy buttons and emergency numbers pinned

**Check:** plan githeri for Tuesday with beans at zero in stock. Beans go on the shopping list marked "for githeri" and onions (in stock) don't.

### Phase 6: First family meeting
- Hold the meeting from [03-family-meeting.md](03-family-meeting.md).
- Share the link with each person as a Contributor. Everyone opens it and taps one thing.
- Note what people found confusing and fix it.

## What I need from you before building

- Go through the starter stock list and mark changes.
- Confirm the eight sections, or cut any for version 1.
- List the meals the family cooks most, and the contacts to put in the phone book.
- Each family member creates a free Claude account (sign-in is theirs to do).
