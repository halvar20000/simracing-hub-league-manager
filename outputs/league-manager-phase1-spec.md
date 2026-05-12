# Simracing-Hub's League Manager — Phase 1 Spec

**Product name:** Simracing-Hub's League Manager
**Domain:** league.simracing-hub.com
**First customer:** CAS iRacing Community
**Owner:** Thomas Herbrig
**Date:** 24 April 2026
**Status:** Draft v3 — scope locked, all scoring rules resolved, ready to build

---

## 1. Executive Summary

We are building a web-based league management tool for iRacing communities, starting with the CAS community as the first user and hosted at `league.simracing-hub.com`. The tool replaces manual spreadsheets and the limitations of iRLeagueManager with a modern, flexible platform covering the full lifecycle of a league season: member registration, season and race setup, results entry, a reporting system for race incidents, standings calculation (including Pro/Am splits, team ratings, and Fair Play Rating), and public results pages.

Phase 1 delivers a working tool for the six CAS leagues (GT3 WCT, IEC, Combined Cup, SFL Cup, PCCD, TSS GT4) with manual and CSV-based results entry, plus a light reporting workflow complementing iRaceControl. Phase 2 adds automatic iRacing Data API integration for results import. Phase 3 opens the platform to other communities (multi-tenancy) and adds a Progressive Web App for mobile use.

---

## 2. Goals & Non-Goals

### Phase 1 goals (in scope)

- A CAS admin can create a league, define a season with a race calendar, and manage a roster of drivers.
- A driver can register for a season via Discord sign-in, supplying their iRacing ID, preferred start number, email, car/class choice (for multiclass seasons), and team affiliation.
- After each race, the CAS admin can enter results — either manually or by uploading the CSV that iRacing's league session export produces.
- The tool calculates and displays a standings table per season, handling Pro/Am splits, team ratings, Fair Play Rating, and per-league scoring tables (SFL Cup, GT4 Masters, GT3 WCT, IEC already defined — see §10).
- Drivers can file incident reports for race events, admins review and issue decisions, decisions are published publicly (summary) and penalty points feed into standings.
- Everything is public-readable (no login required to view standings, results, or decisions). Registration, reporting, and admin actions require sign-in.
- The site is mobile-responsive out of the box (Phase 3 adds PWA features on top).

### Non-goals (deferred)

- **Automatic iRacing results import** — Phase 2, pending iRacing OAuth client approval.
- **Multi-tenancy** — Phase 3. Phase 1 is structurally single-tenant but built with multi-tenancy in mind so we can retrofit without a rewrite.
- **PWA with push notifications** — Phase 3.
- **Native iOS/Android apps** — not planned; PWA covers the need.
- **Live timing / live race telemetry** — out of scope.
- **Live stewarding workflow** — iRaceControl handles this for IEC and others. Our tool holds the final decisions only.
- **Discord bot integration** — nice-to-have, Phase 2 or 3.
- **Complex scoring rule editor UI** — Phase 1 seeds the four CAS scoring tables in code. A full visual editor comes later.
- **Team manager role** — Phase 1 has only Admin and Driver roles.

---

## 3. Users & Roles

Phase 1 has three roles. A user's role is set by existing admins and stored in the database.

**Admin** — The person running the league (you and any delegated CAS admins). Can create leagues, define seasons and races, approve driver registrations, enter results, upload CSVs, review incident reports and issue decisions, add manual penalty points, and edit anything. Can promote other users to admin.

**Driver (Member)** — A signed-in user who has registered or wants to register for a season. Can fill in their profile (name, iRacing ID, email), submit a registration request for a season, view their own registrations and results, file incident reports, and view their own reports' status.

**Public (no login)** — Anyone on the internet. Can browse leagues, seasons, race results, standings, and published steward decisions. Cannot register, file reports, or edit anything.

---

## 4. Core User Flows

### 4.1 Admin sets up a new season

The admin logs in with Discord, creates or opens a league (e.g., "CAS GT3 World Championship"), and starts a new season. They set the season name ("2026 Spring"), select the scoring system from the seeded list (SFL Cup, GT4 Masters, GT3 WCT, IEC, or a new custom one), toggle whether the season is multiclass and whether Pro/Am splits are used, configure team scoring (sum or best-N), and define the race calendar — a list of rounds, each with a name, track, date, and whether it counts for championship points. The admin publishes the season to open registration.

