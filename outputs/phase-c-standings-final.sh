#!/usr/bin/env bash
# Phase C: 4-button audience toggle (Combined / Pro / Am / Team) on the
# standings page, layered with the existing List / Race-by-race format toggle.
# Each section becomes mutually exclusive so the page shows exactly one
# audience at a time.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx'

mkdir -p outputs-tmp
cat > outputs-tmp/patch-standings-final.mjs <<'EOF'
import fs from "node:fs";
const PAGE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// ---------------------------------------------------------------
// 1. Extend searchParams to include cls, parse it.
// ---------------------------------------------------------------
s = s.replace(
  /searchParams: Promise<\{ view\?: string \}>;/,
  "searchParams: Promise<{ view?: string; cls?: string }>;"
);
s = s.replace(
  /const \{ view: viewRaw \} = await searchParams;/,
  "const { view: viewRaw, cls: clsRaw } = await searchParams;"
);

const viewParseLine =
  `const view: ViewMode = viewRaw === "races" ? "races" : "list";`;
const augmented =
  viewParseLine +
  `\n  type Cls = "combined" | "pro" | "am" | "team";` +
  `\n  const cls: Cls =` +
  `\n    clsRaw === "pro" ? "pro" :` +
  `\n    clsRaw === "am" ? "am" :` +
  `\n    clsRaw === "team" ? "team" : "combined";` +
  `\n  const viewSuffix = view === "races" ? "&view=races" : "";` +
  `\n  const viewQuery  = view === "races" ? "?view=races" : "";`;
if (!s.includes('type Cls = "combined" | "pro" | "am" | "team";')) {
  if (!s.includes(viewParseLine)) {
    console.error("Could not find view parse anchor.");
    process.exit(1);
  }
  s = s.replace(viewParseLine, augmented);
  console.log("Added cls parsing.");
}

// ---------------------------------------------------------------
// 2. Insert audience toggle right after the format toggle.
// ---------------------------------------------------------------
const formatToggleEnd =
`<Link
            href={\`\${baseHref}?view=races\`}
            className={\`rounded px-3 py-1.5 \${view === "races" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}
          >
            Race by race
          </Link>
        </div>`;
const audienceToggle = formatToggleEnd +
  `\n\n        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">` +
  `\n          <span className="text-zinc-500">Audience:</span>` +
  `\n          <Link href={\`\${baseHref}\${viewQuery}\`} className={\`rounded px-3 py-1.5 \${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Combined</Link>` +
  `\n          {season.isMulticlass && (<>` +
  `\n            <Link href={\`\${baseHref}?cls=pro\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Pro</Link>` +
  `\n            <Link href={\`\${baseHref}?cls=am\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Am</Link>` +
  `\n          </>)}` +
  `\n          <Link href={\`\${baseHref}?cls=team\${viewSuffix}\`} className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}>Team</Link>` +
  `\n        </div>`;
if (!s.includes("Audience:")) {
  if (!s.includes(formatToggleEnd)) {
    console.error("Could not find format toggle end anchor.");
    process.exit(1);
  }
  s = s.replace(formatToggleEnd, audienceToggle);
  console.log("Inserted audience toggle.");
}

// ---------------------------------------------------------------
// 3. Wrap each section in a cls conditional so only one shows.
//
//    The Combined section starts with:
//      <section>\n        <h2 ...>Combined Driver Championship</h2>
//    We change `<section>` to `{cls === "combined" && (\n      <section>` and
//    append a corresponding `)}` at the end of the section.
// ---------------------------------------------------------------

// 3a) Combined section
const combinedSecOld =
`<section>
        <h2 className="mb-1 text-lg font-semibold">Combined Driver Championship</h2>
        <p className="mb-3 text-xs text-zinc-500">
          Race points − penalties. Participation points are not included in this view.
        </p>
        {view === "races" ? (
          <RaceByRaceTable rows={combined} kind="combined" />
        ) : (
          <DriversTable
            rows={combined}
            previousRows={previousCombined}
            kind="combined"
            showTeam
            showClass={season.isMulticlass}
          />
        )}
      </section>`;
