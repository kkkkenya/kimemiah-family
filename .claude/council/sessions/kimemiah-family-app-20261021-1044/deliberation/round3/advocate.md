## Advocate Final Position — Kimemiah family app UX

**Revised recommendation:** Launch all 8 sections at meeting 1. Stock, Jobs and Money get the most polish, and the rest are thin but correct. Every tap takes under 5 seconds, works offline (except claims), is credited automatically through the device's "Who are you?" setting, and never feeds a per-person count.

**Concessions made:** Push drops from about 7 events to 3, and per-type mute waits for 1.1 (one on/off switch for now). Meals stays thin, with suggested quantities in 1.1. Motion is limited to SplitText once a day, a GSAP tick and a balance tween. Job and cooking claims need signal. First unlock needs signal.

**Non-negotiables:** No per-person totals or rankings anywhere. Thank-yous notify the recipient only. "Needs a volunteer" names the job, never the people. Dropping a job asks for no reason and sends no alert. Quiet hours 21:00–07:00. No amounts in push text. Undo instead of confirm dialogs. Status shown by colour *and* label. 48px touch targets. WCAG AA contrast in both themes. Reduced-motion respected.

**Implementation notes, screens per tab:**
- **Home (Today):** greeting, then at most 5 cards ordered by urgency: Out items, "X is heading to [shop]", open help requests, Today's meals + "I'll cook", Money left. Contact search sits at the top.
- **Shop:** Stock (categories, search, recently tapped first, +/− or OK/Low/Out chip, history per item) · Shopping list (by shop, KES total, "I'm going to [shop]", ticking, "Not found") · Put away → prefilled spend.
- **Jobs:** Open · Taken · Done (with the thank-you wall) · Post job/help request · Job detail (I'll do it / Done / Drop it).
- **Money:** Balance + month · History (insert-only, "Correct this" creates a void entry) · Add in/out · Budget tab · Summary for Dad (copy to WhatsApp).
- **More** (remembers the last section): Meals (week grid, I'll cook, copy last week, add ingredients) · Meeting (next date and host, agenda, notes, decisions → job) · Contacts (pinned emergency numbers, copy number) · Settings (who's using this phone, notifications on/off, theme, devices).

**Key copy strings:**
- Undo bar: "Cooking oil −1 · **Undo**"
- Sync chip: "Saved on this phone · will sync" → "Synced"
- Pending badge: "3 changes not synced yet"
- Rejected change: "Brian already took this job. Your change wasn't saved."
- Offline banner: "No connection. You can keep updating; we'll sync when you're back."
- Claim while offline: "Taking a job needs signal, so two people don't pick the same one."
- Thank-you button: "Asante" · push: "Mom said asante for Clean bathroom"
- Empty states: Jobs "Nothing open. The house is sorted." · Shopping "Nothing needed right now." · Thank-yous "Finish a job or say asante to someone; it shows here." · Money "No entries yet. Add the first money in." · Meals "Plan this week, or copy last week."
- Needs-a-volunteer tag: "Waiting 3 days · on the next meeting agenda"
- Drop confirmation (toast): "Back on the board."

**Meeting-1 onboarding script:**
1. *Before:* the starter stock, jobs, meals and contacts from the poll are already loaded, so no screen is empty. Mom has already had her private walkthrough and helps demo.
2. After the ground rules, the host shares the link in the family WhatsApp group.
3. Everyone opens it, taps **Add to Home Screen** (iPhone push needs this; the host checks each phone), and opens the app from the new icon.
4. Enter the family PIN with signal, and pick your name in "Who are you?".
5. The host says which 3 notifications exist and that nothing fires at night, *then* everyone taps "Allow".
6. Appreciation round: each person sends one **Asante** in the app to the person they thank out loud. The recipients' phones buzz.
7. Walk through Today → Shop: each person taps one stock item they know is low. Watch it reach the shopping list on everyone's phone.
8. During the "Dad's money" item, log Dad's latest transfer together. Afterwards Dad gets the link, the PIN (sent separately) and three screenshots on WhatsApp.

**Dependencies:** Architect: rejected-mutation surface + pending count, a server check for claims, actor_id set server-side. Pathfinder: install check UI, push opt-in after explanation. Artisan: Young Serif for thank-yous, tabular figures for KES.
