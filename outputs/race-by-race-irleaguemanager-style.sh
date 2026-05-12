#!/usr/bin/env bash
# Restructure the race-by-race view to match iRLeagueManager's layout:
# - Season Total column moves to the LEFT (after Driver)
# - Each round has 4 sub-columns: Total / R (race) / B (bonus = participation) / P (penalty)
# - Round header shows R{n}, date (DD.MM.YY), track name across the 4 columns

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. standings.ts — include round date in RoundPoints
# ------------------------------------------------------------
echo ">>> Adding roundDate to RoundPoints..."

node -e "
const fs = require('fs');
const path = 'src/lib/standings.ts';
let s = fs.readFileSync(path, 'utf8');

// Extend the interface
s = s.replace(
  /export interface RoundPoints \{[\s\S]*?hasResult: boolean;\s*\}/,
  \`export interface RoundPoints {
  roundId: string;
  roundNumber: number;
  roundName: string;
  roundDate: Date;
  rawPoints: number;
  participationPoints: number;
  penaltyPoints: number;
  combinedPoints: number;
  classPoints: number;
  hasResult: boolean;
}\`
);

// Update rounds query to fetch startsAt
s = s.replace(
  /prisma\.round\.findMany\(\{\s*where: \{ seasonId \},\s*orderBy: \{ roundNumber: \"asc\" \},\s*select: \{ id: true, roundNumber: true, name: true \},\s*\}\)/,
  \`prisma.round.findMany({
      where: { seasonId },
      orderBy: { roundNumber: \"asc\" },
      select: { id: true, roundNumber: true, name: true, startsAt: true },
    })\`
);

// Populate roundDate in the no-result branch
s = s.replace(
  /if \(!result\) \{\s*return \{\s*roundId: round\.id,\s*roundNumber: round\.roundNumber,\s*roundName: round\.name,\s*rawPoints: 0,\s*participationPoints: 0,\s*penaltyPoints: 0,\s*combinedPoints: 0,\s*classPoints: 0,\s*hasResult: false,\s*\};\s*\}/,
  \`if (!result) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundName: round.name,
          roundDate: round.startsAt,
          rawPoints: 0,
          participationPoints: 0,
          penaltyPoints: 0,
          combinedPoints: 0,
          classPoints: 0,
          hasResult: false,
        };
      }\`
);

// And in the with-result branch
s = s.replace(
  /return \{\s*roundId: round\.id,\s*roundNumber: round\.roundNumber,\s*roundName: round\.name,\s*rawPoints: raw,\s*participationPoints: part,\s*penaltyPoints: pen,\s*combinedPoints: raw - pen,\s*classPoints: raw \+ part - pen,\s*hasResult: true,\s*\};/,
  \`return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        roundName: round.name,
        roundDate: round.startsAt,
        rawPoints: raw,
        participationPoints: part,
        penaltyPoints: pen,
        combinedPoints: raw - pen,
        classPoints: raw + part - pen,
        hasResult: true,
      };\`
);

fs.writeFileSync(path, s);
console.log('  Patched standings.ts');
"

# ------------------------------------------------------------
# 2. Standings page — replace RaceByRaceTable with iRLM-style layout
# ------------------------------------------------------------
echo ">>> Rewriting RaceByRaceTable..."

node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx';
let s = fs.readFileSync(path, 'utf8');

// Add Fragment + formatDate imports if not already present
if (!s.includes('Fragment')) {
  s = s.replace(/^import Link from \"next\\/link\";/, 'import Link from \"next/link\";\nimport { Fragment } from \"react\";');
}
if (!s.includes('formatDate')) {
  if (s.includes('from \"@/lib/date\"')) {
    s = s.replace(/import \{([^}]+)\} from \"@\\/lib\\/date\";/, (m, names) => {
      if (names.includes('formatDate')) return m;
      return 'import {' + names.trim() + ', formatDate} from \"@/lib/date\";';
    });
  } else {
    s = s.replace(/^(import .+;\n)+/m, (m) => m + 'import { formatDate } from \"@/lib/date\";\n');
  }
}

const newTable = \`function RaceByRaceTable({
  rows,
  kind,
}: {
  rows: DriverStanding[];
  kind: StandingsKind;
}) {
  if (rows.length === 0) {
    return <p className=\"text-sm text-zinc-500\">No standings to show yet.</p>;
  }
  const rounds = rows[0].roundPoints;
  const sorted = [...rows].sort((a, b) => {
    const at = kind === \"combined\" ? a.combinedTotal : a.classTotal;
    const bt = kind === \"combined\" ? b.combinedTotal : b.classTotal;
    return bt - at;
  });

  function formatShortDate(d: Date): string {
    const date = new Date(d);
    const dd = String(date.getDate()).padStart(2, \"0\");
    const mm = String(date.getMonth() + 1).padStart(2, \"0\");
    const yy = String(date.getFullYear()).slice(2);
    return \\\`\\\${dd}.\\\${mm}.\\\${yy}\\\`;
  }

  return (
    <div className=\"overflow-x-auto rounded border border-zinc-800\">
      <table className=\"min-w-full text-[11px]\">
        <thead className=\"bg-zinc-900 text-zinc-400\">
          <tr>
            <th rowSpan={2} className=\"sticky left-0 z-10 bg-zinc-900 px-2 py-2 text-left\">Pos</th>
            <th rowSpan={2} className=\"bg-zinc-900 px-2 py-2 text-left\">#</th>
            <th rowSpan={2} className=\"bg-zinc-900 px-2 py-2 text-left\">Driver</th>
            <th rowSpan={2} className=\"bg-zinc-900 px-2 py-2 text-right\">Total</th>
            {rounds.map((r) => (
              <th
                key={r.roundId}
                colSpan={4}
                className=\"border-l border-zinc-800 bg-zinc-900 px-2 py-2 text-center whitespace-nowrap\"
              >
                <div className=\"flex flex-col items-center leading-tight\">
                  <span className=\"text-[10px] text-zinc-500\">R{r.roundNumber} • {formatShortDate(r.roundDate)}</span>
                  <span className=\"font-display text-xs\">{r.roundName}</span>
                </div>
              </th>
            ))}
            <th rowSpan={2} className=\"bg-zinc-900 px-2 py-2 text-right\">Inc</th>
            <th rowSpan={2} className=\"bg-zinc-900 px-2 py-2 text-right\">iR</th>
          </tr>
          <tr>
            {rounds.map((r) => (
              <Fragment key={r.roundId}>
                <th className=\"border-l border-zinc-800 bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-400\">Total</th>
                <th className=\"bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500\">R</th>
                <th className=\"bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500\">B</th>
                <th className=\"bg-zinc-900 px-1.5 py-1 text-right text-[9px] font-semibold uppercase text-zinc-500\">P</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const seasonTotal = kind === \"combined\" ? r.combinedTotal : r.classTotal;
            return (
              <tr
                key={r.registrationId}
                className=\"border-t border-zinc-800 hover:bg-zinc-900\"
              >
                <td className=\"sticky left-0 z-10 bg-zinc-950 px-2 py-1.5 font-medium\">{idx + 1}</td>
                <td className=\"px-2 py-1.5 text-zinc-500\">{r.startNumber ?? \"—\"}</td>
                <td className=\"px-2 py-1.5 font-medium whitespace-nowrap\">
                  {r.driverFirstName} {r.driverLastName}
                </td>
                <td className=\"px-2 py-1.5 text-right font-bold text-orange-400 tabular-nums\">{seasonTotal}</td>
                {r.roundPoints.map((rp) => {
                  const cellTotal = kind === \"combined\" ? rp.combinedPoints : rp.classPoints;
                  const dash = <span className=\"text-zinc-700\">—</span>;
                  return (
                    <Fragment key={rp.roundId}>
                      <td className=\"border-l border-zinc-800 px-1.5 py-1.5 text-right tabular-nums\">
                        {rp.hasResult ? <span className=\"font-semibold text-zinc-200\">{cellTotal}</span> : dash}
                      </td>
                      <td className=\"px-1.5 py-1.5 text-right tabular-nums text-zinc-300\">
                        {rp.hasResult && rp.rawPoints !== 0 ? rp.rawPoints : dash}
                      </td>
                      <td className=\"px-1.5 py-1.5 text-right tabular-nums text-emerald-400\">
                        {rp.hasResult && rp.participationPoints !== 0 ? rp.participationPoints : dash}
                      </td>
                      <td className=\"px-1.5 py-1.5 text-right tabular-nums text-red-400\">
                        {rp.hasResult && rp.penaltyPoints !== 0 ? \\\`−\\\${rp.penaltyPoints}\\\` : dash}
                      </td>
                    </Fragment>
                  );
                })}
                <td className=\"px-2 py-1.5 text-right text-zinc-400 tabular-nums\">{r.totalIncidents}</td>
                <td className=\"px-2 py-1.5 text-right text-zinc-400 tabular-nums\">{r.iRating ?? \"—\"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}\`;

s = s.replace(/function RaceByRaceTable\([\s\S]*?\n\}\n/, newTable + '\n');

fs.writeFileSync(path, s);
console.log('  Patched standings page.');
"

echo ""
echo "Done. Refresh the standings page and switch to Race-by-race view."
echo "Each round now shows 4 sub-columns (Total / R / B / P) with the date in the header."
