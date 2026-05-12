#!/usr/bin/env bash
# iRLeagueManager bridge — pull race results directly from iRLM's API
# instead of downloading + uploading CSVs.
#
# Adds:
#   - Season.irlmLeagueName (the URL slug used by your league on iRLM, e.g. "casgt3wct")
#   - Season.irlmSeasonId   (the iRLM internal season id — for reference / future cron)
#   - Round.irlmEventId     (the iRLM event id for this round)
#   - src/lib/irlm.ts       (auth + REST client)
#   - src/lib/actions/irlm-import.ts (pull + map to our schema)
#   - "Pull from iRLM" button on the admin round results page
#   - Fields in season edit + round edit forms for iRLM mapping
#
# Requires env vars: IRLM_USERNAME, IRLM_PASSWORD (set locally + on Vercel).

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. Schema — add iRLM mapping fields
# ------------------------------------------------------------
echo ">>> Adding iRLM fields to schema..."
node -e "
const fs = require('fs');
const p = 'prisma/schema.prisma';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('irlmLeagueName')) {
  s = s.replace(
    /(model Season \{[\s\S]*?teamScoringBestN\s+Int\?)/,
    '\$1\n  irlmLeagueName      String?\n  irlmSeasonId        Int?'
  );
}
if (!s.includes('irlmEventId')) {
  s = s.replace(
    /(model Round \{[\s\S]*?status\s+RoundStatus\s+@default\(UPCOMING\))/,
    '\$1\n  irlmEventId             Int?'
  );
}
fs.writeFileSync(p, s);
console.log('  Schema patched.');
"

echo ">>> Pushing schema..."
npx prisma db push
npx prisma generate

# ------------------------------------------------------------
# 2. iRLM client library
# ------------------------------------------------------------
echo ">>> Writing iRLM API client..."

cat > src/lib/irlm.ts <<'EOF'
const IRLM_BASE_URL =
  process.env.IRLM_API_BASE_URL ?? "https://irleaguemanager.net/api";

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

async function loginToIRLM(): Promise<string> {
  const username = process.env.IRLM_USERNAME;
  const password = process.env.IRLM_PASSWORD;
  if (!username || !password) {
    throw new Error(
      "iRLeagueManager credentials missing. Set IRLM_USERNAME and IRLM_PASSWORD."
    );
  }
  const res = await fetch(`${IRLM_BASE_URL}/Authenticate/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error(
      `iRLM login failed (${res.status}): ${await res.text().catch(() => "")}`
    );
  }
  const data = (await res.json()) as Record<string, unknown>;
  // Different builds expose the token under different keys. Try the common ones.
  const token =
    (data.token as string | undefined) ??
    (data.accessToken as string | undefined) ??
    (data.jwt as string | undefined) ??
    (data.idToken as string | undefined);
  if (typeof token !== "string" || token.length === 0) {
    throw new Error(
      `iRLM login returned no token. Keys: ${Object.keys(data).join(", ")}`
    );
  }
  return token;
}

async function getIRLMToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken;
  const t = await loginToIRLM();
  cachedToken = t;
  tokenExpiresAt = Date.now() + 30 * 60 * 1000; // re-login every 30 minutes
  return t;
}

async function irlmFetch<T = unknown>(path: string): Promise<T> {
  const url = path.startsWith("http") ? path : `${IRLM_BASE_URL}${path}`;
  let token = await getIRLMToken();
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 401) {
    cachedToken = null;
    token = await getIRLMToken();
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  }
  if (!res.ok) {
    throw new Error(
      `iRLM GET ${path} failed (${res.status}): ${await res.text().catch(() => "")}`
    );
  }
  return res.json() as Promise<T>;
}

// ===== Typed helpers (loose typing — iRLM returns large objects) =====

export interface IRLMResultRow {
  scoredResultRowId?: number;
  firstname?: string;
  lastname?: string;
  memberId?: number;
  teamName?: string | null;
  startPosition?: number;
  finishPosition?: number;
  carNumber?: string;
  car?: string;
  completedLaps?: number;
  leadLaps?: number;
  fastLapNr?: number;
  incidents?: number;
  status?: string;
  qualifyingTime?: string | null;
  fastestLapTime?: string | null;
  avgLapTime?: string | null;
  newIrating?: number | null;
  oldIrating?: number | null;
  completedPct?: number;
}

export interface IRLMSessionResult {
  sessionResultId?: number;
  sessionName?: string;
  sessionType?: string;
  resultRows?: IRLMResultRow[];
}

export interface IRLMEventResult {
  leagueId?: number;
  eventId?: number;
  resultId?: number;
  eventName?: string;
  date?: string;
  trackName?: string;
  configName?: string;
  sessionResults?: IRLMSessionResult[];
}

export async function fetchEventResults(
  leagueName: string,
  eventId: number
): Promise<IRLMEventResult[]> {
  return irlmFetch<IRLMEventResult[]>(
    `/${leagueName}/Events/${eventId}/Results`
  );
}

export async function fetchSeasons(
  leagueName: string
): Promise<{ seasonId: number; seasonName: string; finished: boolean }[]> {
  return irlmFetch(`/${leagueName}/Seasons`);
}

export async function fetchEvents(
  leagueName: string,
  scheduleId: number
): Promise<
  {
    id: number;
    name: string;
    date: string;
    trackName: string;
    configName: string;
    hasResult: boolean;
  }[]
> {
  return irlmFetch(`/${leagueName}/Schedules/${scheduleId}/Events?includeDetails=true`);
}
EOF

# ------------------------------------------------------------
# 3. Server action — pull and import
# ------------------------------------------------------------
echo ">>> Writing irlm-import action..."

cat > src/lib/actions/irlm-import.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { fetchEventResults, type IRLMResultRow } from "@/lib/irlm";
import { recomputeRoundScoring } from "@/lib/scoring";
import type { FinishStatus } from "@prisma/client";

function statusFromIRLM(status: string | undefined): FinishStatus {
  if (!status) return "CLASSIFIED";
  const lc = status.toLowerCase();
  if (lc.includes("running")) return "CLASSIFIED";
  if (lc.includes("disq")) return "DSQ";
  if (lc.includes("disconnect")) return "DNF";
  return "DNF";
}

function durationToMs(d: string | null | undefined): number | null {
  if (!d) return null;
  const t = d.trim();
  if (!t || t === "00:00:00" || t === "0") return null;
  // Format hh:mm:ss.fffff or similar
  const parts = t.split(":");
  let h = 0,
    m = 0,
    s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10);
    s = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    m = parseInt(parts[0], 10);
    s = parseFloat(parts[1]);
  } else {
    s = parseFloat(t);
  }
  if (Number.isNaN(h) || Number.isNaN(m) || Number.isNaN(s)) return null;
  const total = h * 3600 + m * 60 + s;
  if (total <= 0) return null;
  return Math.round(total * 1000);
}

function isRaceSession(sessionTypeOrName: string | undefined): boolean {
  if (!sessionTypeOrName) return true; // assume race
  const lc = sessionTypeOrName.toLowerCase();
  if (lc.includes("qualif") || lc.includes("practice") || lc.includes("warmup")) {
    return false;
  }
  return true; // race / heat / etc.
}

export async function pullResultsFromIRLM(
  leagueSlug: string,
  seasonId: string,
  roundId: string
) {
  const admin = await requireAdmin();

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: true },
  });
  if (!round) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  }

  if (!round.irlmEventId || !round.season.irlmLeagueName) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=Configure+iRLM+league+name+on+the+season+and+event+ID+on+the+round+first`
    );
  }

  let eventResults;
  try {
    eventResults = await fetchEventResults(
      round.season.irlmLeagueName,
      round.irlmEventId
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "iRLM fetch failed";
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=${encodeURIComponent(msg)}`
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors: { memberId: string; reason: string }[] = [];

  for (const eventResult of eventResults) {
    for (const session of eventResult.sessionResults ?? []) {
      if (!isRaceSession(session.sessionType ?? session.sessionName)) {
        continue;
      }
      const rows = session.resultRows ?? [];
      let maxLaps = 0;
      for (const row of rows) {
        const l = Number(row.completedLaps ?? 0);
        if (l > maxLaps) maxLaps = l;
      }
      for (const row of rows) {
        const result = await importRow(seasonId, roundId, row, maxLaps);
        if (result.ok) imported++;
        else {
          skipped++;
          if (result.reason)
            errors.push({
              memberId: String(row.memberId ?? "?"),
              reason: result.reason,
            });
        }
      }
    }
  }

  await prisma.csvImport.create({
    data: {
      roundId,
      uploadedById: admin.id,
      originalFilename: `iRLM-pull-${new Date().toISOString()}`,
      rowsImported: imported,
      rowsSkipped: skipped,
      errorLog: errors.length > 0 ? (errors as object) : undefined,
    },
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/standings`
  );

  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?imported=${imported}&skipped=${skipped}`
  );
}

async function importRow(
  seasonId: string,
  roundId: string,
  row: IRLMResultRow,
  maxLaps: number
): Promise<{ ok: boolean; reason?: string }> {
  const memberId = String(row.memberId ?? "").trim();
  if (!memberId) return { ok: false, reason: "no memberId" };

  const reg = await prisma.registration.findFirst({
    where: {
      seasonId,
      status: "APPROVED",
      user: { iracingMemberId: memberId },
    },
  });
  if (!reg) {
    return { ok: false, reason: `no approved registration for ${memberId}` };
  }

  const finishStatus = statusFromIRLM(row.status);
  const finishPosition = Math.round(Number(row.finishPosition ?? 0));
  const lapsCompleted = Math.round(Number(row.completedLaps ?? 0));
  let raceDistancePct = 0;
  if (maxLaps > 0) {
    raceDistancePct = Math.round((lapsCompleted / maxLaps) * 100);
  } else if (typeof row.completedPct === "number") {
    raceDistancePct = Math.round(row.completedPct * 100);
  }
  const incidents = Math.round(Number(row.incidents ?? 0));
  const bestLapTimeMs = durationToMs(row.fastestLapTime);
  const iRating = typeof row.newIrating === "number" ? row.newIrating : null;

  await prisma.raceResult.upsert({
    where: { roundId_registrationId: { roundId, registrationId: reg.id } },
    create: {
      roundId,
      registrationId: reg.id,
      finishStatus,
      finishPosition,
      lapsCompleted,
      raceDistancePct,
      bestLapTimeMs,
      totalTimeMs: null,
      incidents,
      iRating,
    },
    update: {
      finishStatus,
      finishPosition,
      lapsCompleted,
      raceDistancePct,
      bestLapTimeMs,
      incidents,
      iRating,
    },
  });
  return { ok: true };
}
EOF

# ------------------------------------------------------------
# 4. Add iRLM mapping fields to the season + round forms
# ------------------------------------------------------------
echo ">>> Adding iRLM mapping fields to season + round forms (+ actions)..."

# Extend updateSeason to handle irlmLeagueName + irlmSeasonId
node -e "
const fs = require('fs');
const path = 'src/lib/actions/seasons.ts';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes('irlmLeagueName')) {
  s = s.replace(
    /export async function updateSeason\([\s\S]*?status: String\(formData\.get\(\"status\"\) \?\? \"DRAFT\"\) as SeasonStatus;/,
    (m) => m + \`
  const irlmLeagueName = String(formData.get(\"irlmLeagueName\") ?? \"\").trim() || null;
  const irlmSeasonIdRaw = String(formData.get(\"irlmSeasonId\") ?? \"\").trim();
  const irlmSeasonId = irlmSeasonIdRaw ? parseInt(irlmSeasonIdRaw, 10) : null;\`
  );
  s = s.replace(
    /(await prisma\.season\.update\(\{\s*where: \{ id: seasonId \},\s*data: \{)/,
    '\$1\n      irlmLeagueName,\n      irlmSeasonId,'
  );
  fs.writeFileSync(path, s);
  console.log('  Patched seasons action.');
}
"

# Extend updateRound to handle irlmEventId
node -e "
const fs = require('fs');
const path = 'src/lib/actions/rounds.ts';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes('irlmEventId')) {
  s = s.replace(
    /export async function updateRound\([\s\S]*?const status = String\(formData\.get\(\"status\"\) \?\? \"UPCOMING\"\) as RoundStatus;/,
    (m) => m + \`
  const irlmEventIdRaw = String(formData.get(\"irlmEventId\") ?? \"\").trim();
  const irlmEventId = irlmEventIdRaw ? parseInt(irlmEventIdRaw, 10) : null;\`
  );
  s = s.replace(
    /(await prisma\.round\.update\(\{\s*where: \{ id: roundId \},\s*data: \{)/,
    '\$1\n      irlmEventId,'
  );
  fs.writeFileSync(path, s);
  console.log('  Patched rounds action.');
}
"

# Add the field inputs to the season edit page
node -e "
const fs = require('fs');
const path = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/edit/page.tsx';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes('irlmLeagueName')) {
  s = s.replace(
    /<div className=\"flex gap-2\">\s*<button\s+type=\"submit\"/,
    \`<fieldset className=\"rounded border border-zinc-800 bg-zinc-900/40 p-3\">
          <legend className=\"px-2 text-xs uppercase tracking-wider text-zinc-500\">iRLeagueManager bridge</legend>
          <label className=\"block\">
            <span className=\"mb-1 block text-sm text-zinc-300\">iRLM league name (URL slug)</span>
            <input
              name=\"irlmLeagueName\"
              defaultValue={season.irlmLeagueName ?? \"\"}
              placeholder=\"e.g. casgt3wct\"
              className=\"w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100\"
            />
          </label>
          <label className=\"mt-3 block\">
            <span className=\"mb-1 block text-sm text-zinc-300\">iRLM season ID</span>
            <input
              name=\"irlmSeasonId\"
              type=\"number\"
              defaultValue={season.irlmSeasonId ?? \"\"}
              placeholder=\"123\"
              className=\"w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100\"
            />
            <span className=\"mt-1 block text-xs text-zinc-500\">Reference only — used by future cron sync.</span>
          </label>
        </fieldset>

        <div className=\"flex gap-2\">
          <button
            type=\"submit\"\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched season edit page.');
}
"

# Add the field input to the round edit page
node -e "
const fs = require('fs');
const path = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/edit/page.tsx';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes('irlmEventId')) {
  s = s.replace(
    /<div className=\"flex gap-2\">\s*<button\s+type=\"submit\"/,
    \`<label className=\"block\">
          <span className=\"mb-1 block text-sm text-zinc-300\">iRLM event ID (for the bridge)</span>
          <input
            name=\"irlmEventId\"
            type=\"number\"
            defaultValue={round.irlmEventId ?? \"\"}
            placeholder=\"e.g. 2645\"
            className=\"w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100\"
          />
          <span className=\"mt-1 block text-xs text-zinc-500\">Find in iRLeagueManager URL when viewing the event's results page.</span>
        </label>

        <div className=\"flex gap-2\">
          <button
            type=\"submit\"\`
  );
  fs.writeFileSync(path, s);
  console.log('  Patched round edit page.');
}
"

# ------------------------------------------------------------
# 5. Add "Pull from iRLM" button on admin round results page
# ------------------------------------------------------------
echo ">>> Adding Pull-from-iRLM button..."
node -e "
const fs = require('fs');
const path = 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx';
let s = fs.readFileSync(path, 'utf8');
if (!s.includes('pullResultsFromIRLM')) {
  s = s.replace(
    /import \{ formatMsToTime \} from \"@\\/lib\\/time\";/,
    'import { formatMsToTime } from \"@/lib/time\";\nimport { pullResultsFromIRLM } from \"@/lib/actions/irlm-import\";'
  );
  // Insert button next to Import CSV
  s = s.replace(
    /<Link\s*href=\{\\\`\/admin\/leagues\/\\\$\{slug\}\/seasons\/\\\$\{seasonId\}\/rounds\/\\\$\{roundId\}\/import\\\`\}\s*className=\"rounded bg-orange-500[\s\S]*?>\s*Import CSV\s*<\/Link>/,
    (m) => \`{round.irlmEventId && round.season.irlmLeagueName && (
              <form action={pullResultsFromIRLM.bind(null, slug, seasonId, roundId)}>
                <button
                  type=\"submit\"
                  className=\"rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900\"
                >
                  Pull from iRLM
                </button>
              </form>
            )}
            \` + m
  );
  fs.writeFileSync(path, s);
  console.log('  Patched admin round page.');
}
"

# ------------------------------------------------------------
# 6. Update .env.example
# ------------------------------------------------------------
if ! grep -q '^IRLM_USERNAME' .env.example 2>/dev/null; then
  cat >> .env.example <<'EOF'

# iRLeagueManager bridge — credentials for the read-only API at irleaguemanager.net
IRLM_USERNAME=""
IRLM_PASSWORD=""
EOF
fi

# Append blank entries to .env if not present (user fills in)
if ! grep -q '^IRLM_USERNAME' .env 2>/dev/null; then
  cat >> .env <<'EOF'

# iRLeagueManager — fill in your iRLM login
IRLM_USERNAME=""
IRLM_PASSWORD=""
EOF
fi

echo ""
echo "Done. Next steps:"
echo ""
echo "  1. Edit ~/Nextcloud/AI/league-manager/.env and fill in:"
echo "       IRLM_USERNAME=\"your-irlm-login\""
echo "       IRLM_PASSWORD=\"your-irlm-password\""
echo ""
echo "  2. Same env vars on Vercel (Settings → Environment Variables) — Production scope"
echo "     and trigger a redeploy."
echo ""
echo "  3. In admin → your CAS GT3 WCT season → Edit season → set the iRLM league name"
echo "     (the URL slug your league uses on irleaguemanager.net, e.g. \"casgt3wct\")."
echo ""
echo "  4. For each round, edit the round and paste its iRLM event ID. You'll find this"
echo "     in the URL when viewing the event in iRLeagueManager."
echo ""
echo "  5. After a race, on the admin round results page, click \"Pull from iRLM\" instead"
echo "     of downloading and uploading a CSV."
echo ""
echo "Then restart npm run dev (or push to deploy)."
