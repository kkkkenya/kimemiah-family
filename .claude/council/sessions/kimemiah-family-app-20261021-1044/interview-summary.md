# Interview Summary: Kimemiah family app

## Core Intent
Revise the household plan into a buildable design: a family-owned web app (not a Claude Artifact) for stock, shopping, volunteer jobs, Dad's money, budget, meetings, meals and contacts. Collaboration by volunteering, not assignment.

## Key Decisions Made
- Own web app: Next.js on Vercel + Supabase, user's existing accounts (GitHub kkkkenya), free tiers.
- Six users with full access: Mom, sister, two brothers, user, and Dad (remote).
- Mom is very comfortable with smartphones.
- Sign-in: shared family PIN.
- Works online and offline; syncs when connection returns.
- First release ships all 8 sections.
- Phone push notifications wanted.
- Site-wide preference: GSAP + Lenis + React Bits for web UI.

## Open Questions for Deliberation
- How to keep "who did what" (thank-yous, job pickup, spending) with a shared PIN.
- How safe is a shared PIN for an internet-facing app holding family money records.
- Offline sync design and conflict handling (two phones edit stock offline).
- Is "everything at once" realistic, and what order to build in.
- Push notifications on Android and iPhone via PWA; which events notify.
- How much motion is right for a daily utility app on budget phones.

## Perspective Relevance Scores
| Perspective | Score | Rationale |
|---|---|---|
| Architect | 5 | New app, data model, offline sync |
| Advocate | 5 | Six non-technical daily users |
| Skeptic | 4 | Shared-PIN auth, money data on the internet |
| Pathfinder | 4 | PWA, offline, push, home-screen install |
| Strategist | 4 | All 8 sections at once vs phased |
| Artisan | 3 | UI-heavy app, motion stack preference |
| Guardian | 3 | Family financial data, overlaps Skeptic |
| Craftsman | 3 | Sync correctness tests |
| Tuner | 2 | Small data, low-end phones |
