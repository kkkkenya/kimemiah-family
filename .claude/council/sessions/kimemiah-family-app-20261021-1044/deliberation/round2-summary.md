# Round 2 summary (conductor)

## Settled
- Launch at family meeting 1 (Strategist conceded). Before build: Mom private walkthrough + WhatsApp poll for shops, meals, contacts, who logs spending. Set meeting date only after Stock/Shopping, Jobs, Money pass two-phone checks.
- Push at launch: 3 events, "X is going to [shop]", gas/tokens Out, "someone thanked you". Quiet hours 21:00-07:00 server rule, one on/off switch per person, server kill switch. No amounts in push text. Burst coalescing per person ~60 s; drop replayed events older than ~1 h. Shared-secret header on the notify function; log pg_net failures. 1.1: help requests, money received, meeting day, per-type mute.
- Bottom bar: Home, Shop, Jobs, Money, More (Meals, Meeting, Contacts). Budget is a tab inside Money. Home has "Money left" card and "Today's meals" card with "I'll cook". More remembers last section.
- Produce uses one-tap OK/Low/Out.
- Meals: week grid + I'll cook + copy last week + simple ingredients-to-shopping (adds Low/Out/untracked ingredients, names the meal). Suggested quantities in 1.1.
- Fonts: self-hosted via next/font, Young Serif (1 weight, titles + thank-yous) + Atkinson Hyperlegible Next (400/700); drop Mono if Next has tabular figures. display: swap, preload UI face only, metric-adjusted fallback. First load under ~250 KB.
- React Bits: SplitText only (Home greeting, once daily, after first paint). CountUp replaced by GSAP tween. Lenis only on money history and meeting archive, touch smoothing off.
- Money: insert-only, no UPDATE policy; corrections via voids_entry_id; recorded_by separate from spent_by; audit_log trigger.
- Backups: nightly GitHub Action pg_dump, age-encrypted, plus one REST call to prevent free-tier pause; one test restore.

## Crossover to settle in Round 3 (conductor direction)
Architect and Skeptic swapped positions. Conductor direction:
- **Auth: anonymous Supabase auth per device** (Architect's original, endorsed by Skeptic) with Skeptic's fixes: PIN rate limit per IP + global cap (not per device); is_household() checks devices.revoked_at in the table; "change PIN + revoke all devices"; per-device revoke for a lost phone; first unlock must be online, saved session opens offline. "Who are you?" picker sets member_id on the device; every write carries actor_id set server-side.
- **Offline: reads everywhere; offline writes for every action except claims** (job claim, cooking slot claim, which are server-checked first-claim-wins and need a connection). Stock = deltas, money = insert-only, everything else last-write-wins per row. apply_mutations must be SECURITY INVOKER or a hard table/column allowlist with server-set actor_id. Rejected mutations shown in app + "N changes not synced" badge.
