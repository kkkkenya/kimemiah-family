# Launch checklist

Everything here must pass before family meeting 1.

## Security

- [ ] With only the public key and no sign-in, every table returns nothing and nothing can be added.
- [ ] A phone that hasn't entered the PIN sees nothing.
- [ ] A removed phone loses access on its next request.
- [ ] 6 wrong PINs from one connection cause a lockout. 31 wrong PINs from anywhere lock unlocking for an hour and alert the owner.
- [ ] A money entry can't be edited or deleted. A correction works and shows in the activity log.
- [ ] A change that claims to be from someone else is corrected to the real person.
- [ ] No secret key, PIN hash or private push key appears anywhere in the app's downloaded code.
- [ ] The push function refuses calls without its secret.
- [ ] Supabase's security advisor reports no errors.
- [ ] A backup restores into a scratch project with matching row counts.

## Devices

Test phones: a low-end Android (2-3 GB RAM), a mid-range Samsung, and a family iPhone on iOS 16.4 or newer.

| Scenario | Low-end Android | Samsung | iPhone |
|---|---|---|---|
| Install, PIN, "Who are you?" | ✓ | ✓ | ✓ (Share > Add to Home Screen) |
| Airplane mode: lower stock, add shopping item, log spend. Reconnect and all sync | ✓ | ✓ | ✓ |
| Two phones offline both lower beans. Both changes count | ✓ | ✓ | |
| Taking a job offline is blocked. Two phones online, first one wins | ✓ | ✓ | |
| App swiped away mid-save. Change survives and syncs on reopen | ✓ | | ✓ |
| Push with app closed ("going to the market"). Tap opens Shop | ✓ (battery saver on) | ✓ | ✓ (installed) |
| Nothing arrives at 10pm | ✓ | | |
| Site data cleared with unsynced changes. App warns and reloads | ✓ | | |
| Cold start on a slow connection. First load under about 250 KB | ✓ | | |
| Reduced motion and dark mode | | ✓ | ✓ |
| Removed phone loses access | ✓ | | |

## Phone setup notes

**Android:** open the link in Chrome (not Opera Mini), enter the PIN, pick your name, tap "Add to home screen", open from the icon, allow alerts. On Tecno, Infinix and Xiaomi phones also set Settings > Apps > Chrome > Battery > Unrestricted, or alerts arrive late.

**iPhone:** open the link in Safari, Share > Add to Home Screen, open from the new icon, then enter the PIN, pick your name and allow alerts. Alerts need iOS 16.4 or newer. On older iPhones the app works without alerts.

**Dad:** same steps on his phone, or install from Chrome or Edge on a laptop.
