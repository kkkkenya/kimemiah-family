# Design system

A warm Nairobi home, not a generic app. Agreed by the council on 2026-10-21.

## Identity

- The palette comes from a lotus pond: **dark green**, **moss green**, **beige**, **rosy brown** and **midnight green**.
- **Beige** background in light mode, **dark green** in dark mode. **Midnight green** is the main colour for buttons and the active tab (a lighter moss in dark mode).
- **Rosy brown** and **moss** are decoration only, in the thin stripe on the header and thank-you cards. Appreciation is the most decorated thing in the app.
- OK, Low and Out keep clear green, amber and red, tuned to sit with the palette, so a status is never mistaken for decoration.

## Colour tokens

| Token | Light | Dark |
|---|---|---|
| surface-base | #F7F4D5 beige | #0A3323 dark green |
| surface-raised | #FCFAEA | #114130 |
| text-primary | #0A3323 dark green | #F7F4D5 beige |
| text-muted | #4A5E4F | #B7C29E |
| brand | #105666 midnight green | #A9BF7C light moss |
| rosy (decoration only) | #D3968C | #D3968C |
| moss (decoration only) | #839958 | #839958 |
| ok | #2C5A1E on #E3EACD | #B5CF86 on #173F2C |
| low | #7A4E00 on #F4E3B4 | #EBC66E on #36310F |
| out | #FFFFFF on #A63D30 | #0A3323 on #E9958A |

Every text pairing was checked and meets WCAG AA (4.5:1 or better). The exact moss #839958 behind dark green text only reaches 4.4:1, so dark mode uses the lighter moss #A9BF7C for buttons.

## Type

- **Atkinson Hyperlegible Next** 400 and 700 for all interface text (built for legibility).
- **Young Serif** for section titles and thank-yous.
- Both self-hosted (no calls to Google), 55 KB or less, downloaded once.
- Sizes 14 / 16 / 18 / 22 / 28. Money amounts use tabular figures so columns line up.

## Layout

- Spacing 4 / 8 / 12 / 16 / 24 / 32, with a 16px side margin.
- Corners: cards 12, chips fully round, bottom sheets 16.
- Tap targets at least 48px; stock +/− and OK/Low/Out at 56px.
- Status always shows **icon, word and colour** together, never colour alone.

## Motion (GSAP + Lenis + React Bits)

Animation confirms that something happened. It never decorates or slows a tap. Only transforms and opacity are animated, and everything turns off for people who prefer reduced motion.

| Moment | What happens | Time | Reduced motion |
|---|---|---|---|
| Stock +/− or OK/Low/Out | Number rolls, chip colour changes, short vibration | 120-200ms | Instant change, vibration kept |
| Shopping tick | Check mark draws, line strikes through | 200ms | Instant |
| Put away | Rows slide out, toast rises | 300 + 200ms | Rows removed, toast fades |
| Job taken | Card moves to "Taken" once the server confirms | 200 + 300ms | Instant move |
| Done + Asante | Check draws, kanga stripe sweeps in | 250 + 500ms | Fade |
| Tab or sheet | Short slide up | 200-300ms | Instant |
| Daily greeting | Letters rise in once a day (React Bits SplitText) | 500ms | Static |
| Money left | Number counts from the last amount you saw | 600ms | Final number |
| Sync banner | Slides in; one pulse when synced | 200ms | Static |

- **GSAP** runs all of the above.
- **React Bits**: SplitText for the daily greeting only.
- **Lenis** smooth scrolling only on money history and the meeting archive, and off on touch screens, so phones keep their normal scrolling.
- No 3D or animated backgrounds, no scroll effects in the app, nothing that loops.
- First load stays under about 250 KB. If it doesn't, Young Serif is cut first.
