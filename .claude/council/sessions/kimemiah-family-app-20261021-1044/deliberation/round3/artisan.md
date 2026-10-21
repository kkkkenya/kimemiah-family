## Artisan Final Position — Visual identity and motion

**Revised recommendation:** A warm, Nairobi-home identity that loads cheaply. Colour tokens and the CSS kanga stripe carry most of the character at no download cost. There are two self-hosted fonts. GSAP confirms actions in under 300ms, with one React Bits SplitText greeting a day and Lenis limited to money history and the meeting archive (touch smoothing off). Every moment has a reduced-motion fallback.

**Concessions made:** Atkinson Mono is dropped (tabular figures instead). CountUp is replaced by a GSAP tween. React Bits is reduced to one lazy-loaded component. I accepted Pathfinder's and the conductor's navigation (Home, Shop, Jobs, Money, More). Lenis does nothing on touch screens.

**Non-negotiables:**
- Status is shown by icon, word and colour together, at WCAG AA contrast.
- Brand purple never stands in for a status colour.
- Taps are at least 48px.
- Every GSAP call sits inside `gsap.matchMedia()` with a reduced-motion branch.
- Animate transforms and opacity only.
- No WebGL or canvas backgrounds, no ScrollTrigger in the app shell, no looping animation.
- Fonts are 55 KB or less of woff2. Young Serif is the first thing cut if the first load goes over 250 KB.

**Implementation notes:**
- **Claims need a connection.** Offline, "I'll do it" and "I'll cook" turn muted with a "Needs connection" label. Online, the button shows a spinner while the server checks, and the card moves (Flip) only after the server confirms. If someone else got there first, an inline amber note says "Wanjiru took this". No shake animation.
- **Rejected changes:** the affected row gets an amber left bar, and More shows a "N not synced" badge.
- **Code structure:** tokens are CSS custom properties on `:root` and `[data-theme=dark]`, mapped into the Tailwind theme. Motion tokens live in one `motion.ts`, timelines are scoped through `useGSAP`, and the stack is GSAP core + Flip + DrawSVG.

### Final tokens

| Token | Light | Dark |
|---|---|---|
| surface-base | #F6EFE4 | #1C1714 |
| surface-raised | #FFFAF2 | #27201B |
| text-primary | #2A211B | #F1E8DC |
| text-muted | #6B5D52 | #B8AA9C |
| brand (jacaranda) | #5B3F8C | #B9A3E3 |
| accent-chai (decoration only) | #C8893B | #D9A35C |
| ok (text on bg) | #2F6B3A on #E3EFE0 | #7BC48A on #1F2E22 |
| low | #8A5A00 on #F5E2B8 | #E8B64C on #33280F |
| out (filled) | #FFFFFF on #B3261E | #1C1714 on #F07A6E |

Contrast values are hand-calculated; check them with a tool in Storybook or a test before build.

- **Type:** Atkinson Hyperlegible Next 400/700 (preloaded) for UI. Young Serif 400 for titles and thank-yous, with a Georgia / Noto Serif metric-adjusted fallback. Scale 14 / 16 / 18 / 22 / 28; line-height 1.5 for body, 1.2 for titles. Amounts use `tabular-nums`.
- **Space:** 4 / 8 / 12 / 16 / 24 / 32, with a 16px side gutter.
- **Radius:** card 12, chip 999, sheet 16 (top corners only).
- **Elevation:** one level, `0 1px 3px rgba(42,33,27,.08)`.
- **Targets:** 48px minimum; stock +/− and the OK/Low/Out produce toggle at 56px.
- **Kanga stripe:** a 4px repeating gradient of brand / chai / surface, used on the header and thank-you cards only.

### Final motion table
Durations: micro 120, short 200, medium 300, long 500ms. Eases: enter `power3.out`, exit `power2.in`, move `power2.inOut`. Stagger 40ms, capped at 5 items.

| Moment | GSAP spec | Duration | Reduced-motion |
|---|---|---|---|
| Stock +/− and produce toggle | number `yPercent` roll; chip colour crossfade plus a single `scale:1.06` yoyo when status changes; `vibrate(10)` | 120 + 200 | instant swap, vibration kept |
| Shopping tick | DrawSVG check; strike `scaleX 0→1`; row `autoAlpha .6` | 200 | instant |
| Put away | `Flip.from` rows out, stagger 40; toast `y:24→0` | 300 + 200 | remove; toast opacity 120 |
| Claim confirmed | initial chip `x:-12→0`; card `Flip` to "Picked up" or "Cooking" | 200 + 300 | instant move, heading highlight |
| Done + thank-you | check draw, kanga stripe `scaleX`, card `y:16→0` | 250 + 500 | opacity 120 |
| Tab / sheet | tab `y:8→0, autoAlpha`, no exit; sheet `yPercent 100→0`, exit `power2.in` | 200 / 300 in, 200 out | instant tab; sheet opacity 120 |
| Greeting (React Bits SplitText) | chars `y:12`, stagger 0.02, once a day, after first paint | 500 | static |
| Money left | GSAP number tween from the last-seen value, only when it changed | 600 `power1.out` | final value |
| Sync banner / not-synced bar | `yPercent -100→0`; a single dot pulse when synced | 200 | static |
