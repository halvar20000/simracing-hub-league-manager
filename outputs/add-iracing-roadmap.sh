#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p docs

cat > docs/iracing-direct-roadmap.md <<'EOF'
# iRacing-direct results pulling — roadmap

> **Status:** not started. iRLM is the active path. Pick this up when iRLM
> becomes a problem (slow, broken, or just for resilience).

## Why this exists

Today the league-manager pulls race results from iRLeagueManager
(`@/lib/irlm.ts` + `@/lib/actions/irlm-import.ts`). That works, but iRLM is
a single point of failure for the league's primary data. This document is
the plan for a parallel data path that talks directly to iRacing's data
API, so the league-manager can survive iRLM going dark or wrong.

## Authentication — the right path

**Use iRacing's plain email + password flow. Do NOT chase OAuth Client IDs.**

iRacing's third-party OAuth Client ID registration is currently paused and
not coming back on a known timeline. Don't wait for it. Don't try to harvest
tokens from the browser DevTools or intercept the Companion App.

The original data API still accepts straight email + password auth — the
same method every mature data tool uses (iracingdataapi, pyracing, Node
iracing-data-api, the data-mining sites). Auth flow:

1. POST `{ email, password: sha256(password + email.toLowerCase()) }`
   to `https://members-ng.iracing.com/auth`.
2. Receive a session cookie.
3. Use that cookie on `/data/...` endpoints.
4. On 401, re-auth and retry once. (We do this exact pattern in
   `irlm.ts` already.)

Add to Vercel env:
- `IRACING_EMAIL`
- `IRACING_PASSWORD`

Then locally to `.env` for dev. Use existing patterns — same as
`IRLM_USERNAME` / `IRLM_PASSWORD`.

## Three-phase rollout (low risk, parallel until proven)

### Phase 1 — Parallel client, no UI

Build the iRacing API client. No user-visible changes.

- New file: `src/lib/iracing.ts`. Mirror the shape of `irlm.ts`:
  - `loginToIRacing()` — handles the SHA-256 + email auth.
  - `iRacingFetch<T>(path)` — wraps fetch with cookie + 401 retry.
  - `fetchSubsessionResults(subsessionId: number)` — returns the parsed
    results JSON (see "Two-step fetch" below).
  - `fetchMember(custId: number)` — for verifying our user lookup.
- Token / cookie cache in module-level `Map`, same pattern as
  `irlmFetch`.
- Standalone test script: `scripts/test-iracing-fetch.ts` that pulls
  one known subsession and prints the first row. Verify before moving
  on.

**Two-step fetch.** `/data/results/get?subsession_id=X` returns JSON like
`{ link: "https://results.iracing.com/.../something.json?signed=..." }`.
You fetch the `link` to get the actual results payload. Two HTTP calls
per pull. Build this into `fetchSubsessionResults` so callers don't see
it.

**User-Agent.** iRacing rejects bland default agents. Set a custom
`User-Agent: cas-league-manager/1.0` (or similar) on every request.

### Phase 2 — Add alternate import button on Round

Schema:

```prisma
model Round {
  // ... existing fields ...
  irlmEventId           Int?
  iracingSubsessionId   Int?   // ← new
}
```

`prisma db push` to apply.

UI:
- Round edit form gains an "iRacing Subsession ID" input next to the
  existing iRLM Event ID input.
- Admin round page gains a "Pull from iRacing" button next to the
  existing "Pull from iRLM" button. Both visible when configured;
  whichever you click runs that import.
- New server action: `pullResultsFromIRacing` in
  `src/lib/actions/iracing-import.ts`. Same shape as
  `pullResultsFromIRLM` (FormData → upsert RaceResults → redirect).

Mapping from iRacing fields to RaceResult columns (we already have
columns for all of these):

| RaceResult column     | iRacing field                                                  |
|-----------------------|----------------------------------------------------------------|
| `finishPosition`      | `finish_position` (this is overall — no per-class duplicate!)  |
| `startPosition`       | `starting_position`                                            |
| `lapsCompleted`       | `laps_complete`                                                |
| `bestLapTimeMs`       | `best_lap_time` (in 10000ths of a second — divide by 10)       |
| `qualifyingTimeMs`    | `best_qual_lap_time`                                           |
| `totalTimeMs`         | `interval` from session (in 10000ths) — for actual race time   |
| `incidents`           | `incidents`                                                    |
| `iRating`             | `newi_rating`                                                  |
| `finishStatus`        | derive from `reason_out_id` and `laps_complete`                |

**Crucial advantage:** iRacing exposes total race time directly. No need
for the lap-count proxy we use for Combined view. Once Phase 2 is in,
the Combined ranking is pixel-accurate to iRacing's results page.

**Sanity check phase.** For the first few rounds you import via iRacing,
also keep importing via iRLM and diff the two outputs. They should match
on positions, laps, incidents. If they diverge, we figure out why before
trusting the new path.

### Phase 3 — Quietly deprecate iRLM

When you've trusted iRacing-direct for ~3 rounds:

- Hide "Pull from iRLM" behind an admin-debug toggle (or a feature flag).
- "Pull from iRacing" becomes the primary button on the round page.
- The iRLM code stays in the repo. It costs nothing and gives you a
  fallback if iRacing's API ever has an outage.

## Notes / pitfalls

- **Rate limits.** iRacing rate-limits per account. The published numbers
  are vague but generous for league-scale (a handful of pulls per day,
  fine). Add basic exponential backoff just in case; we already do this
  for iRLM.
- **CAPTCHA on too many failed logins.** Token cache means you basically
  never re-login during a session. Not a real-world issue if creds are
  correct.
- **Email change.** The password hash uses lowercased email. If you ever
  change your iRacing account email, both `IRACING_EMAIL` and the hash
  baseline change — re-set the env var.
- **Hosted vs official sessions.** League races are typically hosted
  sessions on iRacing. The endpoint is the same (`/data/results/get`),
  but make sure you're using `subsession_id` — that's the unique key,
  not `session_id` (which can be ambiguous).
- **Subsession ID lookup.** A league round has a session id you can read
  off the iRacing results page URL. Worth documenting where the league
  organizer (you) finds this so the admin form helper text is useful.

## Estimate

Phase 1: ~2h (build + test script verifies one pull works).
Phase 2: ~3h (schema + UI + importer + diff sanity check).
Phase 3: ~30m (toggle + UI cleanup).

Total: roughly 4–6h of focused work, fine to spread over a weekend.

## Don't do

- ❌ Browser DevTools token harvesting (1h expiry, breaks automation).
- ❌ Companion App / Charles / mitmproxy interception (TOS gray area,
  fragile, unnecessary).
- ❌ Wait for OAuth Client ID registration to reopen (no timeline).
- ❌ Build a Python sidecar on Vercel — pure Node is fine, the auth flow
  is straightforward.
EOF

echo "Wrote docs/iracing-direct-roadmap.md"
echo ""
echo "First 20 lines:"
head -20 docs/iracing-direct-roadmap.md

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "docs: add iRacing-direct migration roadmap"
git push

echo ""
echo "Done. The roadmap lives in your repo at docs/iracing-direct-roadmap.md."
echo "Open it any time you want to start the iRLM->iRacing migration."
