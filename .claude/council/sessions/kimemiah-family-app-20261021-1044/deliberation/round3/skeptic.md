## Skeptic Final Position: Kimemiah family app

**Revised recommendation:** Ship with anonymous Supabase auth per device, unlocked by a family PIN checked on the server. Reads work offline everywhere. Every action except a claim can be written offline. Money stays append-only. The real controls are RLS, server-set `actor_id` and nightly encrypted backups. The PIN is a gate and nothing more.

**Concessions made:**
- **Full offline writes.** The user asked for them, and deltas, insert-only money and soft deletes make conflicts boring. Last-write-wins on notes, contacts and meal slots is acceptable.
- **Architect's anonymous auth per device in place of my 6 member users.** No member passwords to store, and a lost phone can be revoked on its own.
- **Push at launch, 3 events.** It is acceptable with quiet hours, a kill switch and coalescing.
- **Residual risk accepted:** anyone with the PIN can act as any member. Within the family, the audit log is the deterrent.

**Non-negotiables:**
1. The PIN is never compared on the phone. The first unlock must be online.
2. Every table has RLS. There are no anon policies and no DELETE policies, and `money_entries` has no UPDATE policy.
3. `apply_mutations` is `SECURITY INVOKER`, or uses a hard table/column allowlist, and sets `actor_id` from the device row on the server.
4. The service-role key, PIN hash, VAPID private key and notify secret are server-only. No `NEXT_PUBLIC_` prefix, never committed.
5. A nightly encrypted backup, with one restore tested before launch.

**Implementation notes:**
- Unlock limits: 5 failures per IP per 15 minutes, a global cap of 30 failures an hour that locks sign-in for an hour, and an alert to the user. Count by IP hash, never by device.
- `is_household()` joins `devices` where `revoked_at is null` and `member_id is not null`.
- Changing the PIN revokes all devices. Revoking a single device is available under More.
- The notify function checks a shared-secret header. Push text never carries amounts. Replayed events older than 1 hour don't send a push.
- Notes and thank-yous render as plain text (no `dangerouslySetInnerHTML`). Phone numbers are stored as text.
- Set `noindex`, and keep Vercel Deployment Protection on preview deployments.

**Pre-launch security checklist (each must pass):**
- [ ] Anon key, no session: `select` on every table returns 0 rows, and `insert` fails.
- [ ] Anon key on a device that hasn't unlocked: the same result.
- [ ] Revoked device: reads fail on its next request (no waiting for JWT expiry).
- [ ] 6 wrong PINs from one IP get a lockout. 31 wrong PINs across IPs trigger the global lock and an alert.
- [ ] Updating or deleting a `money_entries` row fails. A void entry succeeds and the audit row appears.
- [ ] `apply_mutations` with a forged `actor_id` or an unknown table is rejected or overwritten.
- [ ] Searching the client bundle finds no service key, PIN hash, VAPID private key or notify secret.
- [ ] A notify call without the secret header gets a 401.
- [ ] The Supabase security advisor reports no errors.
- [ ] The backup restores into a scratch project, and row counts match.

**Secrets setup (`scripts/setup-env.mjs`):**
- Asks for each value with hidden input. Pressing Enter keeps the existing value. It writes a git-ignored `.env.local` (and `.gitignore` covers it before the first commit). `.env.example` lists the names only: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `FAMILY_PIN_HASH`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `NOTIFY_SHARED_SECRET`, `BACKUP_AGE_RECIPIENT`.
- The family PIN is entered twice. It must be at least 6 digits and must not be repeated digits, a sequence or a birth year. It is stored as a bcrypt hash only.
- VAPID keys and the notify secret are generated, not typed.
- Checks: the URL and anon key get a 200 from a REST health call. The service key succeeds on an admin `listUsers` call. VAPID keys parse. Each failure gets a clear message ("service key rejected: 401, check you copied service_role, not anon").
- Optionally pushes the values to Vercel (`vercel env add`), and the database URL and age recipient to GitHub secrets (`gh secret set`). Nothing is echoed or logged.