### 4.2 Driver registers for a season

A driver visits the public season page, clicks "Register", and signs in with Discord if they haven't already. On first sign-in they complete their profile: first name, last name, email, iRacing member ID. They then fill in the registration form for this specific season: preferred start number, car/class (if multiclass), team affiliation (select existing team or request a new one). Pro/Am is set by the admin, not self-declared. They submit, and the registration enters a "pending" state until an admin approves.

### 4.3 Admin approves the roster

The admin sees a list of pending registrations for the season, can approve or reject each, and can edit fields (e.g., correct a start number conflict, assign Pro or Am class after a test race or based on previous league results). Approved drivers appear on the public roster page.

### 4.4 Admin enters race results

After a race night, the admin picks the race from the calendar and either (a) enters results manually via a table — position, laps, time, incidents, fastest lap, penalty time, DNF/DSQ flags — or (b) uploads the CSV file exported from iRacing's league session results page. The CSV parser matches iRacing IDs to registered drivers and prefills the results table. The admin reviews, adjusts if needed, and saves. Points are calculated automatically using the season's scoring system; the admin can also enter manual penalty points at this stage. The standings table updates immediately.

### 4.5 Driver files an incident report

A signed-in driver who is registered in the season can navigate to the race page and click "Report an incident". They fill in: lap number (optional), turn/sector (optional), involved drivers (selected from the season roster), a text description of what happened, and evidence links (YouTube timestamp, iRacing replay reference, image URL, etc.). The report is saved in `SUBMITTED` state and appears in the admin's review queue.

### 4.6 Admin reviews and issues decision

The admin opens the reports queue, filters by season or status, reads the full report (text, evidence, involved parties). They can mark the report `UNDER_REVIEW`, add internal notes (visible only to admins and involved parties), and then issue a decision: No action, Warning, Reprimand, Time penalty (seconds), Points deduction, Grid penalty for next round, or Suspension. The decision includes a public verdict summary the admin writes. When published, the decision auto-applies any penalty points or time-penalty adjustments to the relevant race result and recalculates standings.

### 4.7 Anyone views standings, results, and decisions

Any visitor can navigate to a season page and see the standings table (overall, and split by Pro/Am if enabled), the team standings with Fair Play Rating, and a list of rounds. Each round page shows full results, finish order, times, laps, incidents, fastest lap, points awarded, and any published steward decisions for that round.

---

## 5. Screens & Navigation

**Public (no login required):**
1. Home / league browser — landing page listing the six CAS leagues and active seasons.
2. League page — overview of one league, list of its seasons.
3. Season page — scoring system, calendar of races, roster of drivers, link to standings.
4. Standings page — championship table (overall and by Pro/Am split), team standings with FPR.
5. Race results page — full results for one race, points awarded, and published decisions for that race.
6. Decisions page per season — list of all published steward decisions for a season, cross-linked from race pages.

**Authenticated (Discord sign-in required):**
7. Sign in / Discord OAuth callback.
8. My profile — edit first/last name, email, iRacing ID.
9. My registrations — list of seasons I've registered for and their status.
10. Registration form — per-season registration with start number, car, team.
11. File incident report — from a race page, registered drivers only.
12. My reports — list of reports I've filed, with status and verdict once decided.

**Admin only:**
13. Admin dashboard — overview of leagues, seasons, pending registrations, pending reports.
14. League editor — create/edit a league (name, description, logo).
15. Season editor — create/edit a season, define race calendar, configure scoring system.
16. Roster management — approve/edit/remove driver registrations for a season, set Pro/Am class.
17. Team management — create/edit teams for a season.
18. Results editor — enter results manually or upload CSV for a given race, enter manual penalty points.
19. Reports review queue — list all reports, filter/search, drill into individual reports.
20. Report decision editor — issue verdict, write public summary, add internal notes.
21. User management — promote users to admin, view all users.

That's ~21 screens, but several are simple forms. Most surface area lives in the season page, standings, results editor, roster management, and reports review.

---

## 6. Database Schema (initial)

Designed in Postgres via Prisma ORM. Keys and timestamps are simplified; Prisma will add `id`, `createdAt`, `updatedAt` to every table by convention.

### Core entities

**User** — identity, one row per human.
Fields: discord_id (unique), email, display_name, first_name, last_name, iracing_member_id (unique, nullable until filled), avatar_url, role (enum: ADMIN, DRIVER), is_active.

