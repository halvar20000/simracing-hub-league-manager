/**
 * Public Race Center renderer — the post-race deep dive that lives on
 * /leagues/<slug>/seasons/<id>/rounds/<id>?cls=race-center.
 *
 * Replaces the static <article> blocks that used to live on
 * simracing-hub.com/race-center.html. Reads from the RaceCenter + RaceCenterChart
 * tables populated either by the admin form or the one-shot backfill importer.
 */

import ReactMarkdown from "react-markdown";
import { skiesLabel } from "@/lib/iracing-weather";

type Chart = {
  id: string;
  chartType: string;
  title: string;
  blobUrl: string;
  caption: string | null;
  sortOrder: number;
};

type ComebackUser = {
  id: string;
  firstName: string | null;
  lastName: string | null;
  name: string | null;
  countryCode: string | null;
};

type RaceCenter = {
  id: string;
  headline: string | null;
  highlightsMd: string | null;
  winnerNote: string | null;
  fastestLapNote: string | null;
  cleanestNote: string | null;
  comebackUserId: string | null;
  comebackNote: string | null;
  comebackUser: ComebackUser | null;
  airTempC: number | null;
  trackTempC: number | null;
  skiesCode: number | null;
  cloudCoverPct: number | null;
  precipMm: number | null;
  precipTimePct: number | null;
  yellowFlagCount: number;
  yellowFlagNote: string | null;
  replayBlobUrl: string | null;
  posterBlobUrl: string | null;
  replayCaption: string | null;
  replayDurationS: number | null;
  broadcastUrl: string | null;
  publishedAt: Date | null;
  charts: Chart[];
};

type RaceResult = {
  finishPosition: number;
  finishStatus: string;
  incidents: number;
  bestLapTimeMs: number | null;
  registration: {
    user: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      name: string | null;
      countryCode: string | null;
    };
  };
};

