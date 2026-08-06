# CLAUDE.md — CLS (CAS League Scoring)

This file briefs a fresh Claude conversation on the league-manager project so it can be productive from message one. Update it whenever conventions, architecture, or major flows change. Keep entries terse — let the code be the source of truth for details.

## What this is

A Next.js 15 App Router application that manages race leagues, seasons, registrations, results, incident reports, decisions, and penalty pools for the CAS sim racing community. Backed by self-hosted Postgres via Prisma. Deployed on a self-hosted Hetzner VPS via Coolify (migrated off Vercel/Neon on 2026-06-19; both are now decommissioned).

## Tech stack

- Next.js 15 App Router — Server Components by default, Server Actions for mutations
- Prisma ORM + Postgres (self-hosted, Coolify-managed, on the Hetzner box; reached over Coolify's internal Docker network)
- NextAuth.js with PrismaAdapter + Discord OAuth
- Tailwind CSS — dark zinc-based theme
- PayPal integration for registration fees (per-league config on `League`)
- **Self-hosted Hetzner VPS + Coolify is the LIVE stack** (migrated off Vercel/Neon on 2026-06-19; both decommissioned). App + Postgres run as Docker containers on one Hetzner CX23 box (IP `5.75.174.170`), fronted by Coolify's Traefik with automatic Let's Encrypt. Scheduling is **GitHub Actions crons only** (they hit the live endpoints); the old `vercel.json` daily cron is dead.

## Repo & deployment

- **Local path**: `/Volumes/AI-1/Projects/league-manager` (on the mounted `AI-1` volume; moved off Nextcloud 2026-06-28 — the old `~/Nextcloud/AI/league-manager` copy is retired)
- **GitHub**: https://github.com/halvar20000/simracing-hub-league-manager — branch `main`
- **Deploy flow (LIVE = Hetzner/Coolify)**: the live site `league.simracing-hub.com` is served by **Coolify on a Hetzner CX23** (IP `5.75.174.170`); DB = **Coolify-managed Postgres** on the same box. DNS is a Cloudflare **`league` A-record → 5.75.174.170, DNS-only (grey cloud, NOT proxied)** — leave the apex/`www` GitHub-Pages records alone. Deploys are **NOT automatic**: push to `main`, then **trigger a redeploy in Coolify** (Coolify pulls `main` via a read-only GitHub **deploy key**; there is no push webhook). The sandboxed Claude environment cannot push — write a shell script to `outputs/` for the user to run. Coolify dashboard: `http://5.75.174.170:8000` → project "My first project" → app `league-manager`.
- **Build specifics**: Coolify builds from `deploy/Dockerfile` (Next.js standalone — `output:"standalone"` in next.config). The runtime image ships the Prisma **client + query engine only, NOT the Prisma CLI**, so the container entrypoint just runs `node server.js` and does **not** apply schema. The app requires the env var **`HOSTNAME=0.0.0.0`** (set in Coolify) or Next binds to the container-id hostname and Traefik returns 502. All ~20 env vars (DATABASE_URL → internal Coolify PG, AUTH_*, DISCORD_*, CRON_SECRET, CAS_DISCORD_*, RESEND_*, IRLM_*, IRACING_*, BLOB_READ_WRITE_TOKEN, AUTH_URL, AUTH_TRUST_HOST, HOSTNAME) live in Coolify → app → Environment Variables.
- **Vercel + Neon are DEAD** (decommissioned 2026-06-19). Ignore all old Vercel/Neon instructions, the Vercel MCP, and `outputs/trigger_vercel_deploy.sh`. The final Neon backup is `cls-final-backup.dump` (on the server at `/root/` and copied to Nextcloud). `@vercel/blob` is still used for uploads (works off-Vercel via `BLOB_READ_WRITE_TOKEN`).
- **Standard footer for change scripts**: `npx tsc --noEmit -p tsconfig.json` → `git add <paths>` → `git commit -m "..."` → `git push` → **then redeploy in Coolify** (a push alone does NOT deploy).

## CRITICAL: schema changes (Coolify Postgres)

**Use `npx prisma db push`. Do NOT run `prisma migrate dev`.**

The migration files in `prisma/migrations/` do not match the live database's actual schema state. `migrate dev` detects drift and offers `migrate reset`, which wipes all data. `db push` syncs the schema without touching migration history and is safe for additive changes (new columns with defaults, new indexes, new optional relations).

After `db push`, run `npx prisma generate` to refresh the typed client.

**Where to run it now (post-migration):** the runtime container has no Prisma CLI and the entrypoint does NOT apply schema, so schema changes must be pushed **manually from a full environment** against the live Coolify Postgres — e.g. from your Mac with `DATABASE_URL` set to the Coolify Postgres URL, or via a one-off `postgres`/`node` container on the `coolify` Docker network. Do this BEFORE (or right after) deploying code that depends on the new schema. The Coolify Postgres is internal-only by default; expose a port temporarily or run from inside the `coolify` network.

**Heads-up (2026-06): the local `.env`/`.env.local` still point at the DEAD Neon DB** (read-only), so `prisma db push` from the Mac fails with `cannot execute ... in a read-only transaction` and would target the wrong DB anyway. Until those are repointed, apply additive DDL directly on the server's CLS Postgres container and deploy the code with `SKIP_DB_PUSH=1`. SSH (key, not password): `ssh -i ~/.ssh/hetzner_cls root@5.75.174.170`. Find the container whose DB has a `Round` table (not Coolify's own DB), then `docker exec -i <c> sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'` and run `ALTER TABLE "X" ADD COLUMN IF NOT EXISTS ...`.

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

