#!/usr/bin/env bash
# Phase C: add Combined / Pro / Am / Team audience toggle to the standings
# page, alongside the existing List / Race-by-race format toggle.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

mkdir -p outputs-tmp
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Extend searchParams type and read a `cls` param.
s = s.replace(
  /searchParams: Promise<\{ view\?: string \}>;/,
  "searchParams: Promise<{ view?: string; cls?: string }>;"
);
s = s.replace(
  /const \{ view: viewRaw \} = await searchParams;/,
  `const { view: viewRaw, cls: clsRaw } = await searchParams;`
);

// 2) Define Cls + parse it just under the existing view parsing.
const viewLine = `const view: ViewMode = viewRaw === "races" ? "races" : "list";`;
const augmented =
  viewLine +
  `\n  type Cls = "combined" | "pro" | "am" | "team";` +
  `\n  const cls: Cls =` +
  `\n    clsRaw === "pro" ? "pro" :` +
  `\n    clsRaw === "am" ? "am" :` +
  `\n    clsRaw === "team" ? "team" : "combined";`;
if (!s.includes('type Cls = "combined" | "pro" | "am" | "team";')) {
  s = s.replace(viewLine, augmented);
}

// 3) Inject team-standings fetch right after computeDriverStandings calls.
//    We import computeTeamStandings (already imported per the earlier dump),
//    then fetch teams for the season + a "previous" snapshot for deltas.
const importBlockOld =
  `computeDriverStandings,\n  computeTeamStandings,\n  type DriverStanding,\n  type TeamStanding,`;
// Already exists per dump — leave as-is.

const teamFetchAnchor =
  `computeDriverStandings(prisma, seasonId),`;
// Add team fetch nearby. We do it after the Promise.all that loads drivers.
// But the existing code calls computeDriverStandings twice: once for current,
// once for previous snapshot. We mirror that for teams.
//
// To keep this idempotent and safe, only add teams data if not already
// present.
if (!s.includes("computeTeamStandings(prisma, seasonId)")) {
  // Find the location where 'drivers' is declared, then append team load.
  // Simplest: replace the line `const drivers =` and add team load right
  // after it.
  const driversLine = `const [drivers, previousDrivers] = await Promise.all([`;
  const replaceWith = `const [drivers, previousDrivers, teams, previousTeams] = await Promise.all([`;
  if (!s.includes(driversLine)) {
    console.error("Could not find driver standings Promise.all anchor.");
    process.exit(1);
  }
  s = s.replace(driversLine, replaceWith);

  // The closing `]);` of that Promise.all is preceded by either:
  //   computeDriverStandings(prisma, seasonId, [latestRound.id])
  //   : Promise.resolve(null),
  // Add two more entries before the closing bracket.
  const closeAnchor =
    `      : Promise.resolve(null),\n  ]);`;
  if (!s.includes(closeAnchor)) {
    console.error("Could not find Promise.all close anchor.");
    process.exit(1);
  }
  s = s.replace(
    closeAnchor,
    `      : Promise.resolve(null),
    computeTeamStandings(prisma, seasonId),
    latestRound
      ? computeTeamStandings(prisma, seasonId, [latestRound.id])
      : Promise.resolve(null),
  ]);`
  );
  console.log("Added team standings to Promise.all.");
}

// 4) Render the audience toggle row right after the existing format toggle
//    container. The existing container is the <div> with hrefs to ?view=list
//    and ?view=races.
const formatToggleEndAnchor = `>\n            Race-by-race\n          </Link>\n        </div>`;
const audienceToggle =
  formatToggleEndAnchor +
  `\n        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">` +
  `\n          <span className="text-zinc-500">Audience:</span>` +
  `\n          <Link href={\`\${baseHref}\${view === "races" ? "?view=races" : ""}\`} className={\`rounded px-3 py-1.5 \${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Combined</Link>` +
  `\n          {season.isMulticlass && (<>` +
  `\n            <Link href={\`\${baseHref}?cls=pro\${view === "races" ? "&view=races" : ""}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>` +
  `\n            <Link href={\`\${baseHref}?cls=am\${view === "races" ? "&view=races" : ""}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>` +
  `\n          </>)}` +
  `\n          <Link href={\`\${baseHref}?cls=team\${view === "races" ? "&view=races" : ""}\`} className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Team</Link>` +
  `\n        </div>`;
if (!s.includes("Audience:")) {
  if (!s.includes(formatToggleEndAnchor)) {
    console.error("Could not find format toggle end anchor.");
    process.exit(1);
  }
  s = s.replace(formatToggleEndAnchor, audienceToggle);
  console.log("Audience toggle added under format toggle.");
}

fs.writeFileSync(PAGE, s);
console.log("Phase C scaffolding written.");
EOF

node outputs-tmp/patch-standings.mjs

echo ""
echo "Sanity check — confirm cls + audience toggle scaffolding exist:"
grep -n 'type Cls = \|cls: Cls =\|Audience:\|computeTeamStandings(prisma' "$PAGE" | head -10

echo ""
echo "Status only — DO NOT push yet. The render section still picks one of"
echo "the four datasets. Tell me what you see in the grep above and I'll send"
echo "the second half of Phase C (render-section patch)."

rm -rf outputs-tmp
