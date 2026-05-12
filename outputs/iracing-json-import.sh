#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. Parser: src/lib/iracing-json.ts
# ===========================================================================
mkdir -p src/lib
cat > src/lib/iracing-json.ts <<'TS'
/**
 * Parser for the iRacing event-result JSON downloaded from a hosted /league
 * subsession. The wire format is `{ type: "event_result", data: {...} }`.
 *
 * iRacing stores all lap times as 10000ths of a second.  We convert to
 * milliseconds (× 0.1) for storage in our schema.
 */

export type ParsedSessionKind = "QUALIFY" | "RACE";

export interface ParsedDriver {
  custId: number;
  displayName: string;
  countryCode: string | null;
  /** 1-based finish position (iRacing uses 0-based; we add 1) */
  finishPosition: number;
  /** 1-based starting grid position, or null if unknown */
  startingPosition: number | null;
  lapsComplete: number;
  bestLapMs: number | null;
  qualLapMs: number | null;
  incidents: number;
  iRating: number | null;
  carClassShortName: string | null;
  reasonOut: string;
  finishStatus: "CLASSIFIED" | "DNF" | "DNS" | "DSQ";
}

export interface ParsedSession {
  kind: ParsedSessionKind;
  /** 1 for the only/first race, 2 for the second race in multi-race rounds */
  raceNumber: number;
  simSessionName: string;
  simSessionType: number;
  simSessionNumber: number;
  drivers: ParsedDriver[];
  /** Highest laps_complete in this session — used to compute distance % */
  maxLaps: number;
}

export interface ParsedEvent {
  subsessionId: number;
  trackName: string;
  trackConfig: string | null;
  startTime: Date;
  endTime: Date | null;
  leagueName: string | null;
  sessions: ParsedSession[];
  raw: { rawSessionNames: string[] };
}

export class IracingJsonParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IracingJsonParseError";
  }
}

function mapReasonOut(reason: string | undefined): ParsedDriver["finishStatus"] {
  const r = (reason ?? "").toLowerCase();
  if (!r || r === "running" || r.includes("classified")) return "CLASSIFIED";
  if (r.includes("disqualif")) return "DSQ";
  if (r.includes("did not start") || r === "dns") return "DNS";
  return "DNF";
}

function tenThousandthsToMs(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0) return null;
  return Math.round(v / 10);
}

function buildSession(
  s: any,
  kind: ParsedSessionKind,
  raceNumber: number
): ParsedSession {
  const rows: any[] = Array.isArray(s?.results) ? s.results : [];
  const drivers: ParsedDriver[] = rows
    .filter((r) => typeof r?.cust_id === "number" && r.cust_id > 0)
    .map((r) => {
      const startPosRaw = r.starting_position;
      const startingPosition =
        typeof startPosRaw === "number" && startPosRaw >= 0
          ? startPosRaw + 1
          : null;
      return {
        custId: r.cust_id,
        displayName: String(r.display_name ?? ""),
        countryCode: typeof r.country_code === "string" && r.country_code.length === 2
          ? r.country_code.toUpperCase()
          : null,
        finishPosition: (typeof r.finish_position === "number" ? r.finish_position : 0) + 1,
        startingPosition,
        lapsComplete: typeof r.laps_complete === "number" ? r.laps_complete : 0,
        bestLapMs: tenThousandthsToMs(r.best_lap_time),
        qualLapMs: tenThousandthsToMs(r.qual_lap_time ?? r.best_qual_lap_time),
        incidents: typeof r.incidents === "number" ? r.incidents : 0,
        iRating: typeof r.newi_rating === "number" && r.newi_rating > 0 ? r.newi_rating : null,
        carClassShortName:
          typeof r.car_class_short_name === "string" ? r.car_class_short_name : null,
        reasonOut: String(r.reason_out ?? "Running"),
        finishStatus: mapReasonOut(r.reason_out),
      };
    });
  const maxLaps = drivers.reduce((m, d) => Math.max(m, d.lapsComplete), 0);
  return {
    kind,
    raceNumber,
    simSessionName: String(s?.simsession_name ?? ""),
    simSessionType: typeof s?.simsession_type === "number" ? s.simsession_type : 0,
    simSessionNumber: typeof s?.simsession_number === "number" ? s.simsession_number : 0,
    drivers,
    maxLaps,
  };
}

