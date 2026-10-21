## Pathfinder Response to Artisan

**Their position:** A calm, Nairobi-rooted identity (jacaranda palette, CSS kanga stripe, Young Serif + Atkinson Hyperlegible Next + Atkinson Mono). GSAP handles six feedback moments, Lenis runs only on two long read-only pages with `syncTouch: false`, and React Bits is limited to SplitText (daily greeting) and CountUp (balance).

**My response:** Modify (fonts), Modify (React Bits), Maintain/agree (Lenis), Modify (navigation)

**Reasoning:** My "system fonts only" rule was about repeat data cost, and self-hosting solves that. `next/font/google` downloads the files at build time and serves them from our own domain, so phones never contact Google. Serwist precaches them once and they cost 0 KB on every later open. Rough budget for Latin-subset woff2: Young Serif in one weight is about 20 KB; Atkinson Hyperlegible Next in 400 and 700 is about 40-50 KB. Atkinson Mono can be cut to digits, "KES", comma and period with `unicode-range`, which takes it to about 5-8 KB. If Next has tabular figures, drop Mono and use `tabular-nums`. That adds up to about 70 KB once, roughly 2% of a KES 20 daily bundle, which is acceptable. Conditions: `display: swap`, preload only the UI face, keep fallback metrics adjusted (next/font does this) so the bottom bar doesn't shift, and keep total first load at or under about 250 KB.

React Bits: I accept SplitText. It runs on GSAP's free SplitText plugin, plays once a day, and is static under reduced motion. That respects the owner's mandatory stack at almost no cost. For CountUp, check the TS-TW source before installing it. If it imports `motion`, replace it with a 10-line `gsap.to` tween on the number, because a second animation library adds about 30 KB for one number.

Lenis: Artisan's scoping matches my position, so no challenge there.

Navigation: Advocate is right that Money is a daily destination, especially for Dad. But Home, Shop, Jobs, Meals, Money plus More makes six tabs. That's over Material 3's limit of 5, and at a 360 dp width the labels get cut off. I propose **Home · Shop · Jobs · Money · More**, with Budget as a segmented tab inside Money and Meals, Meeting and Contacts under More. Meals stays daily without its own tab because Home's "Today's meals" card carries the "I'll cook" button inline, and More remembers the last section opened. If Advocate's usage data says Meals beats Money, swap the two; I defer on which one, but not on keeping the bar at five.
