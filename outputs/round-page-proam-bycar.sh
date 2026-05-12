#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Extend Cls type with "car"
s = s.replace(
  `type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2" | "quali";`,
  `type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2" | "quali" | "car";`
);

// 2. Add proAmEnabled flag right after the isMulticlass declaration.
if (!s.includes("const proAmEnabled =")) {
  s = s.replace(
    `  const isMulticlass = round.season.isMulticlass;`,
    `  const isMulticlass = round.season.isMulticlass;
  const proAmEnabled = round.season.proAmEnabled;`
  );
}

// 3. Gate the Pro/Am tabs on proAmEnabled (was isMulticlass).
{
  const before = `        {isMulticlass && (
          <>
            <Link
              href={\`\${baseHref}?cls=pro\`}
              className={\`\${pillBase} \${cls === "pro" ? pillOn : pillOff}\`}
            >
              Pro
            </Link>
            <Link
              href={\`\${baseHref}?cls=am\`}
              className={\`\${pillBase} \${cls === "am" ? pillOn : pillOff}\`}
            >
              Am
            </Link>
          </>
        )}`;
  const after = `        {proAmEnabled && (
          <>
            <Link
              href={\`\${baseHref}?cls=pro\`}
              className={\`\${pillBase} \${cls === "pro" ? pillOn : pillOff}\`}
            >
              Pro
            </Link>
            <Link
              href={\`\${baseHref}?cls=am\`}
              className={\`\${pillBase} \${cls === "am" ? pillOn : pillOff}\`}
            >
              Am
            </Link>
          </>
        )}`;
  if (s.includes(before)) {
    s = s.replace(before, after);
    console.log("Round page: Pro/Am tabs gated on proAmEnabled.");
  } else {
    console.log("Round page: Pro/Am gating already updated (or anchor moved).");
  }
}

// 4. Add a "By Car" tab right after the Team tab.
{
  const before = `        <Link
          href={\`\${baseHref}?cls=team\`}
          className={\`\${pillBase} \${cls === "team" ? pillOn : pillOff}\`}
        >
          Team
        </Link>`;
  const after = `        <Link
          href={\`\${baseHref}?cls=team\`}
          className={\`\${pillBase} \${cls === "team" ? pillOn : pillOff}\`}
        >
          Team
        </Link>
        <Link
          href={\`\${baseHref}?cls=car\`}
          className={\`\${pillBase} \${cls === "car" ? pillOn : pillOff}\`}
        >
          By Car
        </Link>`;
  if (!s.includes('?cls=car')) {
    if (s.includes(before)) {
      s = s.replace(before, after);
      console.log("Round page: 'By Car' tab inserted.");
    } else {
      console.error("Round page: Team-tab anchor not found.");
      process.exit(1);
    }
  }
}

// 5. Update the cls toggle parser to accept "car".
//    Find the inline assignment and add the "car" case.
{
  const before = `clsRaw === "team" ? "team" :`;
  const after = `clsRaw === "team" ? "team" :
    clsRaw === "car" ? "car" :`;
  if (!s.includes('clsRaw === "car"') && s.includes(before)) {
    s = s.replace(before, after);
    console.log("Round page: cls parser now accepts 'car'.");
  }
}

// 6. Insert render block for cls === "car" — list per car with finish columns.
{
  if (!s.includes('cls === "car" ?')) {
    // Hook into the chain right BEFORE `cls === "pro" ? (` (which exists per dump).
    const before = `        ) : cls === "pro" ? (`;
    const after = `        ) : cls === "car" ? (
          <ByCarSection
            allRows={allRows}
            isMultiRace={isMultiRace}
          />
        ) : cls === "pro" ? (`;
    if (s.includes(before)) {
      s = s.replace(before, after);
      console.log("Round page: render branch for 'car' inserted.");
    } else {
      console.error("Round page: 'cls === pro' anchor not found.");
      process.exit(1);
    }
  }
}

