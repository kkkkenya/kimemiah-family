# Design system

## Current look (2026-10-23): editorial monochrome, after Ramp

This replaces the lotus-pond palette below; the token values in `app/globals.css` are the source of truth.

- **Canvas** #f4f2f0, **cards** white on a 1px #e5e7eb hairline, no shadows. **Ink** #0c0a08, muted #6d6c6b.
- **One accent:** highlighter yellow #e4f222 with ink text, only on main buttons, the selected chip and the active tab. Big panels that need weight use the dark #1a1919 instead.
- **One typeface:** Inter at weight 400 (stand-in for Ramp's Lausanne), `ss01` on. Hierarchy comes from size, not bold.
- **Radii:** 6px buttons, chips and inputs; 16px cards. No pill shapes on controls.
- OK, Low and Out keep their green, amber and red so a status still reads at a glance.
- **Laptop (1024px and wider):** the tab bar becomes a dark side rail; cards flow in two columns; chip rows wrap instead of scrolling sideways; details open as a centred dialog.

## Earlier look (2026-10-21)

A warm Nairobi home, not a generic app. Agreed by the council on 2026-10-21.

## Identity

- The palette comes from a lotus pond: **dark green**, **moss green**, **beige**, **rosy brown** and **midnight green**.
- **Beige** background in light mode, **dark green** in dark mode. **Midnight green** is the main colour for buttons and the active tab (a lighter moss in dark mode).
- **Rosy brown** and **moss** are decoration only, in the thin stripe on the header and thank-you cards. Appreciation is the most decorated thing in the app.
- OK, Low and Out keep clear green, amber and red, tuned to sit with the palette, so a status is never mistaken for decoration.

## Colour tokens

| Token | Light | Dark |
|---|---|---|
| surface-base | #F7F4D5 beige | #072A1C dark green |
| surface-raised (cards) | #FFFFFF | #0F3D2C |
| text-primary | #062A1C dark green | #FBF9E6 beige |
| text-muted | #34463A | #D3DCBC |
| line (borders, input outlines) | #7D7A58 | #6F9A83 |
| brand | #0C4A59 midnight green, white text | #C3D896 light moss, dark text |
| rosy (decoration only) | #D3968C | #D3968C |
| moss (decoration only) | #839958 | #839958 |
| ok | #1D4512 on #E1ECCB | #CDE6A0 on #143A28 |
| low | #5A3800 on #F6E2AE | #F2D282 on #33300E |
| out | #FFFFFF on #8E2C20 | #062A1C on #F4ADA3 |

High contrast, raised on 21 Oct 2026 at the family's request. Every text pairing meets WCAG AAA (7:1 or better; muted text 8.5:1 or more, status chips 8.2:1 or more). Borders and input outlines are 3.8:1 or more against the page and cards, so boxes and buttons are easy to see. Cards are white on the beige page. The exact moss #839958 is decoration only.

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