export function parseIracingEventJson(input: unknown): ParsedEvent {
  const wrapper = input as { type?: string; data?: any } | undefined;
  if (!wrapper || wrapper.type !== "event_result" || !wrapper.data) {
    throw new IracingJsonParseError(
      'Expected an iRacing event-result JSON object with { "type": "event_result", "data": {...} }'
    );
  }
  const data = wrapper.data;
  const all: any[] = Array.isArray(data.session_results) ? data.session_results : [];

  // Race sessions = simsession_type === 6, ordered by simsession_number ASC
  // (iRacing uses negative numbers for non-final sessions, 0 for the FEATURE).
  const raceSessions = all
    .filter((s) => s?.simsession_type === 6)
    .sort((a, b) => (a.simsession_number ?? 0) - (b.simsession_number ?? 0));
  // Qualify session = simsession_type === 4 (only one expected per event).
  const qualifySession = all.find((s) => s?.simsession_type === 4);

  const sessions: ParsedSession[] = [];
  if (qualifySession) {
    sessions.push(buildSession(qualifySession, "QUALIFY", 1));
  }
  raceSessions.forEach((s, i) => {
    sessions.push(buildSession(s, "RACE", i + 1));
  });

  return {
    subsessionId: typeof data.subsession_id === "number" ? data.subsession_id : 0,
    trackName: data.track?.track_name ?? "Unknown",
    trackConfig:
      data.track?.config_name && data.track.config_name !== "N/A"
        ? data.track.config_name
        : null,
    startTime: data.start_time ? new Date(data.start_time) : new Date(),
    endTime: data.end_time ? new Date(data.end_time) : null,
    leagueName: typeof data.league_name === "string" ? data.league_name : null,
    sessions,
    raw: {
      rawSessionNames: all.map((s) => String(s?.simsession_name ?? "")),
    },
  };
}
TS
echo "[+] Wrote src/lib/iracing-json.ts"

# ===========================================================================
# 2. Server action: src/lib/actions/iracing-json-import.ts
# ===========================================================================
mkdir -p src/lib/actions
cat > src/lib/actions/iracing-json-import.ts <<'TS'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { recomputeRoundScoring } from "@/lib/scoring";
import {
  parseIracingEventJson,
  IracingJsonParseError,
  type ParsedEvent,
} from "@/lib/iracing-json";

interface UnmatchedDriver {
  custId: number;
  displayName: string;
}

function buildSummaryQuery(
  imported: number,
  races: number,
  unmatched: UnmatchedDriver[]
): string {
  const params = new URLSearchParams({
    imported: String(imported),
    races: String(races),
    unmatchedCount: String(unmatched.length),
  });
  // Pack the first 12 unmatched as "custId:name|custId:name" to keep URL short.
  if (unmatched.length > 0) {
    const list = unmatched
      .slice(0, 12)
      .map((u) => `${u.custId}:${u.displayName.replace(/[|:]/g, " ")}`)
      .join("|");
    params.set("unmatched", list);
  }
  return params.toString();
}

