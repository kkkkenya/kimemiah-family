## Artisan Position — Visual identity and motion

**Core recommendation:** Build the identity from things in a Nairobi home: the kanga, the October jacaranda, red-soil terracotta, chai, a charcoal jiko. Keep it calm and readable for daily use. GSAP is used only for six small feedback moments in a "tap, see it land" style. Lenis is installed per the stack but is limited to long read-only pages, and on phones it hands scrolling back to the browser. Use at most two React Bits components and no WebGL backgrounds.

**Key argument:**
People will open this app many times a day on budget Android phones, so the first thing it has to get right is hierarchy. Each screen should answer one question in under three seconds ("What's low?", "What's open?", "How much is left?"). The family feel comes from three cheap sources. (1) **Palette:** jacaranda purple is the brand colour, which leaves red, amber and green free to mean Out, Low and OK and nothing else. (2) **Kanga motif:** a thin CSS repeating-gradient border that costs zero bytes. It appears only on the header band and on thank-you cards, and each thank-you is laid out like a kanga with its *jina* (saying) line. That makes appreciation the most decorated thing in the app, which is right for a non-gamified tone. (3) **Typography:** Young Serif for section titles and thank-yous gives a warm, hand-set feel. Atkinson Hyperlegible Next for all UI text stays legible at small sizes on cheap screens, and Atkinson Hyperlegible Mono keeps KES amounts aligned in columns. Motion only confirms that an action worked: the count moved, the item went to its group, the thanks arrived. Nothing loops, nothing is tied to scroll, and the app shell has no ScrollTrigger.

**Lenis, honestly:** The app shell is short lists with a fixed bottom bar, and native momentum scrolling on Android is better there. I recommend one `<SmoothScroll>` wrapper (Lenis driven by `gsap.ticker`, `lagSmoothing(0)`, `syncTouch: false`) mounted only on the meeting-minutes archive and the money history. With `syncTouch: false`, phones scroll natively and Dad gets smooth scrolling on a laptop. This meets the stack rule without making scrolling worse on phones.

**React Bits (max 2):**
1. **SplitText** (GSAP-based, fits the stack): the Home greeting ("Habari ya jioni, Mom"), shown only on the first open of the day.
2. **CountUp**: Dad's money left on Home, and only when the value changed since the last visit. If the TS-TW version pulls in `motion`, rebuild it as a 10-line GSAP tween instead (Tuner decides).
Excluded: Aurora, Silk, Particles, Galaxy and every other WebGL or canvas background. They would drain batteries and they are pure decoration.

**Risks if ignored:**
- **Showy stack, sluggish app:** backgrounds, Lenis on touch and scroll-linked effects make taps feel late, and the family stops updating. The goal says updating "must take seconds".
- **Colour-only status fails:** OK/Low/Out shown by hue alone fails for colour-blind users and in sunlight. Every chip needs icon + word + colour, each at AA contrast.
- **Generic SaaS look:** default Inter, blue and grey makes the app feel like a work tool, not a family thing. Six people have to choose to open it.

**Dependencies:**
- Advocate: confirm the 48px minimum target, the reduced-motion policy, and Swahili/English greeting copy.
- Tuner: GSAP + Flip bundle budget, CountUp dependency check, test device (e.g. a 3GB-RAM Android).
- Architect: optimistic UI events (tap, then animate before sync) and a `changedSinceLastVisit` flag for CountUp.
- Pathfinder: theme-color and manifest colours for install and splash.

---

### Appendix A: Design tokens

| Token | Light | Dark | Notes |
|---|---|---|---|
| `surface-base` (paper) | #F6EFE4 | #1C1714 (jiko) | warm, not white/black |
| `surface-raised` | #FFFAF2 | #27201B | cards |
| `text-primary` (ink) | #2A211B | #F1E8DC | ~14:1 |
| `text-muted` | #6B5D52 | #B8AA9C | ≥4.6:1 |
| `brand` (jacaranda) | #5B3F8C | #B9A3E3 | 7.3:1 on paper; white on it 8.3:1 |
| `accent-chai` | #C8893B | #D9A35C | decoration and kanga stripe only, never text |
| `status-ok` | #2F6B3A on #E3EFE0 | #7BC48A on #1F2E22 | icon: check |
| `status-low` | #8A5A00 on #F5E2B8 | #E8B64C on #33280F | icon: ! (~4.7:1) |
| `status-out` | #FFFFFF on #B3261E | #1C1714 on #F07A6E | filled chip, icon: x (6.5:1) |

Contrast figures are hand-calculated and need checking with a tool before build.

- **Type scale (rem/px):** caption 0.875/14, body 1/16, lead 1.125/18, title 1.375/22 (Young Serif), display 1.75/28 (Young Serif). Line-height 1.5 body, 1.2 titles. Amounts use `font-variant-numeric: tabular-nums` (Atkinson Mono).
- **Space (8px grid):** 4, 8, 12, 16 (card padding), 24 (between groups), 32 (sections). 16px side gutter.
- **Radius:** 12 for cards, 999 for chips, 16 for the top corners of sheets. **Elevation:** one shadow level, warm `rgba(42,33,27,.08)`.
- **Targets:** 48px minimum; stock +/− buttons 56px with 8px gap; the primary button is full width, 52px tall.
- **Kanga stripe:** `repeating-linear-gradient(90deg, brand 0 6px, accent-chai 6px 10px, surface 10px 14px)`, 4px tall.

### Appendix B: Motion tokens and moments

Durations: `micro 120ms`, `short 200ms`, `medium 300ms`, `long 500ms`. Eases: enter `power3.out`, exit `power2.in`, move `power2.inOut`. Animate transforms and opacity only (Flip for reorders). Stagger 40ms, capped at 5 items. Everything sits inside `gsap.matchMedia()` with a `(prefers-reduced-motion: reduce)` branch, and timelines are set up with `useGSAP` scoped to a ref.

| Moment | GSAP spec | Duration | Reduced-motion fallback |
|---|---|---|---|
| Stock + / − | old number `yPercent:-100, autoAlpha:0`, new one from `yPercent:100`; if status changes, chip colour crossfade plus a single `scale:1.06 yoyo`; `navigator.vibrate(10)` | 120 + 200ms | number and chip swap instantly, vibration kept |
| Shopping tick | tl: check path `strokeDashoffset`→0 (DrawSVG); strike line `scaleX 0→1, transformOrigin:left`; row `autoAlpha:.6` | 200ms | instant ticked state |
| Put away | tl: `Flip.from` ticked rows out of the list, stagger 40ms; then toast `y:24→0, autoAlpha` "9 items back in stock" | 300 + 200ms | rows removed, toast fades in 120ms |
| "I'll do it" | initial chip `x:-12→0, autoAlpha`; card `Flip` into the "Picked up" group, `power2.inOut` | 200 + 300ms | instant move; group heading briefly highlighted |
| Done + thank-you | check draw, then kanga stripe `scaleX 0→1` on the card edge; new thank-you card `y:16→0, autoAlpha`, `power3.out` | 250 + 500ms | stripe and card appear, 120ms opacity only |
| Tab / sheet | tab content `y:8→0, autoAlpha`, no exit; sheet `yPercent:100→0` enter, `power2.in` exit | 200 / 300ms in, 200ms out | instant tab; sheet opacity 120ms |
| Greeting (SplitText) | chars `y:12, autoAlpha`, stagger 0.02; once per day | 500ms total | static text |
| Money left (CountUp) | tween from the last-seen value to the new one, `power1.out` | 600ms | final value |
| Offline / synced | banner `yPercent:-100→0`; a single green dot pulse when the sync completes | 200ms | static banner |
