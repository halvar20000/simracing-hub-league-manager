#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Imports
if (!s.includes("computeTeamClassStandings")) {
  s = s.replace(
    `import { computeDriverStandings } from "@/lib/standings";`,
    `import { computeDriverStandings, computeTeamClassStandings } from "@/lib/standings";`
  );
}

// 2. Pull teamResults onto recentRounds query
if (!s.includes("teamResults: {")) {
  s = s.replace(
    `      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true },
          },
        },
      },
    },
  });`,
    `      raceResults: {
        include: {
          registration: {
            include: { user: true, team: true },
          },
        },
      },
      teamResults: {
        include: {
          team: { select: { name: true } },
          carClass: { select: { shortCode: true, name: true, displayOrder: true } },
        },
        orderBy: [{ classPosition: "asc" }],
      },
    },
  });`
  );
}

// 3. Compute active season team-class leaders (after activeLeader block)
if (!s.includes("const activeClassLeaders")) {
  s = s.replace(
    `  // Latest results across all this league's seasons`,
    `  const activeTeamClasses = activeSeason
    ? await computeTeamClassStandings(prisma, activeSeason.id)
    : [];
  const activeIsTeamEvent = activeTeamClasses.length > 0;
  const activeClassLeaders = activeTeamClasses
    .map((g) => {
      const top = g.teams[0];
      return top
        ? { shortCode: g.carClassShortCode, className: g.carClassName, teamName: top.teamName, points: top.totalPoints }
        : null;
    })
    .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null);

  // Latest results across all this league's seasons`
  );
}

// 4. Replace recentPodiums calculation to support team events
{
  const before = `  const recentPodiums = recentRounds.map((round) => {
    type Agg = {
      registrationId: string;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
      total: number;
      anyClassified: boolean;
    };
    const m = new Map<string, Agg>();
    for (const r of round.raceResults) {
      let a = m.get(r.registrationId);
      if (!a) {
        a = {
          registrationId: r.registrationId,
          firstName: r.registration.user.firstName,
          lastName: r.registration.user.lastName,
          countryCode: r.registration.user.countryCode,
          total: 0,
          anyClassified: false,
        };
        m.set(r.registrationId, a);
      }
      a.total +=
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints +
        (r.correctionPoints ?? 0);
      if (r.finishStatus === "CLASSIFIED") a.anyClassified = true;
    }
    const top3 = [...m.values()]
      .filter((a) => a.anyClassified)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    return { round, top3 };
  });`;

  const after = `  const recentPodiums = recentRounds.map((round) => {
    // Team-event round → class winners (top 1 per car class)
    if (round.teamResults && round.teamResults.length > 0) {
      const byClass = new Map<string, { className: string; shortCode: string; order: number; row: { teamName: string; classPosition: number | null } | null }>();
      for (const tr of round.teamResults) {
        const id = tr.carClass?.shortCode ?? "—";
        if (!byClass.has(id)) {
          byClass.set(id, {
            className: tr.carClass?.name ?? "Class",
            shortCode: tr.carClass?.shortCode ?? "—",
            order: tr.carClass?.displayOrder ?? 999,
            row: null,
          });
        }
        const slot = byClass.get(id)!;
        if ((tr.classPosition ?? 999) === 1) {
          slot.row = { teamName: tr.team.name, classPosition: tr.classPosition };
        }
      }
      const classWinners = [...byClass.values()]
        .filter((b) => b.row != null)
        .sort((a, b) => a.order - b.order)
        .map((b) => ({ shortCode: b.shortCode, teamName: b.row!.teamName }));
      return { round, isTeamEvent: true as const, classWinners, top3: [] as Array<{ registrationId: string; firstName: string | null; lastName: string | null; countryCode: string | null }> };
    }

    // Driver-event round → top 3 drivers (existing behavior)
    type Agg = {
      registrationId: string;
      firstName: string | null;
      lastName: string | null;
      countryCode: string | null;
      total: number;
      anyClassified: boolean;
    };
    const m = new Map<string, Agg>();
    for (const r of round.raceResults) {
      let a = m.get(r.registrationId);
      if (!a) {
        a = {
          registrationId: r.registrationId,
          firstName: r.registration.user.firstName,
          lastName: r.registration.user.lastName,
          countryCode: r.registration.user.countryCode,
          total: 0,
          anyClassified: false,
        };
        m.set(r.registrationId, a);
      }
      a.total +=
        r.rawPointsAwarded +
        r.participationPointsAwarded -
        r.manualPenaltyPoints +
        (r.correctionPoints ?? 0);
      if (r.finishStatus === "CLASSIFIED") a.anyClassified = true;
    }
    const top3 = [...m.values()]
      .filter((a) => a.anyClassified)
      .sort((a, b) => b.total - a.total)
      .slice(0, 3);
    return { round, isTeamEvent: false as const, classWinners: [] as Array<{ shortCode: string; teamName: string }>, top3 };
  });`;

  if (!s.includes('isTeamEvent: true as const')) {
    if (!s.includes(before)) { console.error("recentPodiums anchor not found."); process.exit(1); }
    s = s.replace(before, after);
  }
}

