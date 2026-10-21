# Design system

A warm Nairobi home, not a generic app. Agreed by the council on 2026-10-21.

## Identity

- **Jacaranda purple** is the brand colour, so red, amber and green can mean only Out, Low and OK.
- **Warm paper** background in light mode, **charcoal** in dark mode, **chai** as a decoration-only accent.
- A thin **kanga stripe** (drawn in CSS, no image) on the header and on thank-you cards only. Appreciation is the most decorated thing in the app.

## Colour tokens

| Token | Light | Dark |
|---|---|---|
| surface-base | #F6EFE4 | #1C1714 |
| surface-raised | #FFFAF2 | #27201B |
| text-primary | #2A211B | #F1E8DC |
| text-muted | #6B5D52 | #B8AA9C |
| brand (jacaranda) | #5B3F8C | #B9A3E3 |
| accent-chai (decoration only) | #C8893B | #D9A35C |
| ok | #2F6B3A on #E3EFE0 | #7BC48A on #1F2E22 |
| low | #8A5A00 on #F5E2B8 | #E8B64C on #33280F |
| out | #FFFFFF on #B3261E | #1C1714 on #F07A6E |

Contrast figures were worked out by hand; they get checked with a tool before the build.

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
