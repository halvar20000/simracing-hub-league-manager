#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p scripts
cat > scripts/lm_patch_pool_green.cjs <<'JS'
const fs = require("fs");

function patch(file) {
  if (!fs.existsSync(file)) {
    console.error(`  ${file}: not found`);
    process.exit(1);
  }
  let s = fs.readFileSync(file, "utf8");
  const before = s;

  if (s.includes("enteredByReg")) {
    console.log(`  ${file}: already patched.`);
    return;
  }

  // 1. Inject RaceResult fetch + enteredByReg map right after the penalties findMany
  //    Anchor: the closing of the `penalties = await prisma.penalty.findMany({...})` call,
  //    which ends with `});` followed by a blank line then `type DriverRow = {`.
  const FETCH_BLOCK =
`
  const raceResults = await prisma.raceResult.findMany({
    where: { round: { seasonId } },
    select: { roundId: true, registrationId: true },
  });
  const enteredByReg = new Map<string, Set<string>>();
  for (const rr of raceResults) {
    let set = enteredByReg.get(rr.registrationId);
    if (!set) {
      set = new Set();
      enteredByReg.set(rr.registrationId, set);
    }
    set.add(rr.roundId);
  }
`;

  const fetchAnchor = /(\s+const penalties = await prisma\.penalty\.findMany\(\{[\s\S]*?\}\);\n)/;
  if (!fetchAnchor.test(s)) {
    console.error(`  ${file}: penalties findMany anchor not found`);
    process.exit(1);
  }
  s = s.replace(fetchAnchor, "$1" + FETCH_BLOCK);

  // 2. Update the cell rendering: add green background + checkmark when clean+completed+entered.
  //    We anchor on the existing block:
  //      {rounds.map((r) => {
  //        const pts = d.cellsByRound.get(r.id) ?? 0;
  //        return (
  //          <td
  //            key={r.id}
  //            className="px-2 py-2 text-center tabular-nums"
  //          >
  //            ...amber pill / dash...
  //          </td>
  //        );
  //      })}

  const CELL_ANCHOR =
`              {rounds.map((r) => {
                    const pts = d.cellsByRound.get(r.id) ?? 0;
                    return (
                      <td
                        key={r.id}
                        className="px-2 py-2 text-center tabular-nums"
                      >
                        {pts > 0 ? (
                          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                            {pts}
                          </span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    );
                  })}`;

  const CELL_REPLACEMENT =
`              {rounds.map((r) => {
                    const pts = d.cellsByRound.get(r.id) ?? 0;
                    const entered =
                      enteredByReg.get(d.registrationId)?.has(r.id) ?? false;
                    const cleanCompleted =
                      pts === 0 && entered && r.status === "COMPLETED";
                    return (
                      <td
                        key={r.id}
                        className={` + "`" + `px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}` + "`" + `}
                      >
                        {pts > 0 ? (
                          <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                            {pts}
                          </span>
                        ) : cleanCompleted ? (
                          <span className="text-emerald-300" title="Clean race">✓</span>
                        ) : (
                          <span className="text-zinc-700">—</span>
                        )}
                      </td>
                    );
                  })}`;

  // The public page doesn't have d.registrationId in the row — it iterates by index.
  // Check first; if it doesn't use d.registrationId, we need a different anchor.
  if (s.includes("d.registrationId")) {
    if (!s.includes(CELL_ANCHOR)) {
      console.error(`  ${file}: cell anchor (admin variant) not found. Trying public variant…`);
    } else {
      s = s.replace(CELL_ANCHOR, CELL_REPLACEMENT);
    }
  }

  // Public page variant: iterates with index `i` and uses `d.name` etc., not d.registrationId.
  // To enable the lookup, we need the registrationId on the row too. The public file builds
  // rowMap.set(reg.id, { ... }) without putting id on the row. Easiest fix: store registrationId
  // on the row in the public file. We'll do this with a small patch:
  if (file.endsWith("/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx")) {
    // Add registrationId to DriverRow type
    s = s.replace(
      /(type DriverRow = \{\s*\n\s*name: string;)/,
      "$1\n    registrationId: string;"
    );
    // Add registrationId to the row creation
    s = s.replace(
      /(  for \(const reg of registrations\) \{\s*\n\s*rowMap\.set\(reg\.id, \{\s*\n)(\s*name:)/,
      "$1      registrationId: reg.id,\n$2"
    );

    // Anchor on public cell variant (uses (d, i) and key={i})
    const CELL_ANCHOR_PUB =
`              {rounds.map((r) => {
                const pts = d.cellsByRound.get(r.id) ?? 0;
                return (
                  <td
                    key={r.id}
                    className="px-2 py-2 text-center tabular-nums"
                  >
                    {pts > 0 ? (
                      <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                        {pts}
                      </span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                );
              })}`;

    const CELL_REPLACEMENT_PUB =
`              {rounds.map((r) => {
                const pts = d.cellsByRound.get(r.id) ?? 0;
                const entered =
                  enteredByReg.get(d.registrationId)?.has(r.id) ?? false;
                const cleanCompleted =
                  pts === 0 && entered && r.status === "COMPLETED";
                return (
                  <td
                    key={r.id}
                    className={` + "`" + `px-2 py-2 text-center tabular-nums ${cleanCompleted ? "bg-emerald-900/40" : ""}` + "`" + `}
                  >
                    {pts > 0 ? (
                      <span className="rounded bg-amber-900/40 px-2 py-0.5 text-amber-200">
                        {pts}
                      </span>
                    ) : cleanCompleted ? (
                      <span className="text-emerald-300" title="Clean race">✓</span>
                    ) : (
                      <span className="text-zinc-700">—</span>
                    )}
                  </td>
                );
              })}`;

    if (s.includes(CELL_ANCHOR_PUB)) {
      s = s.replace(CELL_ANCHOR_PUB, CELL_REPLACEMENT_PUB);
    }
  }

  if (s === before) {
    console.error(`  ${file}: no edits made.`);
    process.exit(1);
  }
  fs.writeFileSync(file, s);
  console.log(`  ${file}: patched.`);
}

patch("src/app/admin/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx");
patch("src/app/leagues/[slug]/seasons/[seasonId]/penalty-pool/page.tsx");
JS

echo "=== Run patch ==="
node scripts/lm_patch_pool_green.cjs

echo ""
echo "-- Verify --"
grep -nE 'enteredByReg|cleanCompleted|bg-emerald-900' \
  src/app/admin/leagues/\[slug\]/seasons/\[seasonId\]/penalty-pool/page.tsx \
  src/app/leagues/\[slug\]/seasons/\[seasonId\]/penalty-pool/page.tsx | head -20

echo ""
echo "=== TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== Commit + push ==="
git add -A
git status --short
git commit -m "Penalty pool (admin + public): paint cells green when round is COMPLETED, driver entered, and no penalty points were given"
git push

echo ""
echo "Done."
