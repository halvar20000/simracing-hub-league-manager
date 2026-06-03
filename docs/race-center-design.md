# Race Center — design doc

**Status:** draft for Thomas's review · 3 June 2026
**Goal:** Move the per-round Race Center content (currently static HTML on simracing-hub.com) into CLS as a new public tab. SimRacing-Hub will link out for the rich content; CLS becomes the single source of truth.

## Why

`race-center.html` and `de/race-center.html` are already 2000+ lines of static HTML with one `<article>` per round, plus matching chart PNGs and replay MP4s in `races/`. The page grows unboundedly, and the data it shows (results, lap times, incidents) already lives in CLS — so we end up hand-mirroring CLS into the website every race. Today's Thruxton R11 session exposed how fragile that is: six factual errors landed on the live site before being caught against CLS. Owning the Race Center in CLS removes the duplication entirely.

## What goes where

| Content | Today | After |
|---|---|---|
| Results table, quali times, incidents, points | CLS round page (Combined/Quali tabs) | CLS round page (unchanged) |
| Narrative prose (Race Highlights) | `race-center.html` HTML | CLS `RaceCenter` table → public Race Center tab |
| By-the-Numbers cards (Winner, FL, Comeback, Cleanest, Yellows, Conditions) | Static HTML cards | CLS — partly auto-derived, partly curated |
| 10 chart PNGs (gap, pace, pits, incidents, positions, overtakes, incident-map, pit-loss, stint-pace, battle) | `races/<slug>-r<N>-chart-*.png` static | Vercel Blob, referenced from `RaceCenterChart` rows |
| 2D telemetry replay MP4 + poster JPG | `races/<slug>-r<N>-replay.mp4` static | Vercel Blob, referenced from `RaceCenter` |
| Narrative race summary (different audience: site readers) | `cas-community.html` | **Unchanged** — stays on simracing-hub.com, linked to CLS Race Center |

The narrative on `cas-community.html` (community-flavoured story) is a different artifact from the Race Center (data-flavoured deep dive). Both stay; the Race Center moves.

## Stack confirmation

Confirmed from `/Users/thomasherbrig/Nextcloud/AI/league-manager/`:

- Next.js 16, App Router, TypeScript, React 19
- Prisma 6 → Postgres
- `@vercel/blob` 2.3.3 already installed and in use (StreamAnnouncement model uploads posters this way)
- Tailwind 4
- NextAuth 5 beta · admin gate via `requireAdmin()` in `src/lib/auth-helpers.ts`

The new feature follows existing conventions exactly — no new dependencies, no new patterns.

## Data model

Add two models to `prisma/schema.prisma`. The `StreamAnnouncement` model (lines 585–612) is the working template — a 1:1 relation with `Round` plus a Vercel Blob URL field. Pattern carried over.

```prisma
model RaceCenter {
  id                String   @id @default(cuid())
  roundId           String   @unique
  round             Round    @relation(fields: [roundId], references: [id], onDelete: Cascade)

  // Narrative
  headline          String?            /// "Zörlaut wins late, Wonnenberg's title secured"
  highlightsMd      String?  @db.Text  /// multi-paragraph markdown for the Race Highlights section

  // Curated cards (auto-derived where possible; these are commentary overlays)
  comebackUserId    String?            /// Comeback Drive — manually picked
  comebackNote      String?
  cleanestNote      String?            /// Override of the auto-derived cleanest-driver blurb

  // Conditions
  airTempC          Float?
  trackTempC        Float?
  skyConditions     String?            /// "Partly cloudy"
  wetnessLevel      Int?               /// 1–10 (iRacing scale)

  // Yellow flags
  yellowFlagCount   Int      @default(0)
  yellowFlagNote    String?            /// "FCY never triggered — incidents too spread out"

  // 2D telemetry replay
  replayBlobUrl     String?            /// Vercel Blob URL — MP4
  posterBlobUrl     String?            /// Vercel Blob URL — JPG
  replayCaption     String?            /// "2D telemetry replay — 61 min compressed to 75s"
  replayDurationS   Int?               /// For the player UI

  // Source / publishing
  broadcastUrl      String?            /// YouTube/Twitch broadcast link
  publishedAt       DateTime?          /// Set when the admin makes it public; null = draft

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  charts            RaceCenterChart[]
  comebackUser      User?    @relation("RaceCenterComeback", fields: [comebackUserId], references: [id])

  @@index([publishedAt])
}

model RaceCenterChart {
  id            String     @id @default(cuid())
  raceCenterId  String
  raceCenter    RaceCenter @relation(fields: [raceCenterId], references: [id], onDelete: Cascade)

  chartType     String     /// "gap" | "pace" | "pits" | "incidents" | "incidents-map"
                           /// | "positions" | "overtakes" | "pit-loss" | "stint-pace" | "battle"
  title         String     /// "Gap to Leader"
  blobUrl       String     /// Vercel Blob URL — PNG
  caption       String?    /// Descriptive paragraph below the chart
  sortOrder     Int        @default(0)

  createdAt     DateTime   @default(now())

  @@unique([raceCenterId, chartType])
}
```