const combinedSecNew = `{cls === "combined" && (
        ${combinedSecOld}
      )}`;
if (!s.includes('{cls === "combined" && (')) {
  if (!s.includes(combinedSecOld)) {
    console.error("Could not find Combined section anchor.");
    process.exit(1);
  }
  s = s.replace(combinedSecOld, combinedSecNew);
  console.log("Wrapped Combined section.");
}

// 3b) proAmEnabled wrapper -> split into Pro and Am sections gated by cls.
const proAmOld =
`{season.proAmEnabled && (
        <>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Pro</h2>
            {view === "races" ? (
              <RaceByRaceTable rows={proDrivers} kind="class" />
            ) : (
              <DriversTable rows={proDrivers} previousRows={previousPro} kind="class" showTeam />
            )}
          </section>
          <section>
            <h2 className="mb-1 text-lg font-semibold">Am</h2>
            {view === "races" ? (
              <RaceByRaceTable rows={amDrivers} kind="class" />
            ) : (
              <DriversTable rows={amDrivers} previousRows={previousAm} kind="class" showTeam />
            )}
          </section>
        </>
      )}`;
const proAmNew =
`{cls === "pro" && proDrivers.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Pro</h2>
          {view === "races" ? (
            <RaceByRaceTable rows={proDrivers} kind="class" />
          ) : (
            <DriversTable rows={proDrivers} previousRows={previousPro} kind="class" showTeam />
          )}
        </section>
      )}
      {cls === "am" && amDrivers.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Am</h2>
          {view === "races" ? (
            <RaceByRaceTable rows={amDrivers} kind="class" />
          ) : (
            <DriversTable rows={amDrivers} previousRows={previousAm} kind="class" showTeam />
          )}
        </section>
      )}`;
if (!s.includes('{cls === "pro" && proDrivers.length > 0 && (')) {
  if (!s.includes(proAmOld)) {
    console.error("Could not find proAm wrapper anchor.");
    process.exit(1);
  }
  s = s.replace(proAmOld, proAmNew);
  console.log("Replaced proAm wrapper with cls-gated Pro / Am sections.");
}

// 3c) carClasses.map block — only show in Combined view, not duplicated
//     when the user is on Pro or Am tabs.
const ccMapOld =
`{season.isMulticlass && season.carClasses.length > 0 &&
        season.carClasses.map((cc) => {`;
const ccMapNew =
`{cls === "combined" && season.isMulticlass && season.carClasses.length > 0 &&
        season.carClasses.map((cc) => {`;
if (s.includes(ccMapOld)) {
  s = s.replace(ccMapOld, ccMapNew);
  console.log("Gated carClasses.map by cls === 'combined'.");
} else if (s.includes(ccMapNew)) {
  console.log("carClasses.map already gated.");
} else {
  console.error("Could not find carClasses.map anchor.");
  process.exit(1);
}

// 3d) Team Championship section — only in Team view.
const teamSecOld =
`{teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>`;
const teamSecNew =
`{cls === "team" && teams.length > 0 && (
        <section>
          <h2 className="mb-1 text-lg font-semibold">Team Championship</h2>`;
if (s.includes(teamSecOld)) {
  s = s.replace(teamSecOld, teamSecNew);
  console.log("Gated Team Championship by cls === 'team'.");
} else if (s.includes(teamSecNew)) {
  console.log("Team Championship already gated.");
} else {
  console.error("Could not find Team Championship anchor.");
  process.exit(1);
}

fs.writeFileSync(PAGE, s);
console.log("Phase C complete.");
EOF
node outputs-tmp/patch-standings-final.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity check:"
grep -n 'type Cls = \|cls: Cls =\|Audience:\|cls === "combined" && (\|cls === "pro" && proDrivers\|cls === "am" && amDrivers\|cls === "team" && teams' "$PAGE" | head -15

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Standings: Combined/Pro/Am/Team audience toggle alongside format toggle"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
