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
| `cas-gt3-wct` | CAS GT3 WCT | Solo + penalty pool auto-forgiveness; teams hard-capped at 3 drivers (`src/lib/team-limit.ts`) — both GT3 WCT only |
| `cas-iec` | CAS IEC | Team mode (`Season.teamRegistration=true`). Optional non-driving Teammanager per team (`Team.managerUserId` + `Registration.isTeamManager`): registers via checkbox on the team form, auto-approved, no fee/invitation, excluded from rosters/caps/RSVP, listed separately, has Manage Team rights and assigns the Teamchef (`leaderUserId`, must be a driver) |
| `cas-tss-gt4` | CAS TSS GT4 | Solo |
| `cas-pccd` | CAS PCCD | Solo |
| `cas-combined-cup` | CAS Combined Cup | Solo |
| `cas-sfl-cup` | CAS SFL Cup | Solo + team championship matching iRLM: multi-race rounds score each race separately (best 2 per team per race, raw-only, best 7 events). 7th Season verified 14/14 vs iRLM (June 2026); apply same config (weeksCounted=7, rawOnly=true) to new seasons |

## Season status

`SeasonStatus` enum: `DRAFT | OPEN_REGISTRATION | ACTIVE | PAUSED | COMPLETED`.

`PAUSED` = put a season on hold without deleting it. The reporting-window and RSVP crons (`/api/cron/notify-reporting-open`, `/api/cron/post-rsvp`) only fire for `OPEN_REGISTRATION`/`ACTIVE`, so a `PAUSED` season stops all Discord announcements; registration also closes (the open-registration guards check for `OPEN_REGISTRATION`/`ACTIVE`). Switch back to `ACTIVE` to resume. Set via the admin season-edit page. The `{ in: ["OPEN_REGISTRATION","ACTIVE"] }` "currently running" filters deliberately exclude `PAUSED`.

## Results publish gate (COMPLETED = published)

A round's results and their standings impact go public **only** when `Round.status === "COMPLETED"`. Workflow: race runs → admin imports results → admin previews → admin clicks **✓ Publish results** (or sets `COMPLETED` on the round-edit form) → published.

- **Publish button**: `setRoundPublished(formData)` in `src/lib/actions/rounds.ts` flips status to `COMPLETED` (publish) or `IN_PROGRESS` (unpublish) and runs the *same* downstream pipeline as `updateRound` (no-show penalties → penalty-pool recompute → Discord results post via `after()`). Rendered as a green "✓ Publish results" / "Unpublish" `<form action>` on the admin round page (disabled until results exist).

- **Engine** (`src/lib/standings.ts`): all four compute functions (`computeDriverStandings`, `computeTeamStandings`, `computeCarStandings`, `computeTeamClassStandings`) take an optional `opts: StandingsOptions = {}` 4th/3rd arg. Default (no opts) counts **only COMPLETED rounds** — every round/raceResult/teamResult/penalty query is gated by `round.status = COMPLETED`. Pass `{ includeUnpublishedRounds: true }` for admin preview. Every public caller (standings page, season/league/home pages, `/api/overlay/standings`) uses the default and is automatically gated.
- **Admin preview**: gated by the soft, non-redirecting `isAdminOrSteward()` (`src/lib/auth-helpers.ts`). The public round page and standings page render the pending round's tables to admins/stewards with an orange "Preview — admin only" banner; the public sees a "results are being reviewed" note (round page) and standings frozen at the last COMPLETED round. The admin round page has a "👁 Preview public" link. Round OG metadata hides the podium until COMPLETED. Season schedule shows "Pending" (not a results link) until COMPLETED.
- Consistent with existing COMPLETED-triggered side effects (Discord results post, penalty-pool/no-show settlement) — nothing publishes before COMPLETED.

## Car Class vs Driver Class

Two **independent** concepts — never conflate them:

- **Car Class** — the car *category*. Schema: `CarClass` model, `Season.isMulticlass`, `Registration.carClassId`, `TeamResult.carClassId`. Real multi-class racing only. `computeTeamClassStandings` runs a per-class championship off `TeamResult.carClassId`.
- **Driver Class** — the driver's *Pro/Am tier*. Schema: `Season.proAmEnabled`, `Registration.proAmClass` (`PRO | AM`). Admin-assigned — drivers never pick it. `computeDriverStandings` derives Pro/Am class-relative points purely from `proAmClass`.

