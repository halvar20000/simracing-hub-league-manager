import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { liveSeasonWhere } from "@/lib/season-visibility";
import { StreamerSelect } from "@/components/StreamerSelect";
import {
  STREAM_KEY_PREFIX,
  STREAM_LEAGUES,
  STREAMERS,
  buildStreamCalendar,
  type StreamRace,
  type StreamWeek,
} from "@/lib/stream-calendar";

export const metadata: Metadata = { title: "Stream calendar" };
export const dynamic = "force-dynamic";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dayLabel(date: string): string {
  const [, month, day] = date.split("-");
  const weekday = DAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return `${weekday} ${day}.${month}.`;
}

export default async function AdminStreamCalendarPage() {
  await requireAdmin();

  const [rows, settings] = await Promise.all([
    prisma.round.findMany({
      where: {
        season: {
          ...liveSeasonWhere,
          status: { not: "COMPLETED" },
          league: {
            ...liveSeasonWhere.league,
            slug: { in: STREAM_LEAGUES.map((l) => l.slug) },
          },
        },
      },
      select: {
        id: true,
        seasonId: true,
        roundNumber: true,
        name: true,
        track: true,
        startsAt: true,
        season: { select: { league: { select: { slug: true } } } },
      },
    }),
    prisma.appSetting.findMany({
      where: { key: { startsWith: STREAM_KEY_PREFIX } },
      select: { key: true, value: true },
    }),
  ]);

  const calendar = buildStreamCalendar(
    rows.map((r) => ({
      id: r.id,
      seasonId: r.seasonId,
      leagueSlug: r.season.league.slug,
      roundNumber: r.roundNumber,
      name: r.name,
      track: r.track,
      startsAt: r.startsAt,
    })),
    new Map(settings.map((s) => [s.key, s.value]))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stream calendar</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Who streams which race. A change in a dropdown is saved immediately
          and the counts update. Only admins can see this page.
        </p>
      </div>

      {calendar.openCount > 0 && (
        <p className="rounded border border-amber-800 bg-amber-950/30 px-3 py-2 text-sm text-amber-200">
          {calendar.openCount} of {calendar.raceCount} races have no streamer
          yet.
        </p>
      )}

      <section className="overflow-x-auto">
        <table className="text-sm tabular-nums">
          <thead className="bg-zinc-900 text-zinc-400">
            <tr>
              <th className="px-3 py-2 text-left">Streams</th>
              {calendar.summary.map((s) => (
                <th key={s.name} className="px-4 py-2 text-center">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STREAM_LEAGUES.map((l) => (
              <SummaryRow
                key={l.slug}
                label={l.name}
                values={calendar.summary.map((s) => s.perLeague[l.slug])}
              />
            ))}
            <SummaryRow
              strong
              label="Total"
              values={calendar.summary.map((s) => s.total)}
            />
            <SummaryRow
              label="of which in CLS (date confirmed)"
              values={calendar.summary.map((s) => s.confirmed)}
            />
            <SummaryRow
              label="Average per week"
              values={calendar.summary.map((s) => s.perWeek.toFixed(2))}
            />
            <SummaryRow
              label="Most in one week"
              values={calendar.summary.map((s) => s.maxInWeek)}
            />
            <SummaryRow
              label="Weeks with 2+ streams"
              values={calendar.summary.map((s) => s.weeksWithTwoPlus)}
            />
            <SummaryRow
              label="Weeks without a stream"
              values={calendar.summary.map((s) => s.weeksWithNone)}
            />
          </tbody>
        </table>
      </section>

      <section className="overflow-x-auto">
        <table className="w-full min-w-[56rem] text-sm tabular-nums">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Week</th>
              {STREAM_LEAGUES.map((l) => (
                <th key={l.slug} className="px-2 py-2">
                  {l.name}
                </th>
              ))}
              {STREAMERS.map((s) => (
                <th key={s} className="px-2 py-2 text-center">
                  {s}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {calendar.weeks.map((w) => (
              <WeekRow key={w.monday} week={w} />
            ))}
          </tbody>
        </table>
      </section>

      <p className="text-xs text-zinc-500">
        Italic entries are not in CLS yet: their date is assumed from the
        league&apos;s rhythm. They disappear once the new season has a round on
        or after that date; a round on the same date keeps the streamer.
      </p>
    </div>
  );
}

function SummaryRow({
  label,
  values,
  strong,
}: {
  label: string;
  values: (string | number)[];
  strong?: boolean;
}) {
  return (
    <tr className={`border-t border-zinc-800 ${strong ? "font-bold" : ""}`}>
      <td className="px-3 py-1.5 text-zinc-300">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="px-4 py-1.5 text-center">
          {v}
        </td>
      ))}
    </tr>
  );
}

function WeekRow({ week }: { week: StreamWeek }) {
  return (
    <tr
      className={`border-t border-zinc-800 align-top hover:bg-zinc-900/60 ${
        week.isPast ? "opacity-50" : ""
      }`}
    >
      <td className="whitespace-nowrap px-3 py-2">
        <div className="font-medium">KW {week.isoWeek}</div>
        <div className="text-xs text-zinc-500">{dayLabel(week.monday)}</div>
        {week.iracingWeek13 && (
          <div className="text-xs text-amber-300">iRacing week 13</div>
        )}
      </td>
      {STREAM_LEAGUES.map((l) => (
        <td key={l.slug} className="px-2 py-2">
          <div className="space-y-2">
            {week.races
              .filter((r) => r.leagueSlug === l.slug)
              .map((r) => (
                <RaceCell key={r.key} race={r} league={l.name} />
              ))}
          </div>
        </td>
      ))}
      {STREAMERS.map((s) => (
        <td
          key={s}
          className={`px-2 py-2 text-center font-bold ${
            week.counts[s] >= 3
              ? "text-red-400"
              : week.counts[s] === 0
                ? "text-zinc-600"
                : ""
          }`}
        >
          {week.counts[s]}
        </td>
      ))}
    </tr>
  );
}

function RaceCell({ race, league }: { race: StreamRace; league: string }) {
  const when = `${dayLabel(race.date)} ${race.time}`;
  return (
    <div className="w-32">
      <div
        className={`text-xs ${race.planned ? "italic text-zinc-500" : "text-zinc-300"}`}
      >
        {when}
      </div>
      <div
        className={`mb-1 truncate text-[11px] text-zinc-500 ${race.planned ? "italic" : ""}`}
        title={race.title}
      >
        {race.href ? (
          <Link href={race.href} className="hover:text-zinc-300 hover:underline">
            {race.title}
          </Link>
        ) : (
          race.title
        )}
      </div>
      <StreamerSelect
        key={`${race.key}:${race.streamer}`}
        streamKey={race.key}
        value={race.streamer}
        label={`${league}, ${when}`}
      />
    </div>
  );
}
