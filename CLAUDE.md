# CLAUDE.md — CLS (CAS League Scoring)

This file briefs a fresh Claude conversation on the league-manager project so it can be productive from message one. Update it whenever conventions, architecture, or major flows change. Keep entries terse — let the code be the source of truth for details.

## What this is

A Next.js 15 App Router application that manages race leagues, seasons, registrations, results, incident reports, decisions, and penalty pools for the CAS sim racing community. Backed by Postgres (Neon) via Prisma. Deployed on Vercel.

## Tech stack

- Next.js 15 App Router — Server Components by default, Server Actions for mutations
- Prisma ORM + Postgres (Neon serverless, pooler URL)
- NextAuth.js with PrismaAdapter + Discord OAuth
- Tailwind CSS — dark zinc-based theme
- PayPal integration for registration fees (per-league config on `League`)
- Vercel deployment + Vercel Cron (Hobby tier — daily only) + GitHub Actions cron for sub-daily schedules

## Repo & deployment

- **Local path**: `~/Nextcloud/AI/league-manager` (Nextcloud-synced)
- **GitHub**: https://github.com/halvar20000/simracing-hub-league-manager — branch `main`
- **Deploy flow**: any push to `main` triggers a Vercel build. The sandboxed Claude environment cannot push directly — Claude writes a shell script to `outputs/` and the user runs it in their Mac terminal.
- **Standard footer for change scripts**: `npx tsc --noEmit -p tsconfig.json` → `git add -A` → `git commit -m "..."` → `git push`.

## CRITICAL: schema changes on Neon

**Use `npx prisma db push`. Do NOT run `prisma migrate dev`.**

The migration files in `prisma/migrations/` do not match Neon's actual schema state. `migrate dev` detects drift and offers `migrate reset`, which wipes all data. `db push` syncs the schema without touching migration history and is safe for additive changes (new columns with defaults, new indexes, new optional relations).

After `db push`, run `npx prisma generate` to refresh the typed client.

## Scripts directory

- TS/Node one-offs go in `scripts/` (not `/tmp`). `tsx` resolves `@prisma/client` relative to the script file's location — keeping scripts inside the project means `node_modules` is reachable.
- Naming convention: `scripts/lm_<purpose>.ts` or `.cjs`.
- Replayable shell scripts live in `outputs/` so they can be re-run after a sync.

## Server actions

- A function used directly as `<form action={fn}>` MUST return `void` or `Promise<void>`. Returning a result object causes a TypeScript error.
- File header `"use server";` at the top.
- After mutation, call `revalidatePath(...)` for every affected route. Use `redirect(...)` to navigate after the mutation completes if needed.
- If a helper needs to be called from both a server action AND an API route, put the pure logic in a separate non-`"use server"` file (e.g. `src/lib/notify-reporting.ts`) and have both wrappers import it. Otherwise Next.js can silently drop the API route from the build.

## Leagues (League.slug → name → mode)

| Slug | Name | Mode |
|---|---|---|
| `cas-gt3-wct` | CAS GT3 WCT | Solo + penalty pool auto-forgiveness (GT3 WCT only feature) |
| `cas-iec` | CAS IEC | Team mode (`Season.teamRegistration=true`) |
| `cas-tss-gt4` | CAS TSS GT4 | Solo |
| `cas-pccd` | CAS PCCD | Solo |
| `cas-combined-cup` | CAS Combined Cup | Solo |
| `cas-sfl-cup` | CAS SFL Cup | Solo |

## URL structure

- `/admin/leagues/[slug]/seasons/[seasonId]/...` — admin views, gated by `requireAdmin()` / `requireSteward()`
- `/leagues/[slug]/seasons/[seasonId]/...` — public views
- `/incidents` — public, all incident reports grouped by league
- `/leagues/[slug]/seasons/[seasonId]/penalty-pool` — public penalty pool (matrix table, read-only)
- `/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool` — admin penalty pool (per-driver Release button, Recompute button for GT3 WCT)
- `/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]` — round results page with Combined / Quali / Race / Pro / Am / Team / By Car / Teams tabs + "Standings →" link
- `/leagues/[slug]/seasons/[seasonId]/standings` — season standings; on GT3 WCT shows a "View penalty pool →" button

## Auth & roles

- Discord OAuth via NextAuth.
- `User.role` enum: `DRIVER | ADMIN | STEWARD`.
- Helpers `requireAdmin()` and `requireSteward()` live in `@/lib/auth-helpers`.
- New Discord logins create a fresh `User` with `role=DRIVER`. To promote, update the row server-side; the user must sign out / sign back in for the JWT to refresh.
- When two `User` rows must be merged (e.g. an orphan admin record + a fresh Discord-linked one), keep the Discord-linked record as the survivor so login keeps working. Clear unique-constrained fields on the duplicate (`iracingMemberId`, etc.) before copying to the survivor; repoint FKs on `Account`, `Session`, `Registration` (both `userId` and `approvedById`), `IncidentReport.reporterUserId`, `IncidentDecision.decidedByUserId`, `IncidentReportComment.authorUserId`, `IncidentReportEvidence.addedByUserId`, `League.createdById`, `CsvImport.uploadedById`; delete duplicate last.

## Penalty pool (GT3 WCT only)