Target per-season config:

| League | isMulticlass | proAmEnabled | Notes |
|---|---|---|---|
| GT3 WCT | false | true | one car class ("GT3"); Pro/Am via `proAmClass` |
| IEC | true | false | team picks a car class at registration |
| Combined Cup | false | false | car class varies per round — kept in the round name, not modelled |
| TSS GT4 / SFL Cup / PCCD / Nascar | false | false | single car class or none |

**Legacy note:** the *current* GT3 WCT season predates this model — it is `isMulticlass=true` with two `CarClass` rows named "Pro"/"Am" (Pro/Am stored as fake car classes, duplicated with `proAmClass`). Left as-is until it ends; only new GT3 WCT seasons use the clean config. Hardcoded `slug === "cas-gt3-wct"` shims in the registration form/action exist only for this transition and can be removed once the legacy season is over.

**Cleanup plan (UI reads Driver Class from `proAmClass`, not car class):**
1. Round results page (`rounds/[roundId]/page.tsx`) — Pro/Am tabs + class-relative points filter on `registration.proAmClass`, not `carClass.shortCode`. Pro/Am column gated on `proAmEnabled`; car-class "Class" column stays gated on `isMulticlass`.
2. Roster pages (admin + public) — drop the `proAmIsClass` hack; show a Pro/Am column when `proAmEnabled` (from `proAmClass`) and a Car Class column when `isMulticlass` (from `carClass`).
3. `league-templates.ts` — `endurance-pro-am` template set to `isMulticlass=false` so new GT3 WCT seasons start clean.
4. Admin season-edit page — relabel the two checkboxes to "Multiclass season (multiple car classes)" and "Pro/Am driver split".
5. No data migration: the legacy GT3 WCT season is untouched; these changes are safe for it because its `proAmClass` is already populated.

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