**League** — a named racing series that hosts multiple seasons over time.
Fields: name, slug (unique), description, logo_url, created_by (→ User).

**Season** — one season of a league.
Fields: league_id (→ League), name, year, status (enum: DRAFT, OPEN_REGISTRATION, ACTIVE, COMPLETED), starts_on, ends_on, is_multiclass, pro_am_enabled, scoring_system_id (→ ScoringSystem), team_scoring_mode (enum: NONE, SUM_ALL, SUM_BEST_N), team_scoring_best_n (nullable).

**CarClass** — e.g., "GT3", "LMP2". Scoped per season.
Fields: season_id (→ Season), name, short_code, display_order.

**Car** — optional, specific cars within a class (e.g., "BMW M4 GT3").
Fields: season_id (→ Season), car_class_id (→ CarClass), name, iracing_car_id (nullable, for future API matching).

**Team** — racing team within a season.
Fields: season_id (→ Season), name, short_name, logo_url.

**Round** — a scheduled race within a season.
Fields: season_id (→ Season), round_number, name, track, track_config (nullable), starts_at, counts_for_championship (bool), race_length_minutes (or laps), status (enum: UPCOMING, IN_PROGRESS, COMPLETED).

**Registration** — a driver's entry into a specific season.
Fields: season_id (→ Season), user_id (→ User), status (enum: PENDING, APPROVED, REJECTED, WITHDRAWN), start_number, team_id (→ Team, nullable), car_class_id (→ CarClass, nullable), car_id (→ Car, nullable), pro_am_class (enum: PRO, AM, nullable), notes, approved_by (→ User, nullable), approved_at.

**RaceResult** — one row per driver per round.
Fields: round_id (→ Round), registration_id (→ Registration), finish_position, class_position (nullable), laps_completed, race_distance_pct (computed for participation points), total_time_ms, best_lap_time_ms, incidents, finish_status (enum: CLASSIFIED, DNF, DNS, DSQ), raw_points_awarded, participation_points_awarded, manual_penalty_points, manual_penalty_reason (text), notes.

**ScoringSystem** — defines how championship points are calculated.
Fields: name, description, points_table (jsonb — e.g., `{"1": 25, "2": 22, ...}`), participation_points (int, default 0), participation_min_distance_pct (int, default 75), bonus_fastest_lap (nullable), bonus_pole (nullable), drop_worst_n_rounds (nullable, int), fpr_enabled (bool), fpr_tiers (jsonb — e.g., `[{"max_incidents": 15, "points": 3}, {"max_incidents": 20, "points": 2}, {"max_incidents": 25, "points": 1}]`), fpr_mode (enum: LOWEST_TEAM_ONLY, ALL_TEAMS_TIERED).

**FPRAward** — Fair Play Rating awarded to a team per round per class.
Fields: round_id (→ Round), team_id (→ Team), car_class_id (→ CarClass, nullable for single-class seasons), team_incident_total, fpr_points_awarded.

**CsvImport** — audit trail of CSV uploads.
Fields: round_id (→ Round), uploaded_by (→ User), original_filename, rows_imported, rows_skipped, error_log (jsonb).

### Reporting system entities

**IncidentReport** — a report filed by a driver about a race event.
Fields: round_id (→ Round), reporter_user_id (→ User), reporter_registration_id (→ Registration), lap_number (nullable), turn_or_sector (nullable, text), description (text), status (enum: SUBMITTED, UNDER_REVIEW, DECIDED, DISMISSED), submitted_at.

**IncidentReportInvolvedDriver** — links involved drivers to a report.
Fields: incident_report_id (→ IncidentReport), registration_id (→ Registration), role (enum: REPORTER, ACCUSED, WITNESS).

**IncidentReportEvidence** — attached evidence.
Fields: incident_report_id (→ IncidentReport), kind (enum: YOUTUBE_LINK, URL, IRACING_REPLAY_REF, IMAGE_URL, TEXT), content (text), added_by_user_id (→ User).

**IncidentReportComment** — internal admin notes, visible only to admins and involved drivers.
Fields: incident_report_id (→ IncidentReport), author_user_id (→ User), body (text), is_internal (bool, default true).

