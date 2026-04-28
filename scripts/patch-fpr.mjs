import fs from "node:fs";

const PAGE =
  "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Strip 'user: true' from the include.
const beforeInclude =
  "fprAwards: { include: { team: true, carClass: true, user: true } },";
const afterInclude =
  "fprAwards: { include: { team: true, carClass: true } },";

// Match flexible whitespace too
const includeRe =
  /fprAwards:\s*\{\s*include:\s*\{\s*team:\s*true,\s*carClass:\s*true,\s*user:\s*true\s*\}\s*,?\s*\}\s*,/;
if (includeRe.test(s)) {
  s = s.replace(includeRe, afterInclude);
  console.log("Include shape fixed.");
} else if (s.includes(afterInclude)) {
  console.log("Include shape already correct.");
} else {
  console.log("WARNING: did not find expected include shape; leaving alone.");
}

// 2) Find and replace the entire FPR <section>.
const startMarker = "{round.fprAwards.length > 0 && (";
const startIdx = s.indexOf(startMarker);
if (startIdx < 0) {
  console.error("Could not find FPR section start.");
  process.exit(1);
}
// We rely on the FPR section ending with the literal closing pattern below.
// In the file this is the last conditional inside the outer wrapper div.
const endNeedle = "      )}\n    </div>";
const endIdx = s.indexOf(endNeedle, startIdx);
if (endIdx < 0) {
  console.error("Could not find FPR section end marker.");
  process.exit(1);
}
const replaceUntil = endIdx + "      )}".length; // keep the closing '\n    </div>'

const replacement = `{round.fprAwards.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">FPR awards</h2>
          <div className="overflow-hidden rounded border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900 text-left text-zinc-400">
                <tr>
                  <th className="px-3 py-2">Team</th>
                  {isMulticlass && <th className="px-3 py-2">Class</th>}
                  <th className="px-3 py-2 text-right">Team incidents</th>
                  <th className="px-3 py-2 text-right">FPR pts</th>
                </tr>
              </thead>
              <tbody>
                {round.fprAwards.map((a) => (
                  <tr key={a.id} className="border-t border-zinc-800">
                    <td className="px-3 py-2 font-medium">{a.team.name}</td>
                    {isMulticlass && (
                      <td className="px-3 py-2 text-zinc-400">
                        {a.carClass?.name ?? "—"}
                      </td>
                    )}
                    <td className="px-3 py-2 text-right text-zinc-400 tabular-nums">
                      {a.teamIncidentTotal}
                    </td>
                    <td className="px-3 py-2 text-right font-semibold text-orange-400 tabular-nums">
                      {a.fprPointsAwarded}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}`;

s = s.slice(0, startIdx) + replacement + s.slice(replaceUntil);
fs.writeFileSync(PAGE, s);
console.log("FPR <section> replaced with team-award shape.");