- **Two penalty-application modes** (gate: `src/lib/penalty-application.ts:isPerRacePenaltySeason(slug, seasonId)`):
  - **Deferred (legacy — 12th Season `cmoeftuep0009lb04dlxe44ad` only, hardcoded)**: penalties pool all season; admin releases the remaining pool at season end (`releasedAt`), which is then deducted from totals.
  - **Per-race (13th Season onward, all new GT3 WCT seasons)**: incident penalties are deducted in FULL in the round they were incurred — in driver standings (`computeDriverStandings`: per-round `penaltyPoints` + season total) AND in team scoring (`computeTeamStandings`: penalty-adjusted contribution BEFORE best-N selection, so a penalty can change who counts). The pool still tracks penalties, but only to compute forgiveness. When `Season.status` flips to `COMPLETED`: forgiveness (auto + manual, capped at each penalty's pointsValue) is credited back to the SEASON TOTAL (`DriverStanding.forgivenessCredit`), and NO_RSVP_NO_SHOW points are deducted from the season total. Individual race results are never touched by forgiveness or no-shows. `releasedAt` is ignored; Release buttons + Released column are hidden on both penalty-pool pages. The round results page also adds this round's incident penalties to its points tables. Gating is by hardcoded legacy-season exclusion because both seasons share one ScoringSystem row.
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

## Per-round RSVP (Discord bot)

Drivers RSVP for each round via three buttons (Accept / Decline / Tentative) on a Discord embed posted N days before the race. Same upsert is available from the public round page widget; the two stay in sync.

- **Env vars**: `DISCORD_BOT_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APPLICATION_ID`. Discord Interactions Endpoint URL must be set to `https://league.simracing-hub.com/api/discord/interactions`.
- **League config**: `League.discordGuildId`, `League.discordRsvpChannelId`, `League.rsvpDaysBefore` (default 7), `League.rsvpMode` (`FULL` default | `DECLINE_ONLY`), `League.rsvpCloseBeforeHours` (default 1). Set per-league via admin → league edit.
- **Modes**: `FULL` renders Accept / Decline / Tentative buttons with three driver lists. `DECLINE_ONLY` renders a single red Decline button — silent drivers are assumed to be racing; clicking Decline twice toggles (un-declines). Used for CAS GT3 WCT so most drivers don't need to click anything. Toggle path goes through `src/lib/rsvp.ts:toggleDecline` rather than `upsertRsvp`.
- **Close window**: `src/lib/rsvp-window.ts:isRsvpClosed` — RSVP locks `rsvpCloseBeforeHours` before race start. Discord embed renders disabled buttons + "Registration closed" footer; interactions endpoint rejects late clicks with an ephemeral message; website widget hides buttons. Cron `/api/cron/rsvp-close` + `.github/workflows/cron-rsvp-close.yml` (every 15 min) flips embeds to closed state, idempotent via `Round.rsvpClosedAt`.
- **Data model**: `RoundRsvp(roundId, registrationId, status: ACCEPTED|DECLINED|TENTATIVE, source: DISCORD|WEBSITE|ADMIN)`, unique `(roundId, registrationId)`. `RoundDiscordRsvpMessage` stores the posted message ID so the bot can edit it on every change.
- **Posting**: `src/lib/notify-rsvp.ts:postRsvpForRound` (idempotent via `Round.rsvpNotifiedAt`). Cron: `/api/cron/post-rsvp` + `.github/workflows/cron-post-rsvp.yml` (every 30 min).
- **Reminders**: removed 2026-05-14 — no league uses RSVP reminders anymore. The 48h/12h reminder system (`notify-rsvp-reminder.ts`, `/api/cron/rsvp-reminders`, `Round.rsvpReminder48hAt`/`12hAt`) was deleted. If you want to reintroduce silent-driver pings, look at the git history of those paths.
- **Button clicks**: `/api/discord/interactions` verifies Ed25519 signature with Node's built-in `crypto.verify` (no tweetnacl dep). Resolves Discord ID → User via two paths in `findUserByDiscordId`: first `Account.providerAccountId` where `provider = "discord"` (set on first website login), then `User.discordId` (admin-set on `/admin/users` for a pre-registered driver who has not logged in yet). `auth.ts` first-login auto-link prefers a `User.discordId` match over name matching.
- **Pure helpers**: `src/lib/rsvp.ts` (`upsertRsvp`, `refreshDiscordRsvpMessage`, `getRoundRsvpSummary`, `findUserByDiscordId`). Imported by both the API route and `src/lib/actions/rsvp.ts` — do NOT add `"use server"` to `rsvp.ts` (see "Common gotchas").
- **Embed builder**: `src/lib/discord-rsvp-embed.ts` — single source of truth for embed shape + button `custom_id` (`rsvp:<roundId>:<status>`).
- **REST helpers**: `src/lib/discord-bot.ts` — bot-token authenticated (`Authorization: Bot ...`), distinct from `discord-webhook.ts` (anonymous).
- **Admin overview**: `/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/rsvp` — tallies, per-status driver lists, silent-drivers highlight, "Post now" / "Refresh embed" buttons. The full driver table has a per-driver **Admin override** column (`AdminRsvpControl` → `adminSetRsvpAction`): Accept/Decline/Tentative/Clear any driver's RSVP, stamped `source=ADMIN`, ignoring the close window. Does not re-run the GT3 WCT no-show penalty.

### No-RSVP-no-show penalty (GT3 WCT only)

- Helper: `src/lib/no-rsvp-penalty.ts:applyNoRsvpNoShowPenalties(roundId)` — pure, idempotent, hard-gated by `league.slug === "cas-gt3-wct"`.
- Trigger: `src/lib/actions/rounds.ts:updateRound` runs the helper on every save. When status flips to `COMPLETED`: drivers with no `RaceResult` AND no `RoundRsvp` row at all get a `Penalty(source=NO_RSVP_NO_SHOW, type=POINTS_DEDUCTION, pointsValue=1, reason="No RSVP and no-show")`. When status flips back away from `COMPLETED`: auto-penalties are deleted.
- Pool integration: `src/lib/penalty-pool.ts` walks rounds where the driver entered OR carries a penalty, so `NO_RSVP_NO_SHOW` correctly resets the clean-race counter even though the driver didn't enter that round.

## Discord community stats

- Admin page `/admin/discord-stats` — 30-day activity snapshot of the CAS Discord server: per member, chat activity (messages), league activity (raced/RSVP'd), join recency, CLS-link status.
- Builder: `src/lib/discord-stats.ts:buildDiscordStats()` — bot REST API: lists guild members, scans every readable text channel's last-30-day message history (time-budgeted, ~45s), joins CLS data. `saveDiscordStatsSnapshot()` persists the result to the `DiscordStatsSnapshot` table (one JSON row per refresh). Slow — never call from a page render.
- Refresh: daily cron `/api/cron/discord-stats` + `.github/workflows/cron-discord-stats.yml` (04:30 UTC); manual "Refresh" button on the page → `refreshDiscordStatsAction`. The page reads the latest snapshot only.
- Trend chart: `DiscordMonthlyActivity` (one row per `YYYY-MM`) holds per-month message + active-member counts. `buildMonthlyActivity(monthsBack)` scans far-back history; the one-time backfill `scripts/lm_backfill_discord_activity.ts` populates ~24 months. Past months are immutable, so `saveDiscordStatsSnapshot` rewrites only the current month on each refresh. The page renders the last 24 months as an SVG chart (message bars + active-members line).

## Discord results post + new-member welcome

- After-race results: `src/lib/notify-results.ts:postRoundResults(roundId)` posts a podium embed (+ links to the full classification and standings) to `League.discordResultsChannelId`. Triggered from `updateRound` (via `after()`) when a round flips to `COMPLETED`; idempotent through `Round.resultsPostedAt`; a no-op when the channel is unset or results aren't imported yet, so it retries on the next round save.
- New-member welcome: the REST bot has no gateway, so a daily cron (`/api/cron/discord-welcome` + `.github/workflows/cron-discord-welcome.yml`, 16:00 UTC) runs `src/lib/notify-welcome.ts:runWelcome()` — it lists guild members, batches everyone who joined since the `League.discordWelcomeAfter` watermark, and posts ONE message to `League.discordWelcomeChannelId` naming them (no @mention; `allowed_mentions.parse=[]`). The first run just sets the watermark so existing members aren't bulk-welcomed. `League.discordWelcomeMessage` is an optional template (`{names}` placeholder).
- Both features are off until their channel IDs are set on the admin league-edit page.

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
- Forms: every `<form action>` submit button MUST use `SubmitWithSpinner` (`@/components/SubmitWithSpinner`) — never a raw `<button type="submit">`. It disables the button while the server action is in flight; a raw button lets impatient users click repeatedly, double-firing non-idempotent side effects (e.g. duplicate registration notification emails).
- Destructive actions: wrap in a `<details>` "Danger zone" so the button is only visible after expanding. See the report-delete pattern.

## Common gotchas

- **API routes that import from a `"use server"` file** can be silently dropped from the build. Put shared logic in a non-`use server` helper and have both the action and the route import it.
- **Prisma in API routes** needs `export const runtime = "nodejs"` (not edge).
- **Multi-step user merges** must clear unique-constrained fields on the dupe before copying to the survivor; see the auth section.
- **Server actions used as `<form action>`** must return `void | Promise<void>`.

## Public overlay API (consumed by iRacing OBS overlay)

- `GET /api/overlay/standings?league=<slug>[&season=<id>]` — pre-race championship for a league, plus the scoring tables and per-driver `User.iracingMemberId` for telemetry matching. If `season` is omitted, picks the most recent `ACTIVE`/`OPEN_REGISTRATION` season. Reuses `computeDriverStandings`.
- `GET /api/overlay/leagues` — list of leagues + their runnable seasons; used by the overlay's config picker.
- **Public, CORS-open** (`Access-Control-Allow-Origin: *`), edge-cached briefly. No auth — these are read-only and expose only already-public standings data, never iRating/team/email/penalties beyond what the public site shows.
- Consumed by `iracing_championship.py` in the iRacing-overlays project (`~/Nextcloud/iRacing/python/files/`).

## Changelog & versioning

`src/lib/changelog.ts` is the single source of truth for the site version (semver, started 1.0.0 on 2026-06-12) and feeds the public `/changelog` page and the footer version link. **Every user-visible change MUST add an entry at the top of `CHANGELOG` and bump the version**: feature → minor, fix/tweak → patch, big rework → major. Include `src/lib/changelog.ts` in the deploy script's `git add`. Internal-only changes (cron, refactors) don't need an entry.

## Editing this file

Treat this as living documentation. When a new convention emerges, a new league launches, or a major flow changes, update the relevant section. Don't let it grow into a wiki — entries should be terse pointers; the code is authoritative.