**IncidentDecision** — the verdict on a report.
Fields: incident_report_id (→ IncidentReport, unique), decided_by_user_id (→ User), decided_at, verdict (enum: NO_ACTION, WARNING, REPRIMAND, TIME_PENALTY, POINTS_DEDUCTION, GRID_PENALTY_NEXT_ROUND, SUSPENSION), public_summary (text, shown on public decisions page), internal_notes (text, admin-only), published_at (when made public).

**Penalty** — a concrete penalty applied to a driver in a specific race. Generated from an IncidentDecision or entered manually by admin. Feeds into standings.
Fields: registration_id (→ Registration), round_id (→ Round), source (enum: INCIDENT_DECISION, ADMIN_MANUAL, IRACECONTROL_IMPORT), source_incident_decision_id (→ IncidentDecision, nullable), type (enum: TIME_PENALTY, POINTS_DEDUCTION, GRID_PENALTY, WARNING), time_penalty_seconds (nullable), points_value (nullable, typically negative), grid_positions (nullable, for grid penalty next round), reason (text, shown publicly), applied_at.

### Notes on schema decisions

- **Multi-tenancy readiness.** No `tenant_id` yet, but every top-level entity has `created_by`. Adding tenant isolation in Phase 3 is a schema migration, not a rewrite.
- **Results schema ready for Phase 2 API import.** Columns like `race_distance_pct`, `incidents`, and `best_lap_time_ms` map directly to iRacing Data API response fields.
- **Scoring stored as JSON.** Covers the four CAS systems today and anything similar in the future. Ballast, success penalties, or other exotic rules can extend this or move to a dedicated rules table later.
- **Penalty is separate from IncidentDecision.** One decision can generate zero, one, or multiple penalties (e.g., a time penalty for this race + a grid penalty for the next one). Admin can also enter penalties directly without a decision (e.g., importing from iRaceControl).

---

## 7. Technical Stack

**Frontend:** Next.js 15 (React, App Router) with TypeScript and Tailwind CSS. Responsive-first design.

**Backend:** Next.js server actions + API routes. No separate backend service in Phase 1.

**Database:** Postgres, hosted on Neon (free tier sufficient for CAS-scale usage). Accessed via Prisma ORM.

**Authentication:** Auth.js (formerly NextAuth.js) with the Discord provider.

**Hosting:** Vercel for the Next.js app, Neon for Postgres. `league.simracing-hub.com` as the primary domain.

**CI / deployment:** GitHub repo with automatic Vercel deployment on push to `main`. Preview deployments for feature branches.

**Local development:** Mac environment, VS Code or Cursor, Docker for local Postgres, Claude Code or Claude in IDE for AI-assisted coding.

**Libraries we'll rely on:**
- `papaparse` for CSV parsing
- `zod` for input validation
- `date-fns` for date handling
- `lucide-react` for icons
- `recharts` for standings charts
- `shadcn/ui` for polished UI components

---

## 8. Phase 1 Milestones (7 weeks)

Assumes roughly 10–15 hours per week of AI-assisted work on your side.

### Week 1 — Foundation
Next.js project, GitHub repo, Vercel deployment linked to `league.simracing-hub.com`, Neon Postgres, Prisma, base layout/nav, Discord OAuth sign-in. End of week: you can sign in to a deployed skeleton app at the real domain.

### Week 2 — Data model + admin basics
Full Prisma schema, database seed script with the six CAS leagues and the four scoring systems, admin dashboard skeleton, league CRUD, season CRUD with race calendar. End of week: you can create all six CAS leagues with 2026 seasons.

### Week 3 — Registration flow
Public league/season pages, Discord-authenticated registration form, profile page, my-registrations page, admin roster approval screen, team management. End of week: test drivers can register for a CAS season and you can approve them and set Pro/Am.

### Week 4 — Results + standings (core)
Manual results entry form, CSV upload + parser for iRacing session exports, race results display page, standings engine (per-position points, participation bonus, manual penalties), standings display page with Pro/Am split and basic team rating. End of week: you can enter results of a real CAS race and standings update correctly.

### Week 5 — Reporting + penalties + FPR
Incident report submission UI, admin reports queue, decision editor, published-decision pages, Penalty entity applying to race results, Fair Play Rating calculation and team standings column, CSV upload refinements. End of week: a driver can file a report, an admin can decide it, and the verdict+penalty appear in public views and standings.