## Wrong-car DSQ (IEC + GT3 WCT)

On JSON import, leagues in `CAR_ENFORCED_LEAGUE_SLUGS` (`cas-iec`, `cas-gt3-wct`, in `src/lib/actions/iracing-json-import.ts`) require the driver to race the car they registered. Per result: compare by **iRacing `car_id`** — the registered car's `Car.iracingCarId` vs the driven `car_id`; only when the registered car has a known iRacing id AND it differs from the driven one → `finishStatus = DSQ` + a `RaceResult.notes` reason (`Auto-DQ: drove "X" but registered "Y"`). **Do NOT compare internal `Car`-row ids** (the pre-v1.18.1 bug): `resolveCarId` mints a fresh `Car` row when iRacing renames a car (e.g. "BMW M4 GT3 EVO", "Mercedes-AMG GT3 2020"), so the same physical car would get a new row id and trigger a false DSQ for the whole field. If a registered car has no `iracingCarId` (legacy/unlinked row), enforcement is skipped (can't prove a mismatch) — backfill `iracingCarId` via Manage Cars to re-enable it. `recomputeRoundScoring` then forfeits the whole round for that driver (existing DSQ-forfeit rule). For these leagues the importer **does not** sync `Registration.carId` to the driven car (registration is the source of truth); all other leagues keep that auto-sync. Admin overrides by editing the result and clearing DSQ. Import summary lists every auto-DQ.

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

- **Penalty-application mode: deferred pool (all GT3 WCT seasons).** Penalties pool all season; admin releases the remaining pool at season end (`releasedAt`), which is then deducted from totals. Only released penalties (`releasedAt != null`) hit the standings; driven by `ScoringSystem.deferPenaltyPoints = true`.
  - **Per-race mode was REVERTED (June 2026).** `src/lib/penalty-application.ts:isPerRacePenaltySeason(slug, seasonId)` now **always returns false**, so every season uses the deferred pool. The per-race branches at the call sites (`computeDriverStandings`/`computeTeamStandings` in `standings.ts`; the standings, round, and both penalty-pool pages) remain compiled but inert — flipping that single function back on would re-enable per-race; deleting the dead branches is a future cleanup. `DriverStanding.forgivenessCredit` stays 0 in deferred mode. Release buttons + Released column are visible again on both penalty-pool pages.
