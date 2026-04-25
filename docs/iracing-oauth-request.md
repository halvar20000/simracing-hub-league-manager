# iRacing OAuth Client Credentials Request

**Submit via:** iRacing Support Center at https://support.iracing.com → "Submit a ticket" → Category: API / Developer Support.
If a ticket isn't possible because OAuth client creation is currently paused, post the same text in the iRacing Developer forum thread about OAuth client applications.

---

## Subject

Request for OAuth2 Client Credentials — Simracing-Hub League Manager (read-only league data access)

## Body

Hello iRacing team,

I am developing a web-based league management tool called **Simracing-Hub's League Manager**, intended to help sim racing leagues — starting with the CAS iRacing Community — manage driver registrations, seasons, race calendars, standings, and team ratings. The tool is non-commercial, privacy-respecting, and hosted at `league.simracing-hub.com`.

I would like to request **OAuth2 Client Credentials (Client ID and Client Secret)** for read-only access to the iRacing Data API, so that after each league race the tool can automatically import official session results into our standings calculation.

### Application details

- **Application name:** Simracing-Hub's League Manager
- **Website:** https://league.simracing-hub.com (will be live once Phase 1 ships)
- **Parent site:** https://simracing-hub.com
- **Owner:** Thomas Herbrig
- **Contact email:** thomas.herbrig@gmail.com
- **Hosting region:** Germany / EU (Vercel + Neon Postgres)
- **Tech stack:** Next.js + TypeScript + Postgres

### Intended OAuth flow

**Password Limited Flow** — the tool will act as a backend that polls the Data API on behalf of a single authenticated league administrator account. Individual drivers do not log in to iRacing through our tool.

### Data API endpoints we plan to use

All read-only:

- `league/get` — fetch league metadata
- `league/roster` — fetch league roster to match drivers by member ID
- `league/seasons` — list of league seasons
- `league/season_sessions` — scheduled and completed sessions for a season
- `results/get` — detailed session results (driver positions, laps, incidents, times, fastest lap)
- `results/season_results` — season-wide result summaries

We will not call any write endpoints.

### Expected usage

- **Communities served:** 1 (CAS iRacing Community) at launch; potentially more after Phase 3 (multi-tenancy), each with its own Client Credentials if required.
- **Leagues:** 6 CAS leagues (GT3 WCT, IEC, Combined Cup, SFL Cup, PCCD, TSS GT4).
- **Drivers:** roughly 50–200 registered members.
- **Request volume:** polling results after each race night (a few races per week across all leagues), plus occasional admin-triggered refreshes. Well below any reasonable rate limit.

### Timeline

We are currently in Phase 1 (building the core platform with manual CSV result entry). Phase 2 — which depends on your API credentials — is targeted for approximately July–September 2026.

If OAuth client ID issuance is currently paused, please add us to the waiting list and notify us at thomas.herbrig@gmail.com when applications reopen.

Thank you for the work you do supporting the sim racing community.

Best regards,

**Thomas Herbrig**
Owner, Simracing-Hub
thomas.herbrig@gmail.com
https://simracing-hub.com