### Week 6 — Polish, edge cases, testing
Mobile responsive refinement, edge cases (DNF, DSQ, tied positions, partial races, drop-worst rounds), data validation, error handling, empty states, loading states. CAS admin team walkthrough and feedback.

### Week 7 — Beta launch buffer
Bug fixes from feedback, admin documentation (short written guide), production database seeded with real CAS 2026 data, cutover. Ship v1 to `league.simracing-hub.com`.

Buffer of 1–2 weeks beyond this is realistic; complex projects always stretch.

---

## 9. Phase 2 & 3 — Preview

**Phase 2 (6–8 weeks after Phase 1 ships):**
- Automatic results import via iRacing Data API (OAuth2 Password Limited Flow).
- Result discrepancy view — compare imported results with what's in the DB, admin confirms.
- Season-level stats (average finishing position, consistency rating).
- Driver profile pages with historical results across seasons.
- Optional Discord bot to post race result summaries and steward decisions to a CAS channel.

**Phase 3 (when CAS is stable and we want to open up):**
- Multi-tenancy — separate leagues run by separate communities, custom branding per tenant, tenant admin role.
- Progressive Web App — installable on iOS/Android home screens, offline read-only standings, push notifications.
- Subscription / billing layer if needed for paid tiers.
- Visual custom scoring rules editor for non-CAS leagues joining the platform.

---

## 10. Scoring Systems Reference (CAS)

All four systems share these rules unless noted:
- **Participation bonus:** 5 points for finishing ≥75% of race distance (except IEC: ≥50%).
- **Manual penalty points:** admin can deduct points per driver per race.
- **Drop-worst-N rounds:** not currently used in CAS (can be added per season if needed).

### CAS SFL Cup (20 positions, 75% participation threshold)

| Pos | Points | Pos | Points |
|---|---|---|---|
| 1 | 25 | 11 | 10 |
| 2 | 22 | 12 | 9 |
| 3 | 19 | 13 | 8 |
| 4 | 17 | 14 | 7 |
| 5 | 16 | 15 | 6 |
| 6 | 15 | 16 | 5 |
| 7 | 14 | 17 | 4 |
| 8 | 13 | 18 | 3 |
| 9 | 12 | 19 | 2 |
| 10 | 11 | 20 | 1 |

### CAS GT4 Masters (15 positions, 75% participation threshold)

| Pos | Points | Pos | Points |
|---|---|---|---|
| 1 | 30 | 9 | 8 |
| 2 | 25 | 10 | 6 |
| 3 | 21 | 11 | 5 |
| 4 | 18 | 12 | 4 |
| 5 | 16 | 13 | 3 |
| 6 | 14 | 14 | 2 |
| 7 | 12 | 15 | 1 |
| 8 | 10 |  |  |

### CAS GT3 WCT (20 positions, 75% participation threshold)

| Pos | Points | Pos | Points |
|---|---|---|---|
| 1 | 35 | 11 | 15 |
| 2 | 33 | 12 | 13 |
| 3 | 31 | 13 | 11 |
| 4 | 29 | 14 | 9 |
| 5 | 27 | 15 | 7 |
| 6 | 25 | 16 | 5 |
| 7 | 23 | 17 | 4 |
| 8 | 21 | 18 | 3 |
| 9 | 19 | 19 | 2 |
| 10 | 17 | 20 | 1 |

### CAS IEC (30 positions, 50% participation threshold)

| Pos | Points | Pos | Points | Pos | Points |
|---|---|---|---|---|---|
| 1 | 100 | 11 | 35 | 21 | 6 |
| 2 | 90 | 12 | 30 | 22 | 4 |
| 3 | 80 | 13 | 25 | 23 | 3 |
| 4 | 75 | 14 | 20 | 24 | 2 |
| 5 | 70 | 15 | 18 | 25 | 1 |
| 6 | 65 | 16 | 16 | 26 | 1 |
| 7 | 60 | 17 | 14 | 27 | 1 |
| 8 | 55 | 18 | 12 | 28 | 1 |
| 9 | 50 | 19 | 10 | 29 | 1 |
| 10 | 45 | 20 | 8 | 30 | 1 |

### Fair Play Rating (team-level, applies to all four systems)

Awarded per race per class. Based on team total incidents per race per class. **All teams** with ≤25 incidents earn FPR based on which tier their incident count falls into — multiple teams in the same class can earn FPR in the same race. Teams with more than 25 incidents earn 0 FPR.

