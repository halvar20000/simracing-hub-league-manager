#!/usr/bin/env bash
# Add a "Quali" view to the public round page: drivers sorted by best
# qualifying lap, with gap-to-pole, position, team and class columns.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (1) Cls type: add "quali"
const typeBefore =
  'type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2";';
const typeAfter =
  'type Cls = "combined" | "pro" | "am" | "team" | "race1" | "race2" | "quali";';
if (s.includes(typeAfter)) {
  console.log("Cls type already includes quali.");
} else if (!s.includes(typeBefore)) {
  console.error("Cls type anchor missing");
  process.exit(1);
} else {
  s = s.replace(typeBefore, typeAfter);
  console.log("Cls type updated.");
}

// (2) Parse "quali" — add a branch in the cls assignment ladder.
const parseBefore =
  '            : clsRaw === "race2"\n              ? "race2"\n              : "combined";';
const parseAfter =
  '            : clsRaw === "race2"\n              ? "race2"\n              : clsRaw === "quali"\n                ? "quali"\n                : "combined";';
if (s.includes('clsRaw === "quali"')) {
  console.log("cls parsing already handles quali.");
} else if (!s.includes(parseBefore)) {
  console.error("cls parse anchor missing");
  process.exit(1);
} else {
  s = s.replace(parseBefore, parseAfter);
  console.log("cls parsing now handles quali.");
}

// (3) Toggle JSX: add a "Quali" pill right after the "Combined" link
const toggleBefore =
  '<Link\n          href={baseHref}\n          className={`${pillBase} ${cls === "combined" ? pillOn : pillOff}`}\n        >\n          Combined\n        </Link>';
const toggleAfter = toggleBefore +
  '\n        <Link\n          href={`${baseHref}?cls=quali`}\n          className={`${pillBase} ${cls === "quali" ? pillOn : pillOff}`}\n        >\n          Quali\n        </Link>';
if (s.includes("cls === \"quali\" ? pillOn : pillOff")) {
  console.log("toggle: Quali pill already present.");
} else if (!s.includes(toggleBefore)) {
  console.error("toggle Combined anchor missing");
  process.exit(1);
} else {
  s = s.replace(toggleBefore, toggleAfter);
  console.log("toggle: Quali pill inserted.");
}

// (4) Render switch: add a quali branch using <QualifyingTable rows={...}/>
//     The cls switch is a chained ternary. Anchor on the "team" branch's
//     check, since team comes first in the ternary.
const renderBefore = ') : cls === "team" ? (';
const renderAfter =
  ') : cls === "quali" ? (\n          <QualifyingTable rows={aggRows} isMulticlass={isMulticlass} />\n        ' + renderBefore;
if (s.includes('cls === "quali" ? (')) {
  console.log("render: Quali branch already present.");
} else if (!s.includes(renderBefore)) {
  console.error("render switch anchor missing");
  process.exit(1);
} else {
  s = s.replace(renderBefore, renderAfter);
  console.log("render: Quali branch inserted.");
}

// (5) Append the QualifyingTable component to the end of the file
if (!s.includes("function QualifyingTable")) {
  s = s.trimEnd() + '\n' + `
function QualifyingTable({
  rows,
  isMulticlass,
}: {
  rows: Agg[];
  isMulticlass: boolean;
}) {
  // For each driver, take the smallest non-null qualifyingTimeMs across
  // their RaceResult rows (in multi-race rounds R1 and R2 carry the same
  // value; for single-race it's just the one row).
  const drivers = rows
    .map((a) => {
      const sample = a.rows[0];
      let bestQuali: number | null = null;
      for (const r of a.rows) {
        if (
          r.qualifyingTimeMs != null &&
          (bestQuali == null || r.qualifyingTimeMs < bestQuali)
        ) {
          bestQuali = r.qualifyingTimeMs;
        }
      }
      return {
        registrationId: a.registrationId,
        firstName: sample.registration.user.firstName,
        lastName: sample.registration.user.lastName,
        countryCode: sample.registration.user.countryCode ?? null,
        startNumber: sample.registration.startNumber,
        teamName: sample.registration.team?.name ?? null,
        carClassName: sample.registration.carClass?.name ?? null,
        qualifyingTimeMs: bestQuali,
        excludedAt: sample.registration.excludedAt,
      };
    })
    .sort((a, b) => {
      const at = a.qualifyingTimeMs ?? Number.POSITIVE_INFINITY;
      const bt = b.qualifyingTimeMs ?? Number.POSITIVE_INFINITY;
      return at - bt;
    });

  if (drivers.length === 0) {
    return null;
  }
  const pole = drivers[0]?.qualifyingTimeMs ?? null;

  return (
    <div className="overflow-hidden rounded border border-zinc-800">
      <table className="w-full text-sm">
        <thead className="bg-zinc-900 text-left text-zinc-400">
          <tr>
            <th className="px-3 py-2">Pos</th>
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Driver</th>
            <th className="px-3 py-2">Team</th>
            {isMulticlass && <th className="px-3 py-2">Class</th>}
            <th className="px-3 py-2 text-right">Quali time</th>
            <th className="px-3 py-2 text-right">Gap to pole</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => {
            const gap =
              pole != null && d.qualifyingTimeMs != null
                ? d.qualifyingTimeMs - pole
                : null;
            return (
              <tr
                key={d.registrationId}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">
                  {d.qualifyingTimeMs != null ? i + 1 : "—"}
                </td>
                <td className="px-3 py-2 text-zinc-500">
                  {d.startNumber ?? "—"}
                </td>
                <td
                  className={\`px-3 py-2 \${d.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                >
                  <CountryFlag code={d.countryCode} />
                  {d.firstName} {d.lastName}
                  {d.excludedAt && (
                    <span className="ml-2 rounded bg-red-950 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-red-300 no-underline">
                      Excluded
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-zinc-400">
                  {d.teamName ?? "—"}
                </td>
                {isMulticlass && (
                  <td className="px-3 py-2 text-zinc-400">
                    {d.carClassName ?? "—"}
                  </td>
                )}
                <td className="px-3 py-2 text-right text-zinc-300 tabular-nums">
                  {formatMsToTime(d.qualifyingTimeMs) || "—"}
                </td>
                <td className="px-3 py-2 text-right text-zinc-500 tabular-nums">
                  {gap != null && gap > 0
                    ? "+" + formatMsToTime(gap)
                    : gap === 0
                      ? "pole"
                      : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
`;
  console.log("appended QualifyingTable component.");
}

// Make sure CountryFlag is imported in this file (in case the page hasn't been
// updated to use it elsewhere yet).
if (!/from "@\/components\/CountryFlag"/.test(s)) {
  s = s.replace(
    'import { formatMsToTime } from "@/lib/time";',
    'import { formatMsToTime } from "@/lib/time";\nimport { CountryFlag } from "@/components/CountryFlag";'
  );
  console.log("Added CountryFlag import.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch.mjs
rm -rf outputs-tmp

git add -A
git commit -m "Round page: add Quali view (drivers ranked by best qual lap, gap to pole)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  - Every round page has a 'Quali' button next to Combined."
echo "  - Click it to see all drivers sorted by best qualifying lap, with"
echo "    gap-to-pole shown alongside."
