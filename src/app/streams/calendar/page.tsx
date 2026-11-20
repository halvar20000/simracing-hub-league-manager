import Link from "next/link";
import type { Metadata } from "next";
import { pageMetadata } from "@/lib/og";
import { loadStreamCalendar } from "@/lib/stream-calendar-data";
import {
  STREAM_LEAGUES,
  STREAM_OPEN,
  streamDayLabel,
  streamerTwitchUrl,
  type StreamRace,
  type StreamWeek,
} from "@/lib/stream-calendar";

export const metadata: Metadata = pageMetadata({
  title: "Stream Calendar",
  description:
    "Which CAS league race is streamed live, and on which Twitch channel — week by week.",
  url: "/streams/calendar",
});
export const dynamic = "force-dynamic";

export default async function StreamCalendarPage() {
  const calendar = await loadStreamCalendar();
  const weeks = calendar.weeks.filter((w) => !w.isPast);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Stream Calendar</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Which race is streamed live and on which Twitch channel. Past streams
          are on{" "}
          <Link href="/streams" className="underline hover:text-zinc-200">
            Race Streams
          </Link>
          .
        </p>
      </div>

      {weeks.length === 0 ? (
        <p className="text-sm text-zinc-500">No streamed races planned.</p>
      ) : (
        <section className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm tabular-nums">
            <thead className="bg-zinc-900 text-left text-zinc-400">
              <tr>
                <th className="px-3 py-2">Week</th>
                {STREAM_LEAGUES.map((l) => (
                  <th key={l.slug} className="px-2 py-2">
                    {l.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((w) => (
                <WeekRow key={w.monday} week={w} />
              ))}
            </tbody>
          </table>
        </section>
      )}

      <p className="text-xs text-zinc-500">
        Italic entries are not in CLS yet: their date is assumed from the
        league&apos;s rhythm and can still change. Times are CET/CEST.
      </p>
    </div>
  );
}

function WeekRow({ week }: { week: StreamWeek }) {
  return (
    <tr className="border-t border-zinc-800 align-top hover:bg-zinc-900/60">
      <td className="whitespace-nowrap px-3 py-2">
        <div className="font-medium">KW {week.isoWeek}</div>
        <div className="text-xs text-zinc-500">{streamDayLabel(week.monday)}</div>
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
                <RaceCell key={r.key} race={r} />
              ))}
          </div>
        </td>
      ))}
    </tr>
  );
}

function RaceCell({ race }: { race: StreamRace }) {
  const twitch = streamerTwitchUrl(race.streamer);
  return (
    <div className="w-32">
      <div
        className={`text-xs ${race.planned ? "italic text-zinc-500" : "text-zinc-300"}`}
      >
        {streamDayLabel(race.date)} {race.time}
      </div>
      <div
        className={`mb-1 truncate text-[11px] text-zinc-500 ${race.planned ? "italic" : ""}`}
        title={race.title}
      >
        {race.publicHref ? (
          <Link href={race.publicHref} className="hover:text-zinc-300 hover:underline">
            {race.title}
          </Link>
        ) : (
          race.title
        )}
      </div>
      {twitch ? (
        <a
          href={twitch}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block rounded bg-[#9146ff]/20 px-2 py-0.5 text-xs font-semibold text-[#c9a7ff] hover:bg-[#9146ff]/35"
        >
          {race.streamer}
        </a>
      ) : (
        <span className="inline-block rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-500">
          {race.streamer === STREAM_OPEN ? "Open" : race.streamer}
        </span>
      )}
    </div>
  );
}
