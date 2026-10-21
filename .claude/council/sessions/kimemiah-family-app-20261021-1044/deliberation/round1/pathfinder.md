## Pathfinder Position — Kimemiah family app (PWA, offline, push)

**Core recommendation:** Keep it a PWA. No native wrapper for v1. Build one precached app shell in Chrome, keep all data in IndexedDB (Dexie) with an outbox that syncs when the app is open, and use VAPID web push. Treat Background Sync as a bonus on Android and assume it doesn't exist on iPhone.

**Key argument:**
Start from the phone in the hand: a 2-3 GB RAM Tecno/Infinix/Samsung A-series on Android 12-14, Chrome, a daily data bundle, and maybe one iPhone. A PWA covers every v1 need on that device: install to home screen, offline use, push, `tel:` links, and the share sheet. A Capacitor or TWA wrapper adds a Play Store account, signing keys, review cycles and an APK download, and it still can't reach the iPhone without a Mac and $99 a year. What it would add is more reliable push, and v1 can live without that. Revisit only if push turns out unreliable in practice.

Shape of the app:
- **Shell, not server pages.** Next.js App Router, but every section renders on the client from Dexie under one precached shell. Server Components that fetch data break offline navigation. Use **Serwist** (successor to next-pwa): precache the build, cache-first for hashed static assets, an offline fallback for navigations, and **no** service-worker caching of Supabase API calls. Data goes through Dexie, never the HTTP cache.
- **Data flow.** Reads come from Dexie. Writes go to Dexie and an `outbox` table at once (optimistic), then push to Supabase. Flush the outbox on app open, on `online`, on `visibilitychange`, and every 30 s while the app is in the foreground. Register a Background Sync tag as well; on Android Chrome it flushes after the app closes, and iOS ignores it. Supabase Realtime runs only while the app is in the foreground. Stock +/− must sync as **deltas** (`-1 beans`), not absolute values, so two phones editing offline merge cleanly.
- **Storage survival.** Call `navigator.storage.persist()` after install. In a Safari tab, iOS deletes site storage after 7 days without use; home-screen apps are exempt, which is one more reason to push installs. Supabase stays the source of truth, so an evicted phone re-downloads everything. Only unsynced outbox rows are at risk, so show a "3 changes waiting to sync" badge.
- **Push.** Use the `web-push` library from a Vercel route (or a Supabase Edge Function) with VAPID keys created by the setup script into `.env`. Android Chrome receives push even without install. iPhone needs iOS 16.4+, home-screen install, and a permission request triggered by a tap. Ask after the first meaningful action ("Get told when someone's going shopping?"), never on launch. Keep push to four events: someone is going shopping, a job needs a volunteer (daily Vercel cron, which fits the Hobby plan), a thank-you for you, and an item ran out. `notificationclick` deep-links to `/jobs/123` and similar. Because the family shares one PIN, the first run must ask **"Whose phone is this?"** and store the person on the device. That fixes push targeting and "who did what" in one step.
- **Install.** On Android, catch `beforeinstallprompt` and show our own "Add to home screen" button. iOS has no prompt, so detect Safari plus `!navigator.standalone` and show a two-step Share → Add to Home Screen sheet. The manifest needs `display: standalone`, `start_url: /`, and 192/512 maskable icons. Opera Mini, common in Kenya, doesn't run service workers, so tell everyone to use Chrome (or Safari on iPhone) and detect it on first open.
- **Navigation (revises 02).** Material 3 allows 3-5 destinations. Use **Home · Shop · Jobs · Meals · More**, with Money, Budget, Meeting and Contacts under More. Dad is remote and mostly uses Money, so let More remember the last section he opened. Each tab keeps its own stack, and Android back goes sub-screen → tab root → Home → exit. An iOS standalone app has no browser back button, so every sub-screen needs an in-app back arrow.
- **Data-light (revises 05).** Budget about 170 KB gzipped JS for the first load and close to 0 KB on later opens. Use system fonts and SVG icons, with no web fonts or images. GSAP core (~25 KB) for small transitions is fine. Leave Lenis's `syncTouch` off so phones keep native momentum scroll and pull-to-refresh; on touch it then costs ~4 KB and does nothing. Keep React Bits off the daily screens; one on an empty state at most. Respect `prefers-reduced-motion`.
- **Plan revisions.** Drop "Claude accounts". Tap-to-call now works (`tel:`), so the caveat in 02 §8 goes. "Summary for Dad" should use `navigator.share` straight into WhatsApp, with copy as the fallback. Receipt photos (later) can use `<input type="file" accept="image/*" capture>` with no permission plumbing, but compress to under 200 KB first.

**Test matrix:** (1) a low-end Android Go-class phone, Chrome, battery saver on; (2) a mid-range Samsung; (3) the family iPhone, after checking it runs iOS 16.4+ (iPhone 7 and older can't get push). Scenarios: airplane mode → edit → reconnect; two phones both drop beans offline → both deltas land; swipe the app away mid-save; force-stop Chrome, then send a push; Tecno/Infinix battery manager killing Chrome; clear site data with unsynced rows; Chrome DevTools Slow 3G + 4x CPU throttle on every PR.

**Risks if ignored:**
- Server-rendered pages or SW-cached API responses give blank screens or stale balances offline, and the family loses trust in the money numbers.
- Push "silently" fails: the iPhone isn't installed or is below 16.4, or HiOS/XOS/MIUI battery managers delay delivery (setup step: set Chrome battery to "Unrestricted"). The "I'm going shopping" coordination then breaks.
- Lost writes: absolute-value stock sync overwrites a sibling's change, or unsynced outbox rows vanish with no warning on eviction or a reinstall.

**Dependencies on other domains:**
- **Architect:** delta/op-based sync for counters, last-write-wins only for text fields, a server-side idempotency key per outbox op.
- **Skeptic/Guardian:** how the shared PIN works offline (local hash plus a long-lived device token), and whether the device-person binding is enough for attribution.
- **Artisan/Tuner:** motion budget within ~170 KB, and Lenis touch behaviour as above.
- **Operator:** VAPID keys and the Supabase anon key through the interactive `.env` setup script, plus a daily cron on Vercel Hobby.

### Appendix: platform capability table

| Feature | Android Chrome | iOS Safari (installed to home screen) | Fallback |
|---|---|---|---|
| Install to home screen | Yes, `beforeinstallprompt` | Manual via Share sheet, no prompt | In-app instruction sheet |
| Offline shell (service worker) | Yes | Yes | Offline page |
| IndexedDB / Dexie | Yes, `persist()` honoured | Yes, exempt from 7-day eviction when installed | Re-download from Supabase |
| Background Sync | Yes (one-off) | No | Flush on open / online / visible |
| Periodic Background Sync | Installed + engagement only, unreliable | No | Don't rely on it |
| Web push (VAPID) | Yes, even uninstalled | iOS 16.4+, installed, permission from a tap | Home-screen badges, WhatsApp |
| Badging API | Partial | Yes (16.4+) | Count in tab bar |
| Web Share (to WhatsApp) | Yes | Yes | Copy to clipboard |
| `tel:` tap-to-call | Yes | Yes | Number shown as text |
| Camera via file input | Yes | Yes | Gallery pick |
| Opera Mini | No SW, no push | n/a | "Open in Chrome" banner |
