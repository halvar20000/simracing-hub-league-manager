const fs = require("fs");

function patch(file) {
  if (!fs.existsSync(file)) {
    console.error("  " + file + ": not found");
    process.exit(1);
  }
  let s = fs.readFileSync(file, "utf8");
  const before = s;

  if (s.includes("enteredByReg")) {
    console.log("  " + file + ": already patched.");
    return;
  }

  // 1. Inject RaceResult fetch + enteredByReg map after the penalties findMany call.
  const FETCH_BLOCK =
    "\n  const raceResults = await prisma.raceResult.findMany({\n" +
    "    where: { round: { seasonId } },\n" +
    "    select: { roundId: true, registrationId: true },\n" +
    "  });\n" +
    "  const enteredByReg = new Map();\n" +
    "  for (const rr of raceResults) {\n" +
    "    let set = enteredByReg.get(rr.registrationId);\n" +
    "    if (!set) {\n" +
    "      set = new Set();\n" +
    "      enteredByReg.set(rr.registrationId, set);\n" +
    "    }\n" +
    "    set.add(rr.roundId);\n" +
    "  }\n";

  // We want the map TYPED in TS. Replace the JS-only `new Map()` with a typed version.
  const FETCH_BLOCK_TS = FETCH_BLOCK.replace(
    "new Map();",
    "new Map<string, Set<string>>();"
  );

  const fetchAnchor = /(\s+const penalties = await prisma\.penalty\.findMany\(\{[\s\S]*?\}\);\n)/;
  if (!fetchAnchor.test(s)) {
    console.error("  " + file + ": penalties findMany anchor not found");
    process.exit(1);
  }
  s = s.replace(fetchAnchor, "$1" + FETCH_BLOCK_TS);

  // 2. Helper to build the cell replacement WITHOUT JS template-literal interpolation.
  //    We build the string with single-quoted segments so ${cleanCompleted} stays literal.
  function buildCell(useDriverId) {
    const idExpr = useDriverId ? "d.registrationId" : "d.registrationId";
    return [
      "              {rounds.map((r) => {",
      "                    const pts = d.cellsByRound.get(r.id) ?? 0;",
      "                    const entered =",
      "                      enteredByReg.get(" + idExpr + ")?.has(r.id) ?? false;",
      "                    const cleanCompleted =",
      "                      pts === 0 && entered && r.status === \"COMPLETED\";",
      "                    return (",
      "                      <td",
      "                        key={r.id}",
      "                        className={" + "`" + 'px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}' + "`" + "}",
      "                      >",
      "                        {pts > 0 ? (",
      "                          <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">",
      "                            {pts}",
      "                          </span>",
      "                        ) : cleanCompleted ? (",
      "                          <span className=\"text-emerald-300\" title=\"Clean race\">✓</span>",
      "                        ) : (",
      "                          <span className=\"text-zinc-700\">—</span>",
      "                        )}",
      "                      </td>",
      "                    );",
      "                  })}",
    ].join("\n");
  }

  // Admin anchor (deeper indentation) — exact original from our last rewrite
  const CELL_ANCHOR_ADMIN =
    "              {rounds.map((r) => {\n" +
    "                    const pts = d.cellsByRound.get(r.id) ?? 0;\n" +
    "                    return (\n" +
    "                      <td\n" +
    "                        key={r.id}\n" +
    "                        className=\"px-2 py-2 text-center tabular-nums\"\n" +
    "                      >\n" +
    "                        {pts > 0 ? (\n" +
    "                          <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">\n" +
    "                            {pts}\n" +
    "                          </span>\n" +
    "                        ) : (\n" +
    "                          <span className=\"text-zinc-700\">—</span>\n" +
    "                        )}\n" +
    "                      </td>\n" +
    "                    );\n" +
    "                  })}";

  if (s.includes(CELL_ANCHOR_ADMIN)) {
    s = s.replace(CELL_ANCHOR_ADMIN, buildCell(true));
  }

  // Public file: shallower indentation (no `details/summary` wrapper), uses (d, i) map
  const PUBLIC_PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx";
  if (file === PUBLIC_PAGE) {
    // Add registrationId to DriverRow type
    s = s.replace(
      /(type DriverRow = \{\s*\n\s*name: string;)/,
      "$1\n    registrationId: string;"
    );
    s = s.replace(
      /(  for \(const reg of registrations\) \{\s*\n\s*rowMap\.set\(reg\.id, \{\s*\n)(\s*name:)/,
      "$1      registrationId: reg.id,\n$2"
    );

    const CELL_ANCHOR_PUB =
      "              {rounds.map((r) => {\n" +
      "                const pts = d.cellsByRound.get(r.id) ?? 0;\n" +
      "                return (\n" +
      "                  <td\n" +
      "                    key={r.id}\n" +
      "                    className=\"px-2 py-2 text-center tabular-nums\"\n" +
      "                  >\n" +
      "                    {pts > 0 ? (\n" +
      "                      <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">\n" +
      "                        {pts}\n" +
      "                      </span>\n" +
      "                    ) : (\n" +
      "                      <span className=\"text-zinc-700\">—</span>\n" +
      "                    )}\n" +
      "                  </td>\n" +
      "                );\n" +
      "              })}";

    const CELL_REPLACE_PUB = [
      "              {rounds.map((r) => {",
      "                const pts = d.cellsByRound.get(r.id) ?? 0;",
      "                const entered =",
      "                  enteredByReg.get(d.registrationId)?.has(r.id) ?? false;",
      "                const cleanCompleted =",
      "                  pts === 0 && entered && r.status === \"COMPLETED\";",
      "                return (",
      "                  <td",
      "                    key={r.id}",
      "                    className={" + "`" + 'px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}' + "`" + "}",
      "                  >",
      "                    {pts > 0 ? (",
      "                      <span className=\"rounded bg-amber-900/40 px-2 py-0.5 text-amber-200\">",
      "                        {pts}",
      "                      </span>",
      "                    ) : cleanCompleted ? (",
      "                      <span className=\"text-emerald-300\" title=\"Clean race\">✓</span>",
      "                    ) : (",
      "                      <span className=\"text-zinc-700\">—</span>",
      "                    )}",
      "                  </td>",
      "                );",
      "              })}",
    ].join("\n");

    if (s.includes(CELL_ANCHOR_PUB)) {
      s = s.replace(CELL_ANCHOR_PUB, CELL_REPLACE_PUB);
    }
  }

  if (s === before) {
    console.error("  " + file + ": no edits made.");
    process.exit(1);
  }
  fs.writeFileSync(file, s);
  console.log("  " + file + ": patched.");
}

patch("src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx");
patch("src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx");