// 5. Active leader card: render class leaders for IEC seasons
{
  const before = `      {/* Active season leader card if no upcoming round */}
      {activeSeason && !activeNextRound && activeLeader && (
        <Link
          href={\`/leagues/\${league.slug}/seasons/\${activeSeason.id}/standings\`}
          className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Current leader · {activeSeason.name} {activeSeason.year}
          </div>
          <div className="mt-1 font-display text-lg font-bold text-zinc-100">
            <CountryFlag code={activeLeader.countryCode} />
            {activeLeader.firstName} {activeLeader.lastName}
          </div>
          <div className="text-xs text-zinc-400">
            {activeLeader.points} pts · open standings →
          </div>
        </Link>
      )}`;

  const after = `      {/* Active season class leaders (team event) */}
      {activeSeason && activeIsTeamEvent && activeClassLeaders.length > 0 && (
        <Link
          href={\`/leagues/\${league.slug}/seasons/\${activeSeason.id}/standings\`}
          className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Class leaders · {activeSeason.name} {activeSeason.year}
          </div>
          <ul className="mt-1.5 space-y-1">
            {activeClassLeaders.map((cl) => (
              <li key={cl.shortCode} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex items-baseline gap-1.5">
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">{cl.shortCode}</span>
                  <span className="font-medium text-zinc-100">{cl.teamName}</span>
                </span>
                <span className="text-xs text-zinc-400 tabular-nums">{cl.points} pts</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 text-xs text-zinc-500">open standings →</div>
        </Link>
      )}

      {/* Active season driver leader card if no upcoming round (non-team events) */}
      {activeSeason && !activeIsTeamEvent && !activeNextRound && activeLeader && (
        <Link
          href={\`/leagues/\${league.slug}/seasons/\${activeSeason.id}/standings\`}
          className="block rounded-lg border border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-950 to-zinc-900 p-4 transition-colors hover:border-[#ff6b35]"
        >
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Current leader · {activeSeason.name} {activeSeason.year}
          </div>
          <div className="mt-1 font-display text-lg font-bold text-zinc-100">
            <CountryFlag code={activeLeader.countryCode} />
            {activeLeader.firstName} {activeLeader.lastName}
          </div>
          <div className="text-xs text-zinc-400">
            {activeLeader.points} pts · open standings →
          </div>
        </Link>
      )}`;

  if (!s.includes("Class leaders · ")) {
    if (!s.includes(before)) { console.error("Active leader card anchor not found."); process.exit(1); }
    s = s.replace(before, after);
  }
}

// 6. Latest results strip: render class winners for team events
{
  const before = `                <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  {top3.map((d, i) => (
                    <span
                      key={d.registrationId}
                      className="flex items-center gap-1"
                    >
                      <span className="text-zinc-500">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                      </span>
                      <CountryFlag
                        code={d.countryCode}
                        className="text-[12px] leading-none"
                      />
                      <span className="text-zinc-200">
                        {d.firstName} {d.lastName}
                      </span>
                    </span>
                  ))}
                </span>`;

  const after = `                <span className="ml-auto flex flex-wrap items-center gap-2 text-[11px]">
                  {(round as any).isTeamEvent
                    ? (round as any).classWinners?.map((cw: { shortCode: string; teamName: string }) => (
                        <span key={cw.shortCode} className="flex items-center gap-1">
                          <span className="rounded bg-zinc-800 px-1 py-0 text-[9px] font-bold tracking-wider text-zinc-300">
                            {cw.shortCode}
                          </span>
                          <span className="text-zinc-200">{cw.teamName}</span>
                        </span>
                      ))
                    : top3.map((d, i) => (
                        <span
                          key={d.registrationId}
                          className="flex items-center gap-1"
                        >
                          <span className="text-zinc-500">
                            {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                          </span>
                          <CountryFlag
                            code={d.countryCode}
                            className="text-[12px] leading-none"
                          />
                          <span className="text-zinc-200">
                            {d.firstName} {d.lastName}
                          </span>
                        </span>
                      ))}
                </span>`;

  if (!s.includes("classWinners?.map")) {
    if (!s.includes(before)) { console.error("Latest results podium anchor not found."); process.exit(1); }
    s = s.replace(before, after);
  }
}

// 7. Update the .map destructuring to include the new fields.
//    From: {recentPodiums.map(({ round, top3 }) =>
//    To:   {recentPodiums.map((entry) => { const round = entry.round; const top3 = entry.top3 ?? []; ...
{
  const before = `            {recentPodiums.map(({ round, top3 }) => (`;
  const after = `            {recentPodiums.map((entry) => { const round = entry.round; const top3 = entry.top3; return (`;
  if (s.includes(before)) {
    s = s.replace(before, after);
    // Close the new function body
    s = s.replace(
      `              </Link>
            ))}
          </div>
        </section>
      )}
      {/* Seasons grid */}`,
      `              </Link>
            ); })}
          </div>
        </section>
      )}
      {/* Seasons grid */}`
    );
  }
}