| Team incidents | FPR awarded |
|---|---|
| 0–15 | 3 |
| 16–20 | 2 |
| 21–25 | 1 |
| 26+ | 0 |

Scoring config: `fpr_enabled = true`, `fpr_mode = ALL_TEAMS_TIERED` for all four CAS systems.

### Pro/Am classification

Admin-assigned at registration, based on a test race and/or previous league participation results. Not self-declared. Adjustable by admin at any point.

### Regulation reference

CAS official regulations: https://docs.google.com/document/d/1mfzw9eATrx9hmVED1xB2k_40soJ5JpKwlBPONZ-0sio/edit?usp=sharing

---

## 11. Team Scoring Rule

**Team rating = sum of the top 2 drivers' championship points per race**, accumulated across the season. Drivers ranked 3rd and lower within their own team in a given race do not contribute to team scoring for that race. This prevents large rosters from having an automatic advantage over smaller teams.

Scoring config: `team_scoring_mode = SUM_BEST_N`, `team_scoring_best_n = 2` for all four CAS systems.

### Minor items still pending (not blocking the build)

- Sample CSV from a recent CAS iRacing session (you're adding to the workspace folder).
- Whether the admin should also be able to deduct points from **team** championship (collective penalty for team rule violations). Easy to add later; default for now is "no".

---

## 12. Risks & Mitigations

**Risk: iRacing OAuth client creation remains paused when Phase 2 starts.**
Mitigation: CSV upload in Phase 1 already provides a working manual path. Monitor iRacing forums, apply for OAuth access now even though we don't need it for months. If OAuth stays closed, we extend the CSV parser to be the long-term primary input.

**Risk: Scope creep during Phase 1.**
Mitigation: This spec is the contract. Anything not listed in §2 goals is Phase 2 or later. New ideas get captured in a parking lot doc, not added mid-build.

**Risk: Scoring engine bugs during first real use.**
Mitigation: End-to-end tests covering all four CAS scoring systems with realistic race data before Week 7 cutover. Admin can manually override any calculated points.

**Risk: iRaceControl decision import complexity.**
Mitigation: Phase 1 accepts manual penalty entry by admin (IRACECONTROL_IMPORT source enum is a placeholder). Structured import from iRaceControl deferred to Phase 2 if it turns out to be needed.

**Risk: Data loss in early production use.**
Mitigation: Neon automatic daily backups + a simple export-to-CSV admin tool by end of Week 6 so you always have your roster and results in a portable format.

---

## 13. Decision Log

Decisions made across the planning discussion:

- Build from scratch, not fork iRLeagueManager.
- Next.js + TypeScript + Tailwind + Postgres + Prisma + Auth.js.
- Host on Vercel + Neon. Domain: `league.simracing-hub.com`.
- Discord OAuth for authentication.
- Phase 1 = Lean MVP + light reporting system. Phase 2 = auto iRacing import. Phase 3 = multi-tenancy + PWA.
- Mobile-responsive from day one; no native apps.
- Public-readable standings, decisions, and results; authenticated registration and reporting; admin-only editing.
- Six CAS leagues pre-seeded: GT3 WCT, IEC, Combined Cup, SFL Cup, PCCD, TSS GT4.
- Four scoring systems seeded in code: SFL Cup, GT4 Masters, GT3 WCT, IEC (see §10 for tables).
- Pro/Am classification is admin-assigned based on test race and/or previous league results — not self-declared.
- Reporting model: drivers file, admins review, decisions public with summary, details private to admins + involved parties.
- iRaceControl continues to handle live stewarding; our tool records final decisions and applies penalties.
- Penalty entity is decoupled from IncidentDecision to support both decision-driven and direct-admin-entered penalties.
- Team rating uses best-2 drivers per race (SUM_BEST_N with N=2) for all CAS leagues.
- FPR is awarded to all teams with ≤25 incidents per race per class, tiered by incident count (ALL_TEAMS_TIERED mode).

---

## 14. Next Actions

1. **You drop a sample CSV** into the workspace folder when you have a moment (needed by Week 4, not blocking).
2. **I draft an email to iRacing** requesting OAuth client credentials for Phase 2 — you send it from your account.
3. **We kick off Week 1** — set up the GitHub repo, Vercel project, Neon database, Discord OAuth app, and Next.js scaffold.
