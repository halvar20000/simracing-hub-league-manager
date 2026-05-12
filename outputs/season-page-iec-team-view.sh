#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"
mkdir -p outputs-tmp

cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// 1. Add the import.
if (!s.includes("computeTeamClassStandings")) {
  s = s.replace(
    `import { computeDriverStandings } from "@/lib/standings";`,
    `import { computeDriverStandings, computeTeamClassStandings } from "@/lib/standings";`
  );
}

// 2. Add teamClasses fetch + isTeamEventSeason flag right after `if (!season ...) notFound();`
if (!s.includes("const teamClasses")) {
  s = s.replace(
    `  if (!season || season.league.slug !== slug) notFound();`,
    `  if (!season || season.league.slug !== slug) notFound();

  const teamClasses = await computeTeamClassStandings(prisma, seasonId);
  const isTeamEventSeason = teamClasses.length > 0;`
  );
}

// 3. Insert "Class podiums" section right after </SeasonHero>.
if (!s.includes("Class podiums")) {
  s = s.replace(
    /(\/\>)\s*\n(\s*<section>\s*\n\s*<h2[^>]*>\s*Race calendar)/,
    `$1

      {isTeamEventSeason && (
        <section>
          <h2 className="mb-3 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Class podiums
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {teamClasses.map((g) => (
              <div key={g.carClassId} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{g.carClassShortCode}</span>
                  <span className="font-display text-base font-semibold">{g.carClassName}</span>
                </div>
                <ol className="space-y-1.5 text-sm">
                  {g.teams.slice(0, 3).map((t, i) => (
                    <li
                      key={t.teamId}
                      className="flex items-center justify-between gap-2 rounded px-2 py-1.5"
                      style={{
                        background:
                          i === 0
                            ? "linear-gradient(to right, rgba(234,179,8,0.18), transparent)"
                            : i === 1
                              ? "linear-gradient(to right, rgba(161,161,170,0.20), transparent)"
                              : "linear-gradient(to right, rgba(180,83,9,0.18), transparent)",
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold">
                          {i + 1}
                        </span>
                        <span className="font-medium">{t.teamName}</span>
                      </span>
                      <span className="text-xs font-semibold tabular-nums text-zinc-300">{t.totalPoints} pts</span>
                    </li>
                  ))}
                  {g.teams.length === 0 && (
                    <li className="text-xs text-zinc-500">No team finishes yet.</li>
                  )}
                </ol>
                {g.teams.length > 3 && (
                  <p className="mt-2 text-right text-xs text-zinc-500">+{g.teams.length - 3} more</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

$2`
  );
}

// 4. Replace the Roster section: hide for IEC, replace with Teams-by-class summary.
const rosterBefore = `      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Roster ({season.registrations.length} approved)
        </h2>`;
const rosterAfter = `      {!isTeamEventSeason && (
      <section>
        <h2 className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Roster ({season.registrations.length} approved)
        </h2>`;

if (!s.includes("{!isTeamEventSeason && (\n      <section>\n        <h2 className=\"mb-1.5 font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500\">\n          Roster")) {
  if (!s.includes(rosterBefore)) { console.error("Roster anchor not found."); process.exit(1); }
  s = s.replace(rosterBefore, rosterAfter);
}

// Find the closing `</section>` of the roster (the one right before the final `</div>`)
// and add the closing `)}` for the conditional. The roster section is the LAST section
// in the original file, so we look for the LAST `</section>` and add the closing.
{
  const lastSectionClose = s.lastIndexOf("</section>");
  if (lastSectionClose === -1) { console.error("No </section> found."); process.exit(1); }
  // Insert the closing only if not already there.
  const tail = s.slice(lastSectionClose);
  if (!tail.startsWith("</section>\n      )}")) {
    s = s.slice(0, lastSectionClose) + "</section>\n      )}" + s.slice(lastSectionClose + "</section>".length);
  }
}

// 5. Insert a "Teams by class" full-table section for IEC, just before the closing
//    of the roster conditional (i.e., right where roster used to be). Place it
//    AFTER the roster conditional we just wrapped, so it shows when team-event mode is on.
if (!s.includes("Teams by class")) {
  const insertAnchor = `      {!isTeamEventSeason && (\n      <section>`;
  const teamsByClassBlock = `      {isTeamEventSeason && (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
              Teams by class
            </h2>
            <Link
              href={\`/leagues/\${slug}/seasons/\${seasonId}/standings\`}
              className="text-xs text-orange-400 hover:underline"
            >
              View full standings →
            </Link>
          </div>
          {teamClasses.map((g) => (
            <details key={g.carClassId} open className="rounded border border-zinc-800 bg-zinc-900/50">
              <summary className="flex cursor-pointer items-center justify-between gap-3 px-4 py-3 hover:bg-zinc-900">
                <span className="flex items-center gap-3">
                  <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300">{g.carClassShortCode}</span>
                  <span className="font-display text-base font-semibold">{g.carClassName}</span>
                  <span className="text-xs text-zinc-500">({g.teams.length} team{g.teams.length === 1 ? "" : "s"})</span>
                </span>
              </summary>
              <div className="border-t border-zinc-800">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wider text-zinc-500">
                    <tr>
                      <th className="px-3 py-2 w-10">Pos</th>
                      <th className="px-3 py-2">Team</th>
                      <th className="px-3 py-2 text-right">Best</th>
                      <th className="px-3 py-2 text-right">Rounds</th>
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
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{t.totalPoints}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          ))}
        </section>
      )}
`;
  s = s.replace(insertAnchor, teamsByClassBlock + insertAnchor);
}

fs.writeFileSync(FILE, s);
console.log("Season page: IEC team-only view wired (class podiums + teams-by-class tables; roster hidden).");
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
git commit -m "Season page: for team-event seasons (IEC), hide driver roster + show class podiums + teams-by-class tables"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