// 8. Hall of Fame: when a championed season has team data, show class champions
//    Replace the existing single-driver champion render to detect via async
//    transformation. We'll switch to using teamClasses from a per-season fetch.
{
  // Make championedSeasons fetch include team classes too.
  const cBefore = `  const champions = await Promise.all(
    completedSeasonsForHallOfFame.map(async (s) => {
      try {
        const standings = await computeDriverStandings(prisma, s.id);
        const top = standings[0];
        return { season: s, champion: top ?? null };
      } catch {
        return { season: s, champion: null };
      }
    })
  );`;
  const cAfter = `  const champions = await Promise.all(
    completedSeasonsForHallOfFame.map(async (s) => {
      try {
        const teamClasses = await computeTeamClassStandings(prisma, s.id);
        if (teamClasses.length > 0) {
          const classChampions = teamClasses
            .map((g) => {
              const top = g.teams[0];
              return top ? { shortCode: g.carClassShortCode, className: g.carClassName, teamName: top.teamName, points: top.totalPoints } : null;
            })
            .filter((x): x is { shortCode: string; className: string; teamName: string; points: number } => x != null);
          return { season: s, champion: null as null, classChampions };
        }
        const standings = await computeDriverStandings(prisma, s.id);
        const top = standings[0];
        return { season: s, champion: top ?? null, classChampions: [] as Array<{ shortCode: string; className: string; teamName: string; points: number }> };
      } catch {
        return { season: s, champion: null as null, classChampions: [] as Array<{ shortCode: string; className: string; teamName: string; points: number }> };
      }
    })
  );`;
  if (!s.includes("classChampions: []")) {
    if (!s.includes(cBefore)) { console.error("Champions fetch anchor not found."); process.exit(1); }
    s = s.replace(cBefore, cAfter);
  }
}

// 9. championedSeasons filter — accept either driver or class champions
s = s.replace(
  `  const championedSeasons = champions.filter((c) => c.champion);`,
  `  const championedSeasons = champions.filter((c) => c.champion || (c.classChampions && c.classChampions.length > 0));`
);

// 10. Hall of Fame card: render class champions when available
{
  const hofBefore = `            {championedSeasons.map(({ season, champion }) => (
              <Link
                key={season.id}
                href={\`/leagues/\${league.slug}/seasons/\${season.id}/standings\`}
                className="block rounded-lg border border-yellow-700/30 bg-gradient-to-br from-yellow-950/30 via-zinc-900 to-zinc-950 p-3 transition-colors hover:border-yellow-500/60"
              >
                <div className="text-[9px] font-semibold uppercase tracking-widest text-yellow-300/80">
                  Champion · {season.name} {season.year}
                </div>
                <div className="mt-1 font-display text-base font-bold text-zinc-100">
                  <CountryFlag code={champion!.countryCode} />
                  {champion!.driverFirstName} {champion!.driverLastName}
                </div>
                <div className="text-xs text-zinc-400">
                  {champion!.combinedTotal} pts
                  {champion!.teamName ? \` · \${champion!.teamName}\` : ""}
                </div>
              </Link>
            ))}`;

  const hofAfter = `            {championedSeasons.map((entry) => (
              <Link
                key={entry.season.id}
                href={\`/leagues/\${league.slug}/seasons/\${entry.season.id}/standings\`}
                className="block rounded-lg border border-yellow-700/30 bg-gradient-to-br from-yellow-950/30 via-zinc-900 to-zinc-950 p-3 transition-colors hover:border-yellow-500/60"
              >
                <div className="text-[9px] font-semibold uppercase tracking-widest text-yellow-300/80">
                  {entry.classChampions && entry.classChampions.length > 0 ? "Class champions" : "Champion"} · {entry.season.name} {entry.season.year}
                </div>
                {entry.classChampions && entry.classChampions.length > 0 ? (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {entry.classChampions.map((cc) => (
                      <li key={cc.shortCode} className="flex items-baseline justify-between gap-2">
                        <span className="flex items-baseline gap-1.5">
                          <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold tracking-wider text-zinc-300">{cc.shortCode}</span>
                          <span className="font-medium text-zinc-100">{cc.teamName}</span>
                        </span>
                        <span className="text-xs text-zinc-400 tabular-nums">{cc.points} pts</span>
                      </li>
                    ))}
                  </ul>
                ) : entry.champion ? (
                  <>
                    <div className="mt-1 font-display text-base font-bold text-zinc-100">
                      <CountryFlag code={entry.champion.countryCode} />
                      {entry.champion.driverFirstName} {entry.champion.driverLastName}
                    </div>
                    <div className="text-xs text-zinc-400">
                      {entry.champion.combinedTotal} pts
                      {entry.champion.teamName ? \` · \${entry.champion.teamName}\` : ""}
                    </div>
                  </>
                ) : null}
              </Link>
            ))}`;

  if (!s.includes('Class champions ·')) {
    if (!s.includes(hofBefore)) { console.error("Hall of Fame anchor not found."); process.exit(1); }
    s = s.replace(hofBefore, hofAfter);
  }
}

fs.writeFileSync(FILE, s);
console.log("League page: IEC team-only views wired (active class leaders, latest class winners, class champions in HoF).");
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "League page: for team-event seasons (IEC), show class leaders / class winners / class champions instead of driver versions"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