Two extra back-relations on existing models:

```prisma
model Round {
  // ... existing fields ...
  raceCenter  RaceCenter?
}

model User {
  // ... existing fields ...
  raceCenterComebacks  RaceCenter[]  @relation("RaceCenterComeback")
}
```

### Why two tables, not one

Charts are a 0..10 list per Race Center, each with its own image URL and caption. Embedding as JSON on `RaceCenter` would work but loses the cascade-delete blob cleanup and the per-chart sort order. A separate table is the same Prisma idiom used elsewhere in the schema (IncidentReportEvidence, RaceResult).

## Routes

### Public — new tab on the existing round page

The public round page already supports `?cls=combined|quali|pro|am|team|race1|race2|car|teams`. Add `race-center` to that enum. No new route file — extend `src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx`.

```ts
type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2" | "quali" | "car" | "teams" | "race-center";
```

The tab nav (`<View: Combined | Quali | Pro | …>`) gets a new `Race Center` button, rendered only if `round.raceCenter !== null && round.raceCenter.publishedAt !== null`. This keeps it hidden for upcoming rounds and admin-only drafts.

When `cls === "race-center"`, render a new section component (`<RaceCenterView round={round} />`) with: hero (poster + title + headline) → By-the-Numbers grid (6 cards) → Data Views grid (charts, in `sortOrder`) → Race Highlights prose (markdown rendered) → embedded 2D replay video → footer source citation linking back to Combined/Quali tabs.

### Admin — new sub-route

`src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/race-center/page.tsx`

Mirrors the structure of the existing `stream/` admin route (full-page form, server actions, `requireAdmin()` at the top). Form sections:

1. **Narrative** — headline (text), highlights (textarea, markdown). Live word count.
2. **Conditions** — 4 inputs: air °C, track °C, sky string, wetness 1–10.
3. **Yellow Flags** — count (number), note (text).
4. **Comeback Drive** — driver dropdown sourced from `round.raceResults[].user`, optional note.
5. **Replay** — file inputs for MP4 and JPG poster, caption text, duration seconds. "Replace" button replaces the blob.
6. **Charts** — 10 fixed slots (one per `chartType`). Each slot: file input, title (autofilled from type), caption textarea, sortOrder number. "Replace" or "Remove" per chart.
7. **Publish** — checkbox to set `publishedAt = now()`, or button to mark draft (set null). Status pill at top: `DRAFT` / `PUBLISHED`.

Auto-derived rows (Race Winner, Fastest Lap, Cleanest Race) are shown as read-only previews above the form — pulled from `round.raceResults` — so the admin sees what the public will see without editing those fields.

## Server actions

New file: `src/lib/actions/race-center.ts`. Mirrors `stream-announcements.ts` exactly. Functions:

- `saveRaceCenter(formData)` — upsert narrative + conditions + cards. No file uploads here.
- `uploadRaceCenterChart(formData)` — single chart slot. Validates `chartType` against the 10 allowed values. Calls `put(filename, file, { allowOverwrite: false })`; if a chart already exists at that slot, `del(existing.blobUrl)` first, then `put`.
- `deleteRaceCenterChart(chartId)` — single chart removal with blob cleanup.
- `uploadRaceCenterReplay(formData)` — video + poster. Same pattern.
- `publishRaceCenter(formData) / unpublishRaceCenter(formData)` — flip `publishedAt`.
- `deleteRaceCenter(formData)` — full delete, cleans up all chart blobs + replay blob + poster blob.

Each action returns to the admin page via `redirect()` with `?ok=…` or `?error=…` for status banners, matching the existing convention.

## Vercel Blob storage layout

Filenames carry the round context so blobs are debuggable:

```
race-center/<league-slug>/<season-id>/<round-number>/replay.mp4
race-center/<league-slug>/<season-id>/<round-number>/poster.jpg
race-center/<league-slug>/<season-id>/<round-number>/chart-<chartType>.png
```

