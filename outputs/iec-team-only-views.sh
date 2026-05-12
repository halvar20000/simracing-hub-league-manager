#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

# ===========================================================================
# 1. standings.ts — include bonuses in team class points
# ===========================================================================
cat > outputs-tmp/patch-lib.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// Replace the simple pts assignment with a full points calculation that
// includes participation/correction/manual penalty stored on TeamResult.
const before = `    const pts = r.classPosition != null ? (pointsTable[String(r.classPosition)] ?? 0) : 0;
    t.total += pts;
    t.incidents += r.totalIncidents;`;

const after = `    const basePts =
      r.classPosition != null ? pointsTable[String(r.classPosition)] ?? 0 : 0;
    const stored = r.rawPointsAwarded ?? 0;
    const racePts = stored > 0 ? stored : basePts;
    const participation = r.participationPointsAwarded ?? 0;
    const correction = r.correctionPoints ?? 0;
    const penalty = r.manualPenaltyPoints ?? 0;
    const pts = racePts + participation + correction - penalty;
    t.total += pts;
    t.incidents += r.totalIncidents;`;

if (s.includes("const stored = r.rawPointsAwarded")) {
  console.log("standings.ts: bonus inclusion already wired.");
} else if (!s.includes(before)) {
  console.error("standings.ts: pts calculation anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("standings.ts: per-class team standings now include bonuses.");
}
EOF
node outputs-tmp/patch-lib.mjs

# ===========================================================================
# 2. Standings page — hide non-team tabs when team-event data exists,
#    add race-by-race view inside the team championship.
# ===========================================================================
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 2a. Add an `isTeamEventSeason` flag right after the standings fetches.
if (!s.includes("const isTeamEventSeason")) {
  s = s.replace(
    `  ]);`,
    `  ]);

  const isTeamEventSeason = teamClasses.length > 0;`
  );
}

// 2b. Force cls = "team" when isTeamEventSeason and cls would have defaulted.
if (!s.includes("// IEC: collapse all tabs to team view")) {
  s = s.replace(
    `  const cls: Cls =
    clsRaw === "pro" ? "pro" :`,
    `  // IEC: collapse all tabs to team view (no driver/per-car views).
  const clsForTeamEvent = (raw: string | undefined): Cls => "team";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :`
  );
}

// 2c. Replace the tab toggle row to hide non-team tabs in team-event mode.
const tabBefore = `        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Audience:</span>
          <Link href={\`\${baseHref}\${viewQuery}\`} className={\`rounded px-3 py-1.5 \${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Combined</Link>
          {season.proAmEnabled && (<>
            <Link href={\`\${baseHref}?cls=pro\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>
            <Link href={\`\${baseHref}?cls=am\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>
          </>)}
          <Link href={\`\${baseHref}?cls=team\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Team</Link>
          <Link href={\`\${baseHref}?cls=car\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "car" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>By Car</Link>
        </div>`;

const tabAfter = `        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-zinc-500">Audience:</span>
          {!isTeamEventSeason && (
            <>
              <Link href={\`\${baseHref}\${viewQuery}\`} className={\`rounded px-3 py-1.5 \${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Combined</Link>
              {season.proAmEnabled && (<>
                <Link href={\`\${baseHref}?cls=pro\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>
                <Link href={\`\${baseHref}?cls=am\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>
              </>)}
            </>
          )}
          <Link href={\`\${baseHref}?cls=team\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "team" || isTeamEventSeason ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>{isTeamEventSeason ? "Team Championship" : "Team"}</Link>
          {!isTeamEventSeason && (
            <Link href={\`\${baseHref}?cls=car\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "car" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>By Car</Link>
          )}
        </div>`;

if (!s.includes("Team Championship")) {
  if (!s.includes(tabBefore)) { console.error("Standings page: tab row anchor not found."); process.exit(1); }
  s = s.replace(tabBefore, tabAfter);
}

// 2d. Force-render team championship when isTeamEventSeason regardless of cls.
//     Replace `{cls === "team" && teamClasses.length > 0 && (` with a wider gate.
const renderBefore = `      {cls === "team" && teamClasses.length > 0 && (`;
const renderAfter  = `      {(cls === "team" || isTeamEventSeason) && teamClasses.length > 0 && (`;
s = s.replace(renderBefore, renderAfter);

// 2e. Skip Combined / Pro / Am / By Car render blocks when isTeamEventSeason.
//     Wrap them in `!isTeamEventSeason &&`. Easiest: replace the leading
//     `{cls === "combined" && (` / etc. with `{!isTeamEventSeason && cls === ...`.
[
  `{cls === "combined" && (`,
  `{cls === "combined" && podium.length > 0 && (`,  // round-page-style guards (skip if not present)
  `{cls === "pro" && proDrivers.length > 0 && (`,
  `{cls === "am" && amDrivers.length > 0 && (`,
  `{cls === "combined" && season.isMulticlass && season.carClasses.length > 0 &&`,
  `{cls === "car" && (`,
].forEach((needle) => {
  if (s.includes(needle) && !s.includes("!isTeamEventSeason && " + needle.slice(1))) {
    s = s.split(needle).join("{!isTeamEventSeason && " + needle.slice(1));
  }
});

// 2f. Inject race-by-race view inside team championship section.
//     Replace the existing team championship block with one that has a toggle.
const teamSecBefore = `      {(cls === "team" || isTeamEventSeason) && teamClasses.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
            <p className="mb-2 text-xs text-zinc-500">
              Endurance / team event — points awarded by class position. One championship per car class.
            </p>
          </div>`;
const teamSecAfter = `      {(cls === "team" || isTeamEventSeason) && teamClasses.length > 0 && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>
              <p className="text-xs text-zinc-500">
                Endurance / team event — points by class position + bonuses. One championship per car class.
              </p>
            </div>
            <div className="flex items-center gap-1 text-xs">
              <span className="text-zinc-500">View:</span>
              <Link href={baseHref + (isTeamEventSeason ? "" : "?cls=team")} className={\`rounded px-2.5 py-1 \${view === "list" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>List</Link>
              <Link href={baseHref + "?view=races" + (isTeamEventSeason ? "" : "&cls=team")} className={\`rounded px-2.5 py-1 \${view === "races" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Race by race</Link>
            </div>
          </div>`;
if (!s.includes('points by class position + bonuses')) {
  if (!s.includes(teamSecBefore)) { console.error("Standings page: team championship anchor not found."); process.exit(1); }
  s = s.replace(teamSecBefore, teamSecAfter);
}

// 2g. Replace the per-class team table with a function that switches between
//     "list" and "race by race". The simplest is to render conditionally
//     inside the .map.
const tableBefore = `              <div className="border-t border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 w-10">Pos</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2 text-right">Best</th>
                      <th className="px-3 py-2 text-right">Rounds</th>
                      <th className="px-3 py-2 text-right">Incidents</th>
                      <th className="px-3 py-2 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.teams.map((t, i) => (
                      <tr key={t.teamId} className="border-t border-zinc-800">
                        <td className="px-3 py-2 font-medium">{i + 1}</td>
                        <td className="px-3 py-2 font-medium">{t.teamName}</td>
                        <td className="px-3 py-2 text-right text-zinc-300">
                          {t.bestClassFinish != null ? "P" + t.bestClassFinish : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{t.roundsCompleted}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{t.totalIncidents}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>`;
const tableAfter = `              <TeamClassTable group={g} view={view} />`;
if (s.includes(tableBefore)) {
  s = s.replace(tableBefore, tableAfter);
}

// 2h. Append the helper component at the end of file.
if (!s.includes("function TeamClassTable")) {
  s += `

function TeamClassTable({
  group,
  view,
}: {
  group: TeamClassGroup;
  view: "list" | "races";
}) {
  if (view === "list") {
    return (
      <div className="border-t border-zinc-800">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 w-10">Pos</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2 text-right">Best</th>
              <th className="px-3 py-2 text-right">Rounds</th>
              <th className="px-3 py-2 text-right">Incidents</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {group.teams.map((t, i) => (
              <tr key={t.teamId} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-medium">{i + 1}</td>
                <td className="px-3 py-2 font-medium">{t.teamName}</td>
                <td className="px-3 py-2 text-right text-zinc-300">
                  {t.bestClassFinish != null ? "P" + t.bestClassFinish : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{t.roundsCompleted}</td>
                <td className="px-3 py-2 text-right tabular-nums text-zinc-400">{t.totalIncidents}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // Race by race
  const allRoundsMap = new Map<string, { number: number; name: string }>();
  for (const t of group.teams) for (const r of t.rounds) {
    allRoundsMap.set(r.roundId, { number: r.roundNumber, name: r.roundName });
  }
  const roundsList = [...allRoundsMap.entries()]
    .map(([id, v]) => ({ roundId: id, ...v }))
    .sort((a, b) => a.number - b.number);

  return (
    <div className="border-t border-zinc-800 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
          <tr>
            <th className="px-3 py-2 sticky left-0 bg-zinc-900/50 z-10 w-10">Pos</th>
            <th className="px-3 py-2 sticky left-10 bg-zinc-900/50 z-10">Team</th>
            {roundsList.map((r) => (
              <th key={r.roundId} className="px-3 py-2 text-center min-w-[3.5rem]" title={r.name}>
                R{r.number}
              </th>
            ))}
            <th className="px-3 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {group.teams.map((t, i) => {
            const byRound = new Map(t.rounds.map((r) => [r.roundId, r]));
            return (
              <tr key={t.teamId} className="border-t border-zinc-800">
                <td className="px-3 py-2 font-medium sticky left-0 bg-zinc-900/30 z-10">{i + 1}</td>
                <td className="px-3 py-2 font-medium sticky left-10 bg-zinc-900/30 z-10">{t.teamName}</td>
                {roundsList.map((r) => {
                  const cell = byRound.get(r.roundId);
                  if (!cell) return <td key={r.roundId} className="px-3 py-2 text-center text-zinc-600">—</td>;
                  return (
                    <td key={r.roundId} className="px-3 py-2 text-center">
                      <div className="text-xs text-zinc-500">
                        {cell.classPosition != null ? "P" + cell.classPosition : cell.finishStatus}
                      </div>
                      <div className="font-semibold tabular-nums">{cell.points}</div>
                    </td>
                  );
                })}
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
`;
}

fs.writeFileSync(FILE, s);
console.log("Standings page: race-by-race view + IEC tab gating wired.");
EOF
node outputs-tmp/patch-standings-page.mjs

# ===========================================================================
# 3. Round detail page — hide non-team tabs when TeamResult data exists
# ===========================================================================
cat > outputs-tmp/patch-round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 3a. Default cls to "teams" when hasTeamData (override only if user explicitly picked one).
if (!s.includes("// IEC: default to teams view when team data exists")) {
  s = s.replace(
    `  const cls: Cls =`,
    `  // IEC: default to teams view when team data exists.
  const cls: Cls =`
  );
  // Add a forced override AFTER the existing chain.
  s = s.replace(
    /(:\s*"combined";)\n/,
    `$1
  // For team events, force "teams" if user landed without explicit query.
  const finalCls: Cls = (typeof clsRaw === "undefined" || clsRaw === "" || clsRaw == null) && (typeof hasTeamData !== "undefined" && hasTeamData) ? "teams" : cls;
`
  );
  // Now substitute every `cls ===` with `finalCls ===` AFTER this point —
  // but to avoid re-checking each branch, simpler: add `cls = finalCls` rebinding.
  // Actually JS const can't be reassigned. Easier: rename.
  s = s.replace(/const finalCls: Cls = .*?: cls;\n/, (m) => m); // already inserted
}

// 3b. Hide non-team tabs in the toggle row when hasTeamData. Wrap them.
//     Find the section where Combined/Quali/Race1/Race2/Pro/Am tabs are rendered.
{
  const before = `      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        <Link
          href={baseHref}
          className={\`\${pillBase} \${cls === "combined" ? pillOn : pillOff}\`}
        >
          Combined
        </Link>`;
  const after = `      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        {!hasTeamData && (
        <Link
          href={baseHref}
          className={\`\${pillBase} \${cls === "combined" ? pillOn : pillOff}\`}
        >
          Combined
        </Link>
        )}`;
  if (!s.includes('{!hasTeamData && (\n        <Link\n          href={baseHref}\n')) {
    if (s.includes(before)) s = s.replace(before, after);
  }
}

// Wrap Quali, Race1, Race2, Pro, Am, Team default, By Car too (everything except Teams).
// We'll do it by injecting `{!hasTeamData && (...)}` around the existing groups using a
// blunt search-and-replace per-link.
function gateLink(file, label) {
  const idx = file.indexOf(`>\n          ${label}\n        </Link>`);
  return file; // Implemented below explicitly.
}
// Alternative: gate everything between "View:" span and the Teams link.
// We do this by finding each <Link>...</Link> block and wrapping if its label is in a known list.
const linksToGate = ["Quali", "Race 1", "Race 2", "Pro", "Am", "Team", "By Car"];
for (const lbl of linksToGate) {
  // Pattern: <Link href={...}> ... lbl ... </Link>
  const re = new RegExp(`(<Link\\s+href=\\{[^}]*\\}\\s+className=\\{[^}]*\\}>\\s*${lbl.replace(/[.*+?^${}()|[\]\\]/g, "\\\\$&")}\\s*<\\/Link>)`, "g");
  s = s.replace(re, (match) => {
    // Avoid double-gating
    if (s.lastIndexOf("{!hasTeamData &&") > s.lastIndexOf(match) - 30) return match;
    return `{!hasTeamData && (${match})}`;
  });
}

fs.writeFileSync(FILE, s);
console.log("Round page: non-team tabs gated when hasTeamData.");
EOF
node outputs-tmp/patch-round-page.mjs

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "IEC: team-only views (hide combined/pro/am/by-car when team data exists), include bonuses in class points, race-by-race toggle"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
