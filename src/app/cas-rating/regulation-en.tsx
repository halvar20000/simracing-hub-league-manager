import Link from "next/link";
import { ExampleBlock, H2, H3, RatingLinks, num, td, th } from "./regulation-de";

/** English version of the CAS Rating regulation (the German one is the original). */

const SPECIAL_CASES_EN: [string, string, string][] = [
  ["DNF / DSQ", "0 place points, clean points still count", "driven"],
  ["DNS", "does not count", "not driven"],
  [
    "Double races (e.g. PCC, SFL, CC)",
    "each race counts on its own",
    "each race counts on its own (a round with 2 races = 2 races)",
  ],
  [
    "IEC (team races)",
    "class position of the car, your own incidents; only if you drove a stint",
    "driven if at least one stint",
  ],
  ["Declined a race", "–", "not driven, but no no-show penalty"],
  [
    "Official withdrawal from the season",
    "–",
    "frozen; the league stops counting once the season ends. Before the first race: the league does not count at all.",
  ],
  [
    "Official CAS stream (stream calendar)",
    "–",
    "counts as driven; not registered: bonus (+1 driven / +1 race)",
  ],
  [
    "Fun League",
    "counts like any race",
    "driven: bonus (+1 driven / +1 race); not driven: does not count – the Fun League is an open league with no duty to race every round",
  ],
  ["Pre-race and other one-off events (e.g. the Advent race)", "does not count", "does not count"],
];

const b = "text-zinc-100";