export function RaceCenterView({
  raceCenter,
  raceResults,
  roundName,
  roundNumber,
  startsAt,
}: {
  raceCenter: RaceCenter;
  raceResults: RaceResult[];
  roundName: string;
  roundNumber: number;
  startsAt: Date;
}) {
  // Auto-derived from raceResults: winner, FL, cleanest.
  const classified = raceResults.filter((r) => r.finishStatus === "CLASSIFIED");
  const winner = classified.find((r) => r.finishPosition === 1) ?? null;
  const fastest = classified.reduce<RaceResult | null>((best, r) => {
    if (r.bestLapTimeMs == null || r.bestLapTimeMs <= 0) return best;
    if (!best || r.bestLapTimeMs < (best.bestLapTimeMs ?? Infinity)) return r;
    return best;
  }, null);
  const cleanest = classified.reduce<RaceResult | null>((best, r) => {
    if (!best || r.incidents < best.incidents) return r;
    return best;
  }, null);

  const skiesText = skiesLabel(raceCenter.skiesCode);
  const isWet =
    (raceCenter.precipMm != null && raceCenter.precipMm > 0) ||
    (raceCenter.precipTimePct != null && raceCenter.precipTimePct > 0);

  return (
    <div className="space-y-6">
      {/* === Hero — text only, the poster is reused as the <video> thumbnail below === */}
      <section className="space-y-2 rounded-lg border border-zinc-800 bg-zinc-900 p-5">
        <div className="text-xs uppercase tracking-wider text-zinc-500">
          Round {roundNumber} · {startsAt.toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "long",
            year: "numeric",
          })}
        </div>
        <h2 className="text-2xl font-bold leading-tight text-zinc-100">
          {raceCenter.headline ?? roundName}
        </h2>
        {raceCenter.headline && raceCenter.headline !== roundName && (
          <div className="text-sm text-zinc-400">{roundName}</div>
        )}
      </section>

      {/* === By the Numbers === */}
      <section>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
          By the Numbers
        </h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {winner && (
            <NumberCard
              tag="Race Winner"
              h3={driverName(winner.registration.user)}
              note={raceCenter.winnerNote}
              sub={`${winner.incidents} inc`}
            />
          )}
          {fastest && fastest.bestLapTimeMs != null && (
            <NumberCard
              tag="Fastest Lap"
              h3={driverName(fastest.registration.user)}
              note={raceCenter.fastestLapNote}
              sub={formatMs(fastest.bestLapTimeMs)}
            />
          )}
          {raceCenter.comebackUser && (
            <NumberCard
              tag="Comeback Drive"
              h3={driverName(raceCenter.comebackUser)}
              note={raceCenter.comebackNote}
            />
          )}
          {cleanest && (
            <NumberCard
              tag="Cleanest Race"
              h3={driverName(cleanest.registration.user)}
              note={raceCenter.cleanestNote}
              sub={`${cleanest.incidents} incidents`}
            />
          )}
          <NumberCard
            tag="Yellow Flags"
            h3={raceCenter.yellowFlagCount === 0 ? "Zero cautions" : `${raceCenter.yellowFlagCount} cautions`}
            note={raceCenter.yellowFlagNote}
          />
          <NumberCard
            tag="Conditions"
            h3={raceCenter.trackTempC != null ? `${isWet ? "💧" : "☀️"} ${formatTemp(raceCenter.trackTempC)} track` : `${isWet ? "Wet" : "Dry"}`}
            note={conditionsBody({
              airTempC: raceCenter.airTempC,
              trackTempC: raceCenter.trackTempC,
              skiesText,
              cloudCoverPct: raceCenter.cloudCoverPct,
              precipMm: raceCenter.precipMm,
            })}
          />
        </div>
      </section>

      {/* === Replay video === */}
      {raceCenter.replayBlobUrl && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            2D Telemetry Replay
          </h3>
          <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <video
              controls
              preload="none"
              playsInline
              poster={raceCenter.posterBlobUrl ?? undefined}
              className="block w-full"
            >
              <source src={raceCenter.replayBlobUrl} type="video/mp4" />
            </video>
            {raceCenter.replayCaption && (
              <p className="p-3 text-sm text-zinc-400">{raceCenter.replayCaption}</p>
            )}
          </div>
        </section>
      )}

      {/* === Race Highlights — markdown === */}
      {raceCenter.highlightsMd && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Race Highlights
          </h3>
          <div className="prose prose-invert max-w-none text-zinc-200 [&_strong]:text-zinc-100 [&_p]:my-3">
            <ReactMarkdown>{raceCenter.highlightsMd}</ReactMarkdown>
          </div>
        </section>
      )}

      {/* === Data Views — charts === */}
      {raceCenter.charts.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            Data Views
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {raceCenter.charts.map((c) => (
              <div
                key={c.id}
                className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950/40"
              >
                <div className="border-b border-zinc-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-orange-300">
                  {c.title}
                </div>
                <a href={c.blobUrl} target="_blank" rel="noopener noreferrer" className="block">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={c.blobUrl}
                    alt={c.title}
                    className="block w-full"
                  />
                </a>
                {c.caption && (
                  <p className="px-3 py-2 text-xs leading-relaxed text-zinc-400">{c.caption}</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* === Footer === */}
      <section className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-xs text-zinc-500">
        Race Center curated post-race.{" "}
        {raceCenter.publishedAt && (
          <>Published {raceCenter.publishedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}.</>
        )}{" "}
        Lap times, finishing positions, fastest race lap and incident counts come from the
        CLS round results above &mdash; that&rsquo;s the authoritative source.
        {raceCenter.broadcastUrl && (
          <>
            {" "}Broadcast:{" "}
            <a
              href={raceCenter.broadcastUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-orange-300 underline"
            >
              external link
            </a>.
          </>
        )}
      </section>
    </div>
  );
}

function NumberCard({
  tag,
  h3,
  note,
  sub,
}: {
  tag: string;
  h3: string;
  note: string | null;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-orange-300">{tag}</div>
      <div className="mt-1 text-lg font-semibold leading-tight text-zinc-100">{h3}</div>
      {sub && <div className="text-xs text-zinc-400">{sub}</div>}
      {note && <p className="mt-2 text-sm text-zinc-300">{note}</p>}
    </div>
  );
}

function driverName(u: { firstName: string | null; lastName: string | null; name: string | null }): string {
  const first = u.firstName?.trim() ?? "";
  const last = u.lastName?.trim() ?? "";
  const full = `${first} ${last}`.trim();
  return full || u.name || "—";
}

function formatMs(ms: number): string {
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = (totalSec - min * 60).toFixed(3);
  return min > 0 ? `${min}:${sec.padStart(6, "0")}` : `${sec}s`;
}

function formatTemp(c: number): string {
  return `${c.toFixed(1).replace(/\.0$/, "")} °C`;
}

function conditionsBody(c: {
  airTempC: number | null;
  trackTempC: number | null;
  skiesText: string | null;
  cloudCoverPct: number | null;
  precipMm: number | null;
}): string | null {
  const parts: string[] = [];
  if (c.airTempC != null) parts.push(`Air ${formatTemp(c.airTempC)}`);
  if (c.trackTempC != null) parts.push(`Track ${formatTemp(c.trackTempC)}`);
  if (c.skiesText) parts.push(`Skies ${c.skiesText.toLowerCase()}`);
  if (c.cloudCoverPct != null) parts.push(`${Math.round(c.cloudCoverPct)}% cloud`);
  if (c.precipMm != null && c.precipMm > 0) parts.push(`${c.precipMm.toFixed(1)} mm rain`);
  return parts.length === 0 ? null : parts.join(" · ");
}