`put()` with `addRandomSuffix: true` would scramble these — keep `false` and rely on `del()` on replace.

## Public-side wiring (simracing-hub.com)

Two changes to the static site:

1. **cas-community.html "Open Race Center →" button** currently points at `race-center.html#thruxton-r11`. Change it to point at the CLS round URL with the `race-center` tab:
   ```
   https://league.simracing-hub.com/leagues/cas-gt3-wct/seasons/<season-id>/rounds/<round-id>?cls=race-center
   ```
   The link template can be looked up at write time from the CLS standings page, so the cas-race-summary skill can generate the correct URL.

2. **race-center.html** — keep as-is for now. After 2–3 races have shipped Race Center on CLS, replace its body with a thin index page that lists rounds and links out to CLS. Or just retire the file.

## Backfill — Thruxton R11 + Magny-Cours R10

Once the admin form is live, both backfills are manual data entry through the form. The existing chart PNGs and replay MP4s are already in `~/Nextcloud/AI/SimRacing-News/races/` and can be uploaded straight through the form. Expected time per round: ~15 minutes of typing + uploads.

After both are in CLS, simracing-hub.com's `race-center.html` can be reduced to a "see CLS for full Race Center →" landing or retired entirely.

## Implementation order

A reasonable five-step rollout:

1. **Schema** — add `RaceCenter` + `RaceCenterChart` to `prisma/schema.prisma`, run `prisma db push` (Thomas, with phone hotspot). Deploy script: `lm_db_push_race_center.sh`. ✅ **READY** as of 3 June 2026 — schema applied, validated by `npx prisma validate`, db-push script in `outputs/`.
2. **Admin form** — `race-center/page.tsx` + `src/lib/actions/race-center.ts`. Ship via `lm_deploy_race_center_admin.sh`. Test by entering data for a non-published draft.
3. **Public UI** — extend the round page with the new `race-center` tab + `<RaceCenterView />` component. Ship via `lm_deploy_race_center_public.sh`.
4. **Backfill** — manually enter Thruxton R11 and Magny-Cours R10 through the admin form, upload existing charts and replay MP4s.
5. **simracing-hub.com update** — change the "Open Race Center →" link on cas-community.html (EN+DE) to point at the CLS URL. Push via `push_to_github.sh`.

Each step is independently deployable and revertable.

## Decisions (resolved 3 June 2026)

1. **Markdown rendering** → **add `react-markdown`**. No existing markdown rendering in the codebase (StreamAnnouncement's `messageText` is concatenated as plain text into a Discord embed, never rendered as HTML). React 19 + Next 16 compatible. Add via `npm i react-markdown` in the admin/public deploy phase.

2. **Chart-type enum** → **free-text `chartType: String`** with a TypeScript-side const list in `src/lib/race-center-charts.ts`. Adding a new chart kind never requires a schema migration. The admin form's dropdown is driven by the const list. Phase 1 schema has this as `String` with a `@@unique([raceCenterId, chartType])` to prevent duplicates per Race Center.

3. **Comeback Drive card** → **hide when `comebackUserId` is null**. No empty/placeholder state on the public page.

4. **Weather conditions** → **auto-pull from iRacing JSON**, with manual override. The `session_results[RACE].weather_result` object in iRacing's eventresult JSON has rich data — `avg_temp` (air, °C), `avg_skies` (0–3 enum), `avg_cloud_cover_pct`, `precip_mm`, `precip_time_pct`. Track temp is NOT in the JSON, so that one field stays manual (admin reads it off the in-game replay if they care). The admin form will have a "Pull weather from iRacing JSON" button that re-reads the round's most recent import and fills the form.

## Out of scope for v1

- Auto-generating charts from CLS data (the existing pipeline outside CLS keeps producing them; we just upload)
- Multi-language Race Center content (start English; German narrative later if needed)
- Public RSS / API exposure of Race Center content
- Embedding Race Center inside simracing-hub.com as an iframe (link out is simpler)

## Skill update

The `cas-race-summary` skill we packaged today targets the current workflow (write to `race-center.html` + EN/DE). Once steps 2–4 are live, the skill's `references/page-structure.md` needs revising:

- Remove the `race-center.html` `<article>` scaffolding
- Add a section on filling out the CLS admin form (which becomes the new race-center workflow)
- Keep the `cas-community.html` narrative section as-is (still relevant)

Leave the skill alone until then — premature changes would confuse the Phillip Island finale write-up.