export async function importIracingJson(
  leagueSlug: string,
  seasonId: string,
  roundId: string,
  formData: FormData
): Promise<void> {
  await requireAdmin();

  const file = formData.get("jsonFile");
  if (!(file instanceof File) || file.size === 0) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?error=No+file+selected`
    );
  }

  const text = await (file as File).text();

  let parsed: ParsedEvent;
  try {
    parsed = parseIracingEventJson(JSON.parse(text));
  } catch (e) {
    const msg =
      e instanceof IracingJsonParseError
        ? e.message
        : e instanceof SyntaxError
          ? "File is not valid JSON"
          : "Could not parse iRacing JSON";
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?error=${encodeURIComponent(
        msg
      )}`
    );
  }

  // Pull season roster + build cust_id → registrationId map
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: { user: true },
  });
  const memberMap = new Map<number, { regId: string; userId: string; currentCountry: string | null }>();
  for (const reg of registrations) {
    const raw = reg.user.iracingMemberId;
    if (!raw) continue;
    const id = parseInt(raw, 10);
    if (Number.isNaN(id)) continue;
    memberMap.set(id, {
      regId: reg.id,
      userId: reg.userId,
      currentCountry: reg.user.countryCode,
    });
  }

  // REPLACE policy: wipe existing race results for this round
  await prisma.raceResult.deleteMany({ where: { roundId } });

  // Build qualifying lookup (cust_id → fastest lap in qualify in ms)
  const qualSession = parsed.sessions.find((s) => s.kind === "QUALIFY");
  const qualByCustId = new Map<number, number | null>();
  if (qualSession) {
    for (const d of qualSession.drivers) {
      const ms = d.bestLapMs ?? d.qualLapMs ?? null;
      qualByCustId.set(d.custId, ms);
    }
  }

  const unmatchedSet = new Map<number, UnmatchedDriver>();
  let totalCreated = 0;
  const raceSessions = parsed.sessions.filter((s) => s.kind === "RACE");

  for (const session of raceSessions) {
    for (const d of session.drivers) {
      const reg = memberMap.get(d.custId);
      if (!reg) {
        if (!unmatchedSet.has(d.custId)) {
          unmatchedSet.set(d.custId, {
            custId: d.custId,
            displayName: d.displayName,
          });
        }
        continue;
      }

      // Update country code on user if differs and we have one
      if (d.countryCode && d.countryCode !== reg.currentCountry) {
        await prisma.user.update({
          where: { id: reg.userId },
          data: { countryCode: d.countryCode },
        });
        reg.currentCountry = d.countryCode;
      }

      const distancePct =
        session.maxLaps > 0
          ? Math.min(100, Math.floor((d.lapsComplete / session.maxLaps) * 100))
          : 0;

      await prisma.raceResult.create({
        data: {
          roundId,
          registrationId: reg.regId,
          raceNumber: session.raceNumber,
          finishPosition: d.finishPosition,
          startPosition: d.startingPosition,
          lapsCompleted: d.lapsComplete,
          raceDistancePct: distancePct,
          bestLapTimeMs: d.bestLapMs,
          qualifyingTimeMs: qualByCustId.get(d.custId) ?? null,
          iRating: d.iRating,
          incidents: d.incidents,
          finishStatus: d.finishStatus,
        },
      });
      totalCreated++;
    }
  }

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(
    `/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`
  );
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);

  const unmatched = Array.from(unmatchedSet.values());
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}/import-json?${buildSummaryQuery(
      totalCreated,
      raceSessions.length,
      unmatched
    )}`
  );
}
TS
echo "[+] Wrote src/lib/actions/iracing-json-import.ts"

# ===========================================================================
# 3. New page: /admin/.../import-json
# ===========================================================================
mkdir -p 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import-json'
cat > 'src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/import-json/page.tsx' <<'TSX'
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { importIracingJson } from "@/lib/actions/iracing-json-import";

interface Props {
  params: Promise<{ slug: string; seasonId: string; roundId: string }>;
  searchParams: Promise<{
    error?: string;
    imported?: string;
    races?: string;
    unmatchedCount?: string;
    unmatched?: string;
  }>;
}

export default async function ImportIracingJsonPage({
  params,
  searchParams,
}: Props) {
  await requireAdmin();
  const { slug, seasonId, roundId } = await params;
  const sp = await searchParams;

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (!round || round.season.league.slug !== slug) notFound();

  const action = importIracingJson.bind(null, slug, seasonId, roundId);

  // Parse summary
  const imported = sp.imported ? parseInt(sp.imported, 10) : null;
  const races = sp.races ? parseInt(sp.races, 10) : null;
  const unmatchedCount = sp.unmatchedCount ? parseInt(sp.unmatchedCount, 10) : 0;
  const unmatchedList = sp.unmatched
    ? sp.unmatched.split("|").map((s) => {
        const [custId, ...nameParts] = s.split(":");
        return { custId, name: nameParts.join(":") };
      })
    : [];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <Link
          href={`/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Round {round.roundNumber} — {round.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Import iRacing JSON</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Upload the <code className="text-zinc-300">eventresult-*.json</code> file
          downloaded from the iRacing subsession page. Existing race results
          for this round will be <strong>replaced</strong>.
        </p>
      </div>

      {sp.error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {sp.error}
        </div>
      )}

      {imported != null && (
        <div className="space-y-3">
          <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
            Imported <strong>{imported}</strong> result row
            {imported === 1 ? "" : "s"} across <strong>{races}</strong> race
            session{races === 1 ? "" : "s"}.
          </div>
          {unmatchedCount > 0 && (
            <div className="rounded border border-amber-800 bg-amber-950/40 p-3 text-sm text-amber-200">
              <p className="font-medium">
                {unmatchedCount} driver{unmatchedCount === 1 ? "" : "s"} from the JSON
                {unmatchedCount === 1 ? " was" : " were"} not in the season roster
                and {unmatchedCount === 1 ? "was" : "were"} skipped:
              </p>
              <ul className="mt-2 list-disc pl-5 text-xs">
                {unmatchedList.map((u) => (
                  <li key={u.custId}>
                    <span className="font-mono text-amber-300">#{u.custId}</span>{" "}
                    {u.name}
                  </li>
                ))}
                {unmatchedCount > unmatchedList.length && (
                  <li className="text-amber-300/70">
                    …and {unmatchedCount - unmatchedList.length} more
                  </li>
                )}
              </ul>
              <p className="mt-2 text-xs text-amber-200/80">
                Add these drivers to the roster (with their iRacing customer ID),
                then re-import the JSON to capture their results.
              </p>
            </div>
          )}
        </div>
      )}

      <form
        action={action}
        encType="multipart/form-data"
        className="space-y-4 rounded border border-zinc-800 bg-zinc-900/40 p-5"
      >
        <label className="block">
          <span className="mb-2 block text-sm text-zinc-300">
            iRacing event JSON file
          </span>
          <input
            type="file"
            name="jsonFile"
            accept="application/json,.json"
            required
            className="block w-full cursor-pointer rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 file:mr-3 file:rounded file:border-0 file:bg-orange-500 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-zinc-950 hover:file:bg-orange-400"
          />
        </label>

        <details className="text-xs text-zinc-500">
          <summary className="cursor-pointer hover:text-zinc-300">
            How does this work?
          </summary>
          <p className="mt-2">
            The parser reads <code>data.session_results</code> from the iRacing
            JSON. Sessions with <code>simsession_type=6</code> become race
            results (HEAT 1 → race 1, FEATURE → race 2). The session with{" "}
            <code>simsession_type=4</code> becomes the qualifying time. Drivers
            are matched against your roster via{" "}
            <code>User.iracingMemberId</code>. Times are converted from iRacing
            10000ths-of-a-second to milliseconds. After import, scoring is
            recomputed and standings are revalidated.
          </p>
        </details>

        <div className="flex justify-end">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-orange-400"
          >
            Import & replace
          </button>
        </div>
      </form>
    </div>
  );
}
TSX
echo "[+] Wrote import-json/page.tsx"

# ===========================================================================
# 4. Round admin page: add the "Import JSON" button next to "Import CSV"
# ===========================================================================
cat > outputs-tmp/patch-round-admin.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (s.includes("/import-json")) {
  console.log("Round admin: Import JSON link already present.");
  process.exit(0);
}

const before = `            <Link
              href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/import\`}
              className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Import CSV
            </Link>`;

const after = `            <Link
              href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/import\`}
              className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
            >
              Import CSV
            </Link>
            <Link
              href={\`/admin/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}/import-json\`}
              className="rounded border border-orange-500 bg-orange-500/10 px-3 py-1.5 text-sm font-medium text-orange-300 hover:bg-orange-500/20"
            >
              Import iRacing JSON
            </Link>`;

if (!s.includes(before)) { console.error("Round admin: 'Import CSV' anchor not found."); process.exit(1); }
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Round admin: Import JSON link inserted.");
EOF
node outputs-tmp/patch-round-admin.mjs

rm -rf outputs-tmp

# ===========================================================================
# Type-check + commit
# ===========================================================================
echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Import: iRacing JSON importer (parser + admin page) — replaces existing round results, lists unmatched cust_ids"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