export function RegulationEn() {
  return (
    <>
      <div>
        <h1 className="text-3xl font-bold text-zinc-100">CAS Rating (CR) – Rules</h1>
        <p className="mt-1 text-zinc-400">
          One number from 0 to 100 for every driver of the CAS Community. It shows how well, how
          cleanly and how regularly someone races with us – across all leagues.
        </p>
      </div>
      <RatingLinks lang="en" />

      <H2>1. Why are we introducing the CAS Rating?</H2>
      <p>
        iRating only measures speed. A community league lives on more than that: on{" "}
        <b className={b}>clean racing</b> and on drivers who <b className={b}>stay for the whole season</b>.
        That is what we want to make visible and reward.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b className={b}>Loyalty counts.</b> If you register and race regularly, you go up. If you
          stop showing up after a few races, you go down. Full grids are better for every driver and
          for the viewers on the stream.
        </li>
        <li>
          <b className={b}>Clean racing counts.</b> Few incidents and no penalties are worth almost
          half the points of a race. A clean midfield driver can be ahead of a fast but wild one.
        </li>
        <li>
          <b className={b}>Fair and open.</b> The calculation is simple and public. Everybody can
          work out their own value – no gut decisions.
        </li>
        <li>
          <b className={b}>Personal feedback.</b> Every driver sees their value, its history and
          what it is made of in their CLS account.
        </li>
      </ul>

      <H2>2. Scope</H2>
      <p>
        The CAS Rating covers all leagues of the CAS Community: GT3 WCT, IEC, Combined Cup, SFL Cup,
        Porsche Community Cup and Fun League. Every driver has <b className={b}>one</b> rating for all
        leagues together. <b className={b}>Only what is recorded in CLS counts</b>: races whose result
        is published in CLS. Pre-race and other one-off events (e.g. the Advent race) are not run in
        CLS and therefore do not count.
      </p>
      <p>
        Each league counts <b className={b}>from the start of its next season</b>. Races from seasons
        already running when the rating is introduced do not count (see section 8).
      </p>

      <H2>3. Calculation</H2>
      <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-center text-xl font-bold text-zinc-100">
        CAS Rating = <span className="text-[#ff6b35]">70 %</span> performance +{" "}
        <span className="text-[#ff6b35]">30 %</span> attendance
      </div>
      <p>
        It is always calculated over the <b className={b}>last 10 races</b>. The result is rounded to
        one decimal.
      </p>

      <H3>3.1 Points per race (max. 100)</H3>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Part</th>
            <th className={`${th} ${num}`}>max.</th>
            <th className={th}>Rule</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>Place</td>
            <td className={`${td} ${num}`}>60</td>
            <td className={td}>Winner 60, last 0, evenly spread in between. DNF and DSQ = 0.</td>
          </tr>
          <tr>
            <td className={td}>Clean</td>
            <td className={`${td} ${num}`}>40</td>
            <td className={td}>40 minus 4 points per incident per 10 laps (not below 0).</td>
          </tr>
          <tr>
            <td className={td}>Penalties</td>
            <td className={`${td} ${num}`}>–</td>
            <td className={td}>
              Steward penalty category 1 / 2 / 3: −5 / −10 / −20 in the race concerned.
              <br />
              No-show without declining: −5.
            </td>
          </tr>
        </tbody>
      </table>
      <p className="text-xs text-zinc-500">
        Example: 20 laps, 4 incidents = 2 per 10 laps = −8 → 32 clean points.
      </p>

      <H3>3.2 Performance</H3>
      <p>Average race points of the last 10 races, in whatever league.</p>

      <H3>3.3 Attendance</H3>
      <p>
        For every league the driver is <b className={b}>currently registered</b> in, the last 10
        races held since registering count: how many of them did they drive? All registered leagues
        are added up. 10 out of 10 = 100 %.
      </p>
      <p>
        Registering for several leagues and racing only now and then gives a low attendance. A
        driver who is not registered anywhere is at 50 %.
      </p>
      <p>
        <b className={b}>Streaming counts as attendance:</b> whoever broadcasts a race on the official
        CAS stream gets that race counted as driven. If they are not registered in that league, it
        counts as an extra race driven (bonus). The CAS stream calendar decides – other streams do
        not count.
      </p>

      <H3>3.4 Start</H3>
      <p>
        At the introduction <b className={b}>every driver starts at 50</b>: missing races up to 10
        count as 50 points for performance and as half driven for attendance. Every real race
        replaces one of them. So a single good race does not take you straight to the top – a win
        without incidents lifts performance from 50 to 55. Each league counts from the start of its
        next season; earlier results are not counted retroactively.
      </p>

      <H2>4. Special cases</H2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Case</th>
            <th className={th}>Performance</th>
            <th className={th}>Attendance</th>
          </tr>
        </thead>
        <tbody>
          {SPECIAL_CASES_EN.map(([c, perf, att]) => (
            <tr key={c}>
              <td className={td}>{c}</td>
              <td className={td}>{perf}</td>
              <td className={td}>{att}</td>
            </tr>
          ))}
          <tr>
            <td className={td}>Later steward decision or result correction</td>
            <td className={td} colSpan={2}>
              The rating is recalculated automatically.
            </td>
          </tr>
        </tbody>
      </table>

      <H2>5. Example</H2>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={th}>Season with 12 races</th>
            <th className={`${th} ${num}`}>Performance</th>
            <th className={`${th} ${num}`}>Attendance</th>
            <th className={`${th} ${num}`}>CAS Rating</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className={td}>A drives all 12, solid</td>
            <td className={`${td} ${num}`}>70</td>
            <td className={`${td} ${num}`}>100 %</td>
            <td className={`${td} ${num} font-bold text-zinc-100`}>79.0</td>
          </tr>
          <tr>
            <td className={td}>B drives the first 5 strongly, then no more</td>
            <td className={`${td} ${num}`}>80</td>
            <td className={`${td} ${num}`}>42 %</td>
            <td className={`${td} ${num} font-bold text-zinc-100`}>68.5</td>
          </tr>
        </tbody>
      </table>

      <H2>6. Where to see it in CLS</H2>
      <p>
        The{" "}
        <Link href="/cas-rating/ranking" className="text-[#ff6b35] hover:underline">
          ranking
        </Link>{" "}
        shows the CAS Rating of every driver. In addition, every driver sees in their CLS account
        (the CR badge at the top right, or{" "}
        <Link href="/rating" className="text-[#ff6b35] hover:underline">
          My CAS Rating
        </Link>
        ):
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          their <b className={b}>CAS Rating card</b> with the current value, performance, attendance
          and the change since the last race,
        </li>
        <li>
          the <b className={b}>history</b> as a curve,
        </li>
        <li>
          the <b className={b}>last 10 races</b> with place, clean and penalty points,
        </li>
        <li>
          their <b className={b}>attendance per league</b>.
        </li>
      </ul>
      <p>The rating is updated after every publication of results and after every steward decision.</p>

      <ExampleBlock lang="en" />

      <H2>7. Use: priority on the waiting list</H2>
      <p>
        When the grid of a season is full, further drivers go on the waiting list. The order of the
        waiting list follows the <b className={b}>CAS Rating – highest rating first</b>. With equal
        ratings the registration date decides.
      </p>
      <ul className="list-disc space-y-1 pl-5">
        <li>
          <b className={b}>Permanent seat:</b> when a seat in the grid becomes free (withdrawal from
          the season), the driver with the highest CAS Rating on the waiting list moves up.
        </li>
        <li>
          <b className={b}>Single race:</b> when a driver declines a race, the free seat for that race
          is offered first to the driver with the highest CAS Rating on the waiting list.
        </li>
        <li>The CAS Rating at the moment the seat becomes free decides.</li>
      </ul>
      <p className="text-xs text-zinc-500">
        So drivers who race regularly and cleanly have a better chance of a seat in a full league.
      </p>

      <H2>8. Entry into force and changes</H2>
      <p>
        There is <b className={b}>no common start date</b>. The CAS Rating starts in each league{" "}
        <b className={b}>with its next new season</b>. From then on that league&apos;s races count for
        performance and attendance. Races from seasons that were already running before the
        introduction do not count.
      </p>
      <p>
        First up is the <b className={b}>SFL Cup with its 9th season (first race on 25 November 2026)</b>.
        The Porsche Community Cup and the GT3 WCT follow with their next seasons, later the Combined
        Cup and the Fun League, and the IEC from its next season. The Fun League has no seasons; when
        its races start to count will be announced beforehand.
      </p>
      <p>
        Until their first counted race every driver is at 50. The CAS Rating is{" "}
        <b className={b}>public from the start</b>.
      </p>
      <p>
        The CAS leadership can adjust weights and rules if they do not work out in practice. Changes
        are announced beforehand. The weights are reviewed after the first full season. Please report
        mistakes in the rating to the admins – they will be corrected and the rating recalculated.
      </p>
      <div className="pt-4">
        <RatingLinks lang="en" />
      </div>
    </>
  );
}