// 7. Append the ByCarSection component at the bottom of the file.
if (!s.includes("function ByCarSection(")) {
  s += `

interface ByCarRow {
  registrationId: string;
  raceNumber: number;
  finishPosition: number;
  finishStatus: string;
  rawPointsAwarded: number;
  participationPointsAwarded: number;
  manualPenaltyPoints: number;
  carId: string | null;
  carName: string | null;
  driverFirstName: string | null;
  driverLastName: string | null;
  countryCode: string | null;
  startNumber: number | null;
}

function ByCarSection({
  allRows,
  isMultiRace,
}: {
  allRows: ByCarRow[];
  isMultiRace: boolean;
}) {
  // Group results by carId. Drivers without a carId go into "Unassigned".
  const byCar = new Map<string, { carName: string; rows: ByCarRow[] }>();
  for (const r of allRows) {
    const key = r.carId ?? "__none__";
    const name = r.carName ?? "Unassigned";
    if (!byCar.has(key)) byCar.set(key, { carName: name, rows: [] });
    byCar.get(key)!.rows.push(r);
  }
  // Order cars alphabetically; "Unassigned" last.
  const carEntries = [...byCar.entries()].sort(([ak, av], [bk, bv]) => {
    if (ak === "__none__") return 1;
    if (bk === "__none__") return -1;
    return av.carName.localeCompare(bv.carName);
  });

  if (carEntries.length === 0) {
    return (
      <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
        No car-tagged results yet for this round. Re-import via iRacing JSON to
        populate cars.
      </p>
    );
  }

  return (
    <section className="space-y-4">
      {carEntries.map(([key, { carName, rows }]) => {
        // For each driver-in-this-car, show their finish in each race number.
        const byDriver = new Map<string, ByCarRow[]>();
        for (const r of rows) {
          const list = byDriver.get(r.registrationId) ?? [];
          list.push(r);
          byDriver.set(r.registrationId, list);
        }
        // Pick the BEST finish across races for sorting.
        const drivers = [...byDriver.entries()]
          .map(([regId, rs]) => {
            const best = Math.min(...rs.map((r) => r.finishPosition));
            const points = rs.reduce(
              (sum, r) =>
                sum +
                r.rawPointsAwarded +
                r.participationPointsAwarded -
                r.manualPenaltyPoints,
              0
            );
            const head = rs[0];
            return { regId, rs, best, points, head };
          })
          .sort((a, b) => b.points - a.points || a.best - b.best);

        return (
          <details
            key={key}
            open
            className="rounded border border-zinc-800 bg-zinc-900/50"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
              <span className="font-display text-base font-semibold">
                {carName}
              </span>
              <span className="text-xs text-zinc-500">
                {drivers.length} driver{drivers.length === 1 ? "" : "s"}
              </span>
            </summary>
            <div className="border-t border-zinc-800">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                  <tr>
                    <th className="px-3 py-2 w-10">Pos</th>
                    <th className="px-3 py-2">Driver</th>
                    {isMultiRace ? (
                      <>
                        <th className="px-3 py-2 text-center">R1</th>
                        <th className="px-3 py-2 text-center">R2</th>
                      </>
                    ) : (
                      <th className="px-3 py-2 text-center">Finish</th>
                    )}
                    <th className="px-3 py-2 text-right">Points</th>
                  </tr>
                </thead>
                <tbody>
                  {drivers.map((d, i) => {
                    const r1 = d.rs.find((r) => r.raceNumber === 1);
                    const r2 = d.rs.find((r) => r.raceNumber === 2);
                    const fmt = (r: ByCarRow | undefined) =>
                      !r
                        ? "—"
                        : r.finishStatus !== "CLASSIFIED"
                          ? r.finishStatus
                          : "P" + r.finishPosition;
                    return (
                      <tr
                        key={d.regId}
                        className="border-t border-zinc-800"
                      >
                        <td className="px-3 py-2 font-medium">{i + 1}</td>
                        <td className="px-3 py-2">
                          <span className="inline-flex items-center gap-2">
                            {d.head.startNumber != null && (
                              <span className="text-xs text-zinc-500">
                                #{d.head.startNumber}
                              </span>
                            )}
                            <span>
                              {d.head.driverFirstName} {d.head.driverLastName}
                            </span>
                          </span>
                        </td>
                        {isMultiRace ? (
                          <>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {fmt(r1)}
                            </td>
                            <td className="px-3 py-2 text-center text-zinc-300">
                              {fmt(r2)}
                            </td>
                          </>
                        ) : (
                          <td className="px-3 py-2 text-center text-zinc-300">
                            {fmt(r1 ?? r2)}
                          </td>
                        )}
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {d.points}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        );
      })}
    </section>
  );
}
`;
  console.log("Round page: appended ByCarSection component.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs

# ---------------------------------------------------------------------------
# We also need to make sure allRows actually contains the new fields the
# component reads (carId, carName, registrationId, etc). Quick check:
# ---------------------------------------------------------------------------
echo ""
echo "=== Inspecting allRows construction in the round page ==="
grep -n -A 5 "const allRows" 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx' | head -40

rm -rf outputs-tmp

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo ""
  echo "!!! TypeScript errors above. NOT pushing."
  exit 1
}

git add -A
git commit -m "Round page: gate Pro/Am tabs on proAmEnabled + add 'By Car' tab/view"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
