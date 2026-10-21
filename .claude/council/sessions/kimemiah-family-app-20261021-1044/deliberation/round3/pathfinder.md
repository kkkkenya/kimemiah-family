## Pathfinder Final Position — Kimemiah family app

**Revised recommendation:** Ship an installable PWA from one Next.js shell that renders on the phone. Pages are precached by Serwist. Data lives in Dexie with an outbox that syncs to Supabase, and each phone signs in anonymously and stays signed in. Web push covers 3 events at launch. There is no native wrapper.

**Concessions made:**
- I dropped "system fonts only." Self-hosted Young Serif and Atkinson Next are downloaded once (~70 KB), precached, and free on every later open.
- I accept SplitText on the Home greeting, and Lenis on two read-only pages with touch smoothing off.
- Money takes Meals' place on the bottom bar. Meals moves under More, with a Today's meals card on Home.
- Job and cooking claims need a connection. Everything else works offline.

**Non-negotiables:**
- Data pages never depend on a server render. The service worker never caches Supabase responses.
- Stock syncs as deltas. Unsynced or rejected changes are always visible (the "N changes not synced" badge).
- The push permission prompt only appears after a tap, never on launch. iPhone push only works after install.
- The bottom bar has 5 tabs. Every sub-screen has an in-app back arrow, because an installed iPhone app has no browser back button.
- First load is at most ~250 KB. Later opens cost close to 0 KB.

**Implementation notes:**
- **Sync:** flush on app open, `online` and `visibilitychange`, and every 30 s while the app is on screen. Add a Background Sync tag for Android. Call `navigator.storage.persist()` after install.
- **Claims offline:** the button is greyed out and labelled "Needs connection to claim". Never queue a claim.
- **Session:** the first unlock is online. The Supabase session is saved, so the app opens offline. The "Who are you?" picker sets `member_id` on the device, and the push subscription is linked to it.
- **Push:** subscribe on a tap. `notificationclick` focuses an open app window if there is one, else opens a new one at the deep link. Re-subscribe when `pushsubscriptionchange` fires. Delete subscriptions when the server gets a 404/410.
- **Manifest:** `display: standalone`, `start_url: /`, and `theme_color`/`background_color` from Artisan's jacaranda and paper tokens. Icons are 192 and 512 px maskable, plus a 180 px apple-touch-icon.
- **Opera Mini:** detect it and show an "Open in Chrome" banner.

### Install and onboarding
**Android (Chrome):**
1. Open the link sent on WhatsApp in Chrome.
2. Enter the family PIN (needs a connection).
3. Pick "Who are you?"
4. Tap "Add to home screen" when the app offers it (our own button, triggered by `beforeinstallprompt`).
5. Open the app from the home-screen icon.
6. Tap "Get shopping alerts" and allow notifications.
7. Follow the in-app card: Settings > Apps > Chrome > Battery > Unrestricted. This matters on Tecno, Infinix and Xiaomi phones, which otherwise delay pushes.

**iPhone (Safari, iOS 16.4+):**
1. Open the link in Safari.
2. Follow the in-app sheet: Share > Add to Home Screen.
3. Open the app from the icon. Push and storage only behave properly from there.
4. Enter the PIN.
5. Pick "Who are you?"
6. Tap "Get shopping alerts" and allow notifications.

If the iPhone is on iOS 15 or older, the app still works but there are no pushes; that person relies on WhatsApp.

**Dad (remote):** the same steps on his own device. On a laptop, Chrome or Edge can install the app from the address bar.

### Launch device test matrix
| Scenario | Low-end Android (2-3 GB, Go-class) | Mid Samsung | iPhone (16.4+) |
|---|---|---|---|
| Install + PIN + picker | ✓ | ✓ | ✓ (Share sheet) |
| Airplane mode: stock −, add shopping item, log spend, then reconnect and confirm all of them sync | ✓ | ✓ | ✓ |
| Two phones offline both lower beans, then both deltas land | ✓ | ✓ | — |
| Claim offline is blocked; claim race online gives first-claim-wins | ✓ | ✓ | — |
| App swiped away mid-save, outbox survives and flushes on reopen | ✓ | — | ✓ |
| Push with app closed ("going to market"); tap opens Shop | ✓ (battery saver on) | ✓ | ✓ installed |
| Quiet hours (22:00) suppresses push | ✓ | — | — |
| Clear site data while changes are unsynced, then app warns and re-downloads | ✓ | — | — |
| Cold start on Slow 3G + 4x CPU, first load ≤250 KB | ✓ | — | — |
| Reduced motion + dark mode | — | ✓ | ✓ |
| Revoked device loses access on next sync | ✓ | — | — |