- **Engine**: `src/lib/penalty-pool.ts:recomputePenaltyPoolForSeason(seasonId)` — pure, idempotent, hard-gated by `season.league.slug === "cas-gt3-wct"`.
- **Schema field**: `Penalty.autoForgivenPoints Int @default(0)` — owned 100% by the engine; reset before every recompute. Manual admin forgiveness lives in `Penalty.forgivenPoints`. Effective pool point per penalty = `pointsValue - forgivenPoints - autoForgivenPoints`.
- **Rule**: per registration, walk rounds with `status = COMPLETED` that the driver raced cleanly (a `RaceResult` with `finishStatus` in `CLASSIFIED | DNF` — **DSQ does NOT count** toward forgiveness; DNS/no-result are also excluded). The penalty-pool table still shows a white `DSQ` marker and a red `✕` for RSVP-declined rounds, but DSQ does not advance the clean-race counter. If a new `Penalty` (type=POINTS_DEDUCTION, pointsValue>0) was issued in that round → clean counter resets to 0. Otherwise if pool > 0, counter++; at counter = 2, forgive 1 from the oldest non-fully-forgiven penalty (FIFO) and reset counter. Stops when pool reaches 0. "Oldest" = lowest `Round.roundNumber`, then earliest `createdAt` (not `createdAt` alone — a no-show penalty is written when the round completes, an incident penalty for the same round only once the stewards decide).
- **No-show forgiveness — per-season switch `Season.noShowForgivenessEnabled`** (added v1.85.0, ON for GT3 WCT 13th Season, OFF everywhere else):
  - **OFF (legacy, S12 and earlier)**: `NO_RSVP_NO_SHOW` penalties are filtered out of the engine entirely — never forgiven, never counted in the remaining pool, never resetting the clean-race counter. A permanent demerit.
  - **ON (S13+, Andreas's rule)**: they are ordinary pool penalties — incurring one resets the clean-race counter, and two clean races forgive 1 point from the driver's oldest open penalty regardless of source (one shared FIFO queue, no separate no-show bucket).
  - Toggle lives on the admin season edit page ("No-show points can be forgiven") and on the new-season form. Flipping it requires a pool recompute to take effect on already-completed rounds.
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
  - `vercel.json` cron — DEAD (Vercel decommissioned 2026-06-19). The GitHub Actions workflows below are now the only schedulers; they call the live `league.simracing-hub.com` endpoints with the `CRON_SECRET` (kept in sync between Coolify and the GitHub Actions repo secret).
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
- Pool integration: `src/lib/penalty-pool.ts` walks rounds where the driver entered OR carries a penalty, so on a season with `noShowForgivenessEnabled = true` a `NO_RSVP_NO_SHOW` penalty resets the clean-race counter even though the driver didn't enter that round. On a season with the flag off these penalties are filtered out of the engine before the walk, so they neither reset the counter nor get forgiven.

## Discord community stats

- Admin page `/admin/discord-stats` — 30-day activity snapshot of the CAS Discord server: per member, chat activity (messages), league activity (raced/RSVP'd), join recency, CLS-link status.
- Builder: `src/lib/discord-stats.ts:buildDiscordStats()` — bot REST API: lists guild members, scans every readable text channel's last-30-day message history (time-budgeted, ~45s), joins CLS data. `saveDiscordStatsSnapshot()` persists the result to the `DiscordStatsSnapshot` table (one JSON row per refresh). Slow — never call from a page render.
- Refresh: daily cron `/api/cron/discord-stats` + `.github/workflows/cron-discord-stats.yml` (04:30 UTC); manual "Refresh" button on the page → `refreshDiscordStatsAction`. The page reads the latest snapshot only.
- Trend chart: `DiscordMonthlyActivity` (one row per `YYYY-MM`) holds per-month message + active-member counts. `buildMonthlyActivity(monthsBack)` scans far-back history; the one-time backfill `scripts/lm_backfill_discord_activity.ts` populates ~24 months. Past months are immutable, so `saveDiscordStatsSnapshot` rewrites only the current month on each refresh. The page renders the last 24 months as an SVG chart (message bars + active-members line).

## Discord results post + new-member welcome

- After-race results: `src/lib/notify-results.ts:postRoundResults(roundId)` posts a podium embed (+ links to the full classification and standings) to `League.discordResultsChannelId`. Triggered from `updateRound` (via `after()`) when a round flips to `COMPLETED`; idempotent through `Round.resultsPostedAt`; a no-op when the channel is unset or results aren't imported yet, so it retries on the next round save.
- New-member welcome: the REST bot has no gateway, so a daily cron (`/api/cron/discord-welcome` + `.github/workflows/cron-discord-welcome.yml`, 16:00 UTC) runs `src/lib/notify-welcome.ts:runWelcome()` — it lists guild members, batches everyone who joined since the `League.discordWelcomeAfter` watermark, and posts ONE message to `League.discordWelcomeChannelId` naming them (no @mention; `allowed_mentions.parse=[]`). The first run just sets the watermark so existing members aren't bulk-welcomed. `League.discordWelcomeMessage` is an optional template (`{names}` placeholder).
- Both features are off until their channel IDs are set on the admin league-edit page.

## Discord race events (Guild Scheduled Events)

- Each upcoming round gets a Discord **Guild Scheduled Event** (EXTERNAL type, location = track) so Discord shows it in the server's Events tab and fires its native "starting soon" reminder (~15 min before). It is NOT tied to a channel — purely a reminder.
- Helper: `src/lib/notify-race-event.ts` — `ensureRaceEventForRound(roundId, {force?, existing?})` (create/update one round) and `createRaceEventsForUpcomingRounds()` (cron sweep, `RACE_EVENT_DAYS_AHEAD=30`). Pure, not `"use server"`; imported by the cron route and the admin action.
- **Idempotency without a schema change**: events are matched against the guild's existing scheduled events by the deterministic name `"<League> · R<n> <track>"` (`listGuildScheduledEvents`). Found + drifted (start/end/location) → PATCH; found + same → skip; missing → create. Reschedules self-heal. Event end = `Round.raceLengthMinutes` (default 120 min); description links to the round page.
- **Timezone**: `Round.startsAt` is a naive wall-clock (admin types e.g. "19:00", no tz; CLS displays it back unchanged via `getHours()` so it's internally self-consistent). For Discord we need a real instant, so `reinterpretLocalAsZone(startsAt, "Europe/Berlin")` converts that wall-clock to the correct UTC instant before `toISOString()`. DST-aware (Intl) and a no-op if the server ever runs in Europe/Berlin. Any other true-instant consumer (e.g. a future ICS export) must do the same. `entity_type` for EXTERNAL events is **3** (1=STAGE_INSTANCE, 2=VOICE).
- REST helpers in `src/lib/discord-bot.ts`: `listGuildScheduledEvents`, `createGuildScheduledEvent` (EXTERNAL, privacy_level 2), `modifyGuildScheduledEvent`. The league logo (`League.logoUrl` → `resolveLogoUrl` → fetched + base64 by `fetchLogoDataUri`) is sent as the event cover `image`; failures degrade gracefully to no image.
- Triggers: cron `/api/cron/discord-race-events` (Bearer `CRON_SECRET`) + `.github/workflows/cron-discord-race-events.yml` (every 6h); manual `createRaceEventAction` ("📅 Discord event" button on the admin round page, `force=true`).
- Gating: any league with `League.discordGuildId` set; round `UPCOMING`, season `OPEN_REGISTRATION`/`ACTIVE`, start within the horizon. **The bot must have the `MANAGE_EVENTS` permission** in the guild (ask Andreas — see [[project_cas_discord_admin]]).

## YouTube race-stream auto-match (all leagues)

- Links each completed round to its stream VOD and embeds a `youtube-nocookie` player on the public round page.
- **Config**: `League.youtubeChannelId` (an `@handle` e.g. `@cas-tech-performance7363`, or a `UC…` channel ID) on the admin league-edit page. Null = off for that league. Requires env var **`YOUTUBE_API_KEY`** (Google Cloud YouTube Data API v3 key).
- **Schema**: `Round.youtubeVideoId` (11-char ID) + `Round.youtubeMatchedAt`. The cron only fills rounds where `youtubeVideoId` is null, so a manually pasted link is never clobbered.
- **API client**: `src/lib/youtube.ts` — `resolveUploadsPlaylistId` (channels.list, handles `@handle`/`UC…`), `listRecentUploads` (playlistItems.list), `extractYoutubeVideoId` (URL/ID parser for manual paste).
- **Matcher**: `src/lib/match-youtube.ts` (pure, not `"use server"`) — `pickBestUpload` scores uploads by publish-time distance to the race start (window −12h/+18h) minus a title bonus for round-number/track mentions; `matchYoutubeForRound(roundId,{force,uploadsCache})` stores the pick; `matchYoutubeForRecentRounds()` is the cron sweep (COMPLETED rounds in the last `MATCH_LOOKBACK_DAYS`=45, channel set, video null). Race start is `reinterpretLocalAsZone(startsAt,"Europe/Berlin")` (naive-walltime convention — see [[project_cls_naive_walltime]]).
- **Cron**: `/api/cron/youtube-match` (Bearer `CRON_SECRET`) + `.github/workflows/cron-youtube-match.yml` (every 3h).
- **Admin actions**: `src/lib/actions/race-videos.ts` — `matchYoutubeAction` ("📺 Match YouTube" button, force) and `setRoundYoutubeAction` (paste URL/ID or clear). Round page shows a thumbnail + status panel; redirect status flag is `yt=`.
- **Public**: embedded player section at the top of the round results page when `youtubeVideoId` is set. Plus a site-wide **`/streams`** page (`src/app/streams/page.tsx`, linked in `nav.tsx`) listing every COMPLETED round with a `youtubeVideoId` **or `twitchVideoId`** across non-archived leagues, newest first, as thumbnail cards, with `?league=<slug>` filter chips.
- **Shared matcher helpers**: `src/lib/match-stream.ts` — `reinterpretLocalAsZone`, `norm`, `TRACK_STOPWORDS`, `trackMatches`, `LEAGUE_TIME_ZONE`. Imported by BOTH the YouTube and Twitch matchers; don't re-declare them.
- **Guard**: `updateLeague` rejects a URL in the YouTube-channel field (trimming a `youtube.com/@handle` URL down to the handle, redirecting with an error otherwise). Before v1.87.0 a pasted URL — including a Twitch one — was stored silently and then failed forever inside the cron with no visible error. Keep that guard.

## Twitch VOD auto-match (SFL Cup — v1.87.0)

Twitch sibling of the YouTube matcher above, for leagues streamed on Twitch rather than YouTube.

- **Config**: `League.twitchChannelLogin` (bare login, e.g. `maxstion`; the form accepts `@login` / a full `twitch.tv/…` URL and normalizes). Null = off. Requires env vars **`TWITCH_CLIENT_ID`** + **`TWITCH_CLIENT_SECRET`** (app at https://dev.twitch.tv/console/apps — client-credentials flow, no scopes, no user login). Currently set for **`cas-sfl-cup` only**.
- **Schema**: `Round.twitchVideoId` (numeric), `twitchVideoType` (`archive`/`highlight`/`upload`), `twitchThumbnailUrl`, `twitchMatchedAt`. Cron only fills rounds where `twitchVideoId` is null.
- **API client**: `src/lib/twitch.ts` — cached app access token, `resolveUserId`, `listChannelVideos` (`type=all`), `normalizeChannelLogin`, `extractTwitchVideoId`, `twitchThumbUrl`, `isExpiringVodType`.
- **Matcher**: `src/lib/match-twitch.ts` — **DATE-first, deliberately unlike the YouTube one.** A Twitch `archive` VOD's `published_at` IS the live-broadcast start, so it lands 8-50 min after the scheduled race; titles are actively wrong (the SFL stream titled "Rennen drei" is round **4** — round 3 was postponed). Window: −3h/+6h, tie-broken by track-name match then time. **Do not add title round-number scoring here.**
- **VOD retention**: Twitch DELETES `archive` videos after 7-60 days; only `highlight`/`upload` are permanent. The round page and admin panel show an expiry warning for `archive`, and `/streams` degrades a dead thumbnail to a purple gradient (`alt=""`). Promoting a stream to a Highlight on Twitch clears the warning on the next match run.
- **Cron**: `/api/cron/twitch-match` + `.github/workflows/cron-twitch-match.yml` (every 3h at :50).
- **Admin actions**: `matchTwitchAction` ("🟣 Match Twitch", force) + `setRoundTwitchAction` in `race-videos.ts`; redirect status flag is `tw=`.
- **Player embed**: `player.twitch.tv/?video=<id>&parent=<host>` — the `parent` param is mandatory and is derived from `NEXT_PUBLIC_SITE_URL` (`TWITCH_PARENT` in the public round page).

## Driver of the Day (all leagues)

Per-round recognition badge — **no championship points, never touches standings**. Admin uploads the iRacing `eventresult.json` (authoritative start/finish/incidents + `cust_id` identity) + the race-logger `…_race.jsonl` (overtakes counter + worst position for the recovery metric); CLS computes the winner and shows a hero card on the public round page.

- **Engine**: `src/lib/driver-of-the-day.ts` — pure (not `"use server"`), a faithful TS port of `driver_of_the_day.py` from the iRacing-overlays project (`~/Nextcloud/iRacing/python/files/`). Blends four min-max-normalised metrics, weighted: positions gained 0.40, overtakes 0.25, recovery (worst→finish) 0.20, clean racing 0.15. Normalises across the **eligible** pool only (DNF / under-50%-distance ineligible; ineligible drivers still ranked, clamped). The winner is deliberately **not** the race winner: a clean pole-to-flag win scores ~0 on gained/recovery/overtakes. `computeDriverOfTheDay(candidates, opts)` is called once for the overall award and once per car class on multiclass seasons.
- **Two-race (heat) rounds** (SFL, PCCD, Combined Cup): the eventresult contains **two RACE sessions** (e.g. HEAT 1 + FEATURE, same `session_unique_id`, different `simsession_number`); the race logger writes **one JSONL per race**. The admin uploads the eventresult + **both** logs; `combineRaceCandidates` (in `driver-of-the-day.ts`) sums each driver's positions gained / recovery / overtakes / incidents across the two races and computes **one combined DotD**. Eligibility = **classified in every race** (finished + ≥50% of that race's leader distance); a driver who DNF'd or skipped a race is still ranked but not crowned. The number of RACE sessions in the eventresult drives how many logs are required (no league-slug hardcoding); single-race leagues (IEC, GT3 WCT, Nascar, TSS GT4) take one log unchanged. Logs are matched to races by `session_num` ↔ `simSessionNumber` (fallback: upload order). Combined rows carry null start/finish/worst (they span both races), so `winnerMetrics`/the hero show aggregate numbers only. Extra race logs are archived in `RoundDriverOfTheDay.extraLogBlobUrls String[]`.
- **Log parser**: `src/lib/dotd-log.ts` (pure) — parses the JSONL into per-driver overtakes + worst position, keyed by car number (then name); also captures `session_num`/`session_unique_id` for race matching. The eventresult is parsed via the existing `parseIracingEventJson` (`src/lib/iracing-json.ts`).
- **Identity bridge**: eventresult `cust_id` → `User.iracingMemberId` → CLS user (for linking + the no-back-to-back query). Log↔eventresult join is by `livery.car_number`, falling back to normalised name.
- **No back-to-back**: a driver can't win two consecutive rounds in the same season. The action excludes the previous round's winner (most recent prior round with a DotD); on multiclass it excludes the previous round's winner **per class** (from `classWinners`). The excluded driver is still ranked, marked `blockedRepeat`, and the crown passes to the next eligible driver.
- **Schema**: `RoundDriverOfTheDay` (1:1 with `Round`) — winner (`winnerUserId` + name/number fallback), `score`, `breakdown`/`winnerMetrics`/`ranking`/`classWinners`/`weights` (JSON), `previousWinner*`, archived raw uploads (`eventResultBlobUrl`/`logBlobUrl` on Vercel Blob). **Applied to the live DB via `outputs/dotd_table.sql`** on the Hetzner Postgres (the runtime container has no Prisma CLI — see schema-change note); the model is in `schema.prisma` so the Coolify build's `prisma generate` types the client.
- **Admin**: `src/lib/actions/driver-of-the-day.ts` (`computeAndSaveDotd`, `deleteDotd`) + an "🏆 Driver of the Day" panel on the round Race Center admin page (upload, full ranking table, per-class winners, recompute, danger-zone delete).
- **Public**: `src/components/DriverOfTheDayHero.tsx` — hero card near the top of the round page, gated by `round.driverOfTheDay && showResults` (so it follows the same publish gate as results; admins preview early).

## Race Logger (standalone, driver-side)

The race-logger `.jsonl` that Driver of the Day and the stint-planner analysis need no longer has to be collected by hand: drivers run the logger themselves and it uploads the finished log.

- **Client**: `iracing_race_logger.py` in the iRacing-overlays project (`~/Nextcloud/iRacing/python/files/`, GitHub `halvar20000/iracing-overlays`) — shipped **without the OBS overlays** as a single `RaceLogger.exe` (PyInstaller, `RaceLogger.spec` + `.github/workflows/build-race-logger.yml` on a windows runner) plus a source zip. CLS links the fixed `releases/latest/download/…` URLs (`RACE_LOGGER_EXE_URL` / `RACE_LOGGER_ZIP_URL` in `src/lib/race-logger.ts`). Driver docs: `RACE_LOGGER.md` in that repo.
- **Setup page on the driver's PC**: `http://localhost:5009/league` — league URL, personal key, auto-upload switch, per-log upload state + "Send again". Settings in `league_manager.json` next to the exe, state in `logs/upload_state.json`. Auto-upload fires from `_close_log()`, so it triggers on the checkered flag *and* on Ctrl-C.
- **Token**: `User.raceLoggerToken` (prefix `cls_rl_`, one per driver, regenerated/revoked on `/race-logger`). Not a login — it can only POST race logs.
- **API**: `GET /api/race-log` = key check ("Test connection"); `POST /api/race-log` = multipart `file` (or raw body + `X-Log-Filename`), `Authorization: Bearer <token>`, 60 MB cap. Validated with the same `parseDotdLog` the award uses, archived to Blob under `race-logs/<userId>/`, indexed as `RaceLogUpload`. Idempotent per `(uploadedById, sha256)` — retries and several drivers uploading the same race never duplicate.
- **Round matching** (`matchRoundForLog`): a round of a season the uploader is registered in, within ±36 h of the log, track names compared loosely; ambiguous → left unassigned for an admin. The Race Center DotD panel ticks the attached logs by default and lists nearby unassigned ones with an "Attach to this round" button; `computeAndSaveDotd` accepts `logUploadIds` alongside the manual file inputs (manual upload is unchanged and still works alone).
- **Schema**: `RaceLogUpload` + the two `User` columns — apply `outputs/race_log_upload_table.sql` on the Hetzner Postgres before deploying (see the schema-change note above).

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
