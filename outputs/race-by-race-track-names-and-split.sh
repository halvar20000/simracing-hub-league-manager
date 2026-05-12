#!/usr/bin/env bash
# Race-by-race view improvements:
#   - Column headers show round number + track name (e.g. "R1\nMugello GP")
#   - Each cell shows the points breakdown: race points (top), +participation (small green),
#     −penalty (small red)
#   - Combined view shows race points + penalty (no participation)

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# ------------------------------------------------------------
# 1. standings.ts — add rawPoints, participationPoints, penaltyPoints to RoundPoints
# ------------------------------------------------------------
echo ">>> Updating standings library RoundPoints..."

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
  rawPoints: number;
  participationPoints: number;
  penaltyPoints: number;
  combinedPoints: number;
  classPoints: number;
  hasResult: boolean;
}\`
);

// Update the roundPoints map to populate the new fields
s = s.replace(
  /const roundPoints: RoundPoints\[\] = rounds\.map\(\(round\) => \{[\s\S]*?return \{\s*roundId: round\.id,\s*roundNumber: round\.roundNumber,\s*roundName: round\.name,\s*combinedPoints: combined,\s*classPoints: cls,\s*hasResult: true,\s*\};\s*\}\);/,
  \`const roundPoints: RoundPoints[] = rounds.map((round) => {
      const result = resultsByRoundId.get(round.id);
      if (!result) {
        return {
          roundId: round.id,
          roundNumber: round.roundNumber,
          roundName: round.name,
          rawPoints: 0,
          participationPoints: 0,
          penaltyPoints: 0,
          combinedPoints: 0,
          classPoints: 0,
          hasResult: false,
        };
      }
      const raw = result.rawPointsAwarded;
      const part = result.participationPointsAwarded;
      const pen = result.manualPenaltyPoints;
      return {
        roundId: round.id,
        roundNumber: round.roundNumber,
        roundName: round.name,
        rawPoints: raw,
        participationPoints: part,
        penaltyPoints: pen,
        combinedPoints: raw - pen,
        classPoints: raw + part - pen,
        hasResult: true,
      };
    });\`
);

// Remove old combined/cls calculation block which is now redundant
s = s.replace(
  /const combined =\s*result\.rawPointsAwarded - result\.manualPenaltyPoints;\s*const cls =\s*result\.rawPointsAwarded \+\s*result\.participationPointsAwarded -\s*result\.manualPenaltyPoints;/,
  ''
);

fs.writeFileSync(path, s);
console.log('  Patched standings.ts');
"

# ------------------------------------------------------------
# 2. Standings page — update RaceByRaceTable header + cell rendering
# ------------------------------------------------------------
echo ">>> Updating race-by-race table rendering..."

node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx';
let s = fs.readFileSync(path, 'utf8');

// Replace the entire RaceByRaceTable function
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
  return (
    <div className=\"overflow-x-auto rounded border border-zinc-800\">
      <table className=\"min-w-full text-xs\">
        <thead className=\"bg-zinc-900 text-left text-zinc-400\">
          <tr>
            <th className=\"sticky left-0 z-10 bg-zinc-900 px-3 py-2\">Pos</th>
            <th className=\"bg-zinc-900 px-2 py-2\">#</th>
            <th className=\"bg-zinc-900 px-2 py-2\">Driver</th>
            {rounds.map((r) => (
              <th
                key={r.roundId}
                className=\"bg-zinc-900 px-2 py-2 text-right whitespace-nowrap\"
              >
                <div className=\"flex flex-col items-end leading-tight\">
                  <span className=\"text-[9px] text-zinc-500\">R{r.roundNumber}</span>
                  <span className=\"text-xs font-display\">{r.roundName}</span>
                </div>
              </th>
            ))}
            <th className=\"bg-zinc-900 px-2 py-2 text-right\">Inc</th>
            <th className=\"bg-zinc-900 px-2 py-2 text-right\">iR</th>
            <th className=\"bg-zinc-900 px-2 py-2 text-right\">Total</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, idx) => {
            const total = kind === \"combined\" ? r.combinedTotal : r.classTotal;
            return (
              <tr
                key={r.registrationId}
                className=\"border-t border-zinc-800 hover:bg-zinc-900\"
              >
                <td className=\"sticky left-0 z-10 bg-zinc-950 px-3 py-2 font-medium align-top\">
                  {idx + 1}
                </td>
                <td className=\"px-2 py-2 text-zinc-500 align-top\">{r.startNumber ?? \"—\"}</td>
                <td className=\"px-2 py-2 font-medium whitespace-nowrap align-top\">
                  {r.driverFirstName} {r.driverLastName}
                </td>
                {r.roundPoints.map((rp) => (
                  <td
                    key={rp.roundId}
                    className=\"px-2 py-2 text-right tabular-nums align-top\"
                  >
                    {rp.hasResult ? (
                      <div className=\"flex flex-col items-end leading-tight\">
                        <span className=\"text-zinc-200\">{rp.rawPoints}</span>
                        {kind === \"class\" && rp.participationPoints > 0 && (
                          <span className=\"text-[9px] text-emerald-400\">+{rp.participationPoints}</span>
                        )}
                        {rp.penaltyPoints > 0 && (
                          <span className=\"text-[9px] text-red-400\">−{rp.penaltyPoints}</span>
                        )}
                      </div>
                    ) : (
                      <span className=\"text-zinc-700\">—</span>
                    )}
                  </td>
                ))}
                <td className=\"px-2 py-2 text-right text-zinc-400 tabular-nums align-top\">{r.totalIncidents}</td>
                <td className=\"px-2 py-2 text-right text-zinc-400 tabular-nums align-top\">{r.iRating ?? \"—\"}</td>
                <td className=\"px-2 py-2 text-right font-bold text-orange-400 tabular-nums align-top\">{total}</td>
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
echo "Done. Refresh the standings page and switch to Race by race view."
echo "Headers now show R# + track name; each cell shows race points + participation + penalty stacked."