- **Engine**: `src/lib/penalty-pool.ts:recomputePenaltyPoolForSeason(seasonId)` — pure, idempotent, hard-gated by `season.league.slug === "cas-gt3-wct"`.
- **Schema field**: `Penalty.autoForgivenPoints Int @default(0)` — owned 100% by the engine; reset before every recompute. Manual admin forgiveness lives in `Penalty.forgivenPoints`. Effective pool point per penalty = `pointsValue - forgivenPoints - autoForgivenPoints`.
- **Rule**: per registration, walk rounds with `status = COMPLETED` that the driver entered (any `RaceResult` row). If a new `Penalty` (type=POINTS_DEDUCTION, pointsValue>0) was issued in that round → clean counter resets to 0. Otherwise if pool > 0, counter++; at counter = 2, forgive 1 from the oldest non-fully-forgiven penalty (FIFO) and reset counter. Stops when pool reaches 0.
- **Auto-triggers**:
  - `src/lib/actions/admin-reports.ts:submitDecision` — after a verdict is upserted/published
  - `src/lib/actions/admin-reports.ts:deleteDecision` — after a verdict is removed
  - `src/lib/actions/admin-reports.ts:deleteIncidentReport` — after a report is permanently deleted
  - `src/lib/actions/rounds.ts:updateRound` — when status flips to `COMPLETED`
- **Manual recompute**: `recomputePenaltyPoolAction` in `src/lib/actions/penalty-pool-recompute.ts`; exposed via a "Recompute auto-forgiveness pool" button on the admin penalty-pool page (rendered only when slug = `cas-gt3-wct`).

## Reporting / decisions flow

- Public reporting: `/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report` — open only when the round's reporting window is active (driven by `ScoringSystem.protestCooldownHours` / `protestWindowHours`).
- Reports queue (admin): `/admin/leagues/[slug]/seasons/[seasonId]/reports`
- Steward review (admin): `/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]` — shows `replayTimestamp` (the in-game replay time) prominently at the top alongside session/lap/turn. This is the most important field for steward review.
- Verdicts enum: `NO_ACTION, WARNING, REPRIMAND, TIME_PENALTY, POINTS_DEDUCTION, GRID_PENALTY_NEXT_ROUND, SUSPENSION`.
- Penalty types enum: `TIME_PENALTY, POINTS_DEDUCTION, GRID_PENALTY, WARNING`.
- Penalty categories: `ScoringSystem.categoryPointsTable` is a JSON map of level (`"0" | "1" | "2" | "3"`) → points. Helpers in `src/lib/penalty-categories.ts` (`pointsForLevel`, `readCategoryPoints`, `PENALTY_LEVELS`, `PENALTY_LEVEL_LABEL`, `DEFAULT_CATEGORY_POINTS`).
- Live points indicator while issuing a verdict: `src/components/CategoryLevelSelect.tsx` (client component) — shows "Will deduct N penalty points" inline as the steward picks a category level.
- Public incidents overview: `/incidents`, grouped by league.

## Discord notifications

- `src/lib/notify-reporting.ts:notifyReportingOpenForRound(roundId)` — pure helper, idempotent via `Round.reportingNotifiedAt`.
- Cron endpoint: `/api/cron/notify-reporting-open` — requires `Authorization: Bearer ${CRON_SECRET}`. Has `runtime = "nodejs"`, `dynamic = "force-dynamic"`, `maxDuration = 60`.
- Schedulers:
  - `vercel.json` cron — daily at 09:00 UTC (Hobby tier ceiling)
  - `.github/workflows/cron-reporting-open.yml` — every 30 min, runs free on GitHub Actions
- Team-mode change notifications use a similar pattern via `src/lib/actions/registrations.ts:notifyTeamChange`.

## Logos

- `public/logos/site-logo.png` — top nav logo (CAS LEAGUE SCORING SYSTEM)
- `public/logos/cls-league-scoring.png` — OG/social card logo (same image)
- `public/logos/cas-community.webp` — home-page CAS Community badge (separate; leave alone)
- The old SimRacing-Hub-style `site-logo.svg` was removed.

## OG / SEO

`@/lib/og:pageMetadata({ title, description, url })` — call from `generateMetadata` on every public page so Discord/Twitter previews render properly. Also `pageMetadataLarge` for hero variants.

## UI conventions

- Dark zinc theme (`bg-zinc-900`, `bg-zinc-950`, `border-zinc-800`). Accents:
  - **Amber** — pending pool points, warnings
  - **Cyan** — auto-forgiveness, info
  - **Emerald** — clean races, success
  - **Red** — danger, released penalties, destructive actions
  - **Orange `#ff6b35`** — primary CTA
- Tab nav: pattern uses `pillBase` + `pillOn` / `pillOff` class triplet (see the round results page for the canonical example).
- Tables: `tabular-nums`, `border-t border-zinc-800` rows, `hover:bg-zinc-900/60`.
- Forms: `SubmitWithSpinner` component (`@/components/SubmitWithSpinner`) for submit buttons.
- Destructive actions: wrap in a `<details>` "Danger zone" so the button is only visible after expanding. See the report-delete pattern.

## Common gotchas

- **API routes that import from a `"use server"` file** can be silently dropped from the build. Put shared logic in a non-`use server` helper and have both the action and the route import it.
- **Prisma in API routes** needs `export const runtime = "nodejs"` (not edge).
- **Multi-step user merges** must clear unique-constrained fields on the dupe before copying to the survivor; see the auth section.
- **Server actions used as `<form action>`** must return `void | Promise<void>`.

## Editing this file

Treat this as living documentation. When a new convention emerges, a new league launches, or a major flow changes, update the relevant section. Don't let it grow into a wiki — entries should be terse pointers; the code is authoritative.
