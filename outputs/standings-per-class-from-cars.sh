#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// ---------------------------------------------------------------------------
// Replace the existing per-class block (which filters drivers by
// Registration.carClassId — broken for car-rotation seasons) with a block
// that groups CarStandings by carClass.
// ---------------------------------------------------------------------------
const before = `      {cls === "combined" && season.isMulticlass && season.carClasses.length > 0 &&
        season.carClasses.map((cc) => {
          const rows = drivers.filter((d) => d.carClassId === cc.id);
          const previousRows = previousDrivers?.filter((d) => d.carClassId === cc.id) ?? null;
          return (
            <section key={cc.id}>
              <h2 className="mb-3 text-lg font-semibold">{cc.name}</h2>
              {view === "races" ? (
                <RaceByRaceTable rows={rows} kind="class" />
              ) : (
                <DriversTable rows={rows} previousRows={previousRows} kind="class" showTeam />
              )}
            </section>
          );
        })}`;

const after = `      {cls === "combined" && season.isMulticlass && season.carClasses.length > 0 &&
        season.carClasses.map((cc) => {
          const carsInClass = cars.filter(
            (c) => (c.carClassShortCode ?? "").toUpperCase() === cc.shortCode.toUpperCase()
          );
          // Aggregate drivers across cars within the class.
          const byDriver = new Map<string, {
            registrationId: string;
            startNumber: number | null;
            driverFirstName: string | null;
            driverLastName: string | null;
            countryCode: string | null;
            teamName: string | null;
            rawPoints: number;
            participationPoints: number;
            manualPenalties: number;
            correctionPoints: number;
            combinedTotal: number;
            roundsCompleted: number;
          }>();
          for (const car of carsInClass) {
            for (const d of car.drivers) {
              const existing = byDriver.get(d.registrationId);
              if (existing) {
                existing.rawPoints += d.rawPoints;
                existing.participationPoints += d.participationPoints;
                existing.manualPenalties += d.manualPenalties;
                existing.correctionPoints += d.correctionPoints;
                existing.combinedTotal += d.combinedTotal;
                existing.roundsCompleted += d.roundsCompleted;
              } else {
                byDriver.set(d.registrationId, { ...d });
              }
            }
          }
          const driversInClass = [...byDriver.values()].sort(
            (a, b) => b.combinedTotal - a.combinedTotal
          );
          return (
            <section key={cc.id}>
              <h2 className="mb-3 text-lg font-semibold">{cc.name}</h2>
              {driversInClass.length === 0 ? (
                <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
                  No results yet for {cc.name}.
                </p>
              ) : (
                <div className="overflow-hidden rounded border border-zinc-800">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                      <tr>
                        <th className="px-3 py-2 w-10">Pos</th>
                        <th className="px-3 py-2">Driver</th>
                        <th className="px-3 py-2">Team</th>
                        <th className="px-3 py-2 text-right">Rounds</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {driversInClass.map((d, i) => (
                        <tr key={d.registrationId} className="border-t border-zinc-800">
                          <td className="px-3 py-2 font-medium">{i + 1}</td>
                          <td className="px-3 py-2">
                            <span className="inline-flex items-center gap-2">
                              <CountryFlag code={d.countryCode} />
                              {d.startNumber != null && (
                                <span className="text-xs text-zinc-500">
                                  #{d.startNumber}
                                </span>
                              )}
                              <span>
                                {d.driverFirstName} {d.driverLastName}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-2 text-zinc-400">{d.teamName ?? "—"}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{d.roundsCompleted}</td>
                          <td className="px-3 py-2 text-right font-semibold tabular-nums">
                            {d.combinedTotal}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          );
        })}`;

if (!s.includes(before)) {
  console.error("Per-class block anchor not found.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Standings page: per-class block now uses CarStandings grouped by class.");
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
git commit -m "Standings: per-class blocks aggregate from cars (not Registration.carClassId) so car-rotation seasons populate correctly"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
