#!/usr/bin/env bash
# Phase B3: 4-button toggle (Combined / Pro / Am / Team) on the admin round
# page. Each registration row stays fully editable (the existing form).
# Team view nests rows inside expandable <details> per team.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

PAGE='src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx'

mkdir -p outputs-tmp
cat > outputs-tmp/patch-admin-toggle.mjs <<'EOF'
import fs from "node:fs";
const PAGE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(PAGE, "utf8");

// 1) Extend searchParams type to include cls.
s = s.replace(
  /searchParams: Promise<\{ imported\?: string; skipped\?: string \}>;/,
  "searchParams: Promise<{ imported?: string; skipped?: string; cls?: string }>;"
);

// 2) Pull cls out of searchParams alongside imported/skipped.
const oldDestruct = `const { imported, skipped } = await searchParams;`;
const newDestruct =
  `const { imported, skipped, cls: clsRaw } = await searchParams;
  type Cls = "combined" | "pro" | "am" | "team";
  const cls: Cls =
    clsRaw === "pro" ? "pro" :
    clsRaw === "am" ? "am" :
    clsRaw === "team" ? "team" : "combined";
  const baseHref = \`/admin/leagues/\${slug}/seasons/\${seasonId}/rounds/\${roundId}\`;`;
if (!s.includes('type Cls = "combined" | "pro" | "am" | "team";')) {
  if (!s.includes(oldDestruct)) {
    console.error("Could not find searchParams destructure anchor.");
    process.exit(1);
  }
  s = s.replace(oldDestruct, newDestruct);
  console.log("Admin: added cls parsing.");
}

// 3) Insert the audience toggle just before the <section>Results header.
//    We anchor on the existing <section> tag that wraps the results list.
const sectionAnchor = `<section>
        <h2 className="mb-3 text-lg font-semibold">
          Results — {registrations.length} approved driver
          {registrations.length === 1 ? "" : "s"}
        </h2>`;
const sectionWithToggle =
  `<div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">View:</span>
        <Link
          href={baseHref}
          className={\`rounded px-3 py-1.5 \${cls === "combined" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}
        >
          Combined
        </Link>
        {round.season.isMulticlass && (
          <>
            <Link
              href={\`\${baseHref}?cls=pro\`}
              className={\`rounded px-3 py-1.5 \${cls === "pro" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}
            >
              Pro
            </Link>
            <Link
              href={\`\${baseHref}?cls=am\`}
              className={\`rounded px-3 py-1.5 \${cls === "am" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}
            >
              Am
            </Link>
          </>
        )}
        <Link
          href={\`\${baseHref}?cls=team\`}
          className={\`rounded px-3 py-1.5 \${cls === "team" ? "bg-[#ff6b35] text-zinc-950" : "text-zinc-300 hover:text-zinc-100"}\`}
        >
          Team
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-lg font-semibold">
          Results — {registrations.length} approved driver
          {registrations.length === 1 ? "" : "s"}
        </h2>`;
if (!s.includes("Audience:") && !s.includes(`href={baseHref}\n          className={\`rounded px-3 py-1.5 \${cls === "combined"`)) {
  if (!s.includes(sectionAnchor)) {
    console.error("Could not find Results section anchor.");
    process.exit(1);
  }
  s = s.replace(sectionAnchor, sectionWithToggle);
  console.log("Admin: toggle inserted before Results section.");
}

// 4) Replace the existing registrations.map block with class-aware rendering.
//    The current block is:
//      <div className="space-y-3">
//        {registrations.map((reg) => (
//          <ResultRow ... />
//        ))}
//      </div>
const renderOld =
  `<div className="space-y-3">
            {registrations.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={round.season.isMulticlass}
              />
            ))}
          </div>`;
const renderNew =
  `<AdminRegList
            registrations={registrations}
            cls={cls}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            isMulticlass={round.season.isMulticlass}
          />`;
if (!s.includes("<AdminRegList")) {
  if (!s.includes(renderOld)) {
    console.error("Could not find existing registrations.map render anchor.");
    process.exit(1);
  }
  s = s.replace(renderOld, renderNew);
  console.log("Admin: render delegated to AdminRegList component.");
}

// 5) Append AdminRegList component to the end of the file (above Field
//    function so we keep helpers grouped). We append at the very end -
//    Field is already at the end and order doesn't matter for JSX exports.
if (!s.includes("function AdminRegList(")) {
  s = s.trimEnd() + `

function AdminRegList({
  registrations,
  cls,
  slug,
  seasonId,
  roundId,
  isMulticlass,
}: {
  registrations: Array<Parameters<typeof ResultRow>[0]["reg"]>;
  cls: "combined" | "pro" | "am" | "team";
  slug: string;
  seasonId: string;
  roundId: string;
  isMulticlass: boolean;
}) {
  // Class filter
  let filtered = registrations;
  if (cls === "pro") {
    filtered = registrations.filter(
      (r) => r.carClass?.shortCode === "PRO"
    );
  } else if (cls === "am") {
    filtered = registrations.filter(
      (r) => r.carClass?.shortCode === "AM"
    );
  }

  if (cls !== "team") {
    if (filtered.length === 0) {
      return (
        <p className="text-sm text-zinc-500">No drivers in this view.</p>
      );
    }
    return (
      <div className="space-y-3">
        {filtered.map((reg) => (
          <ResultRow
            key={reg.id}
            slug={slug}
            seasonId={seasonId}
            roundId={roundId}
            reg={reg}
            isMulticlass={isMulticlass}
          />
        ))}
      </div>
    );
  }

  // Team view: group by team name, expandable per team
  const byTeam = new Map<
    string,
    typeof registrations
  >();
  for (const reg of registrations) {
    const key = reg.team?.name ?? "Independent";
    const arr = byTeam.get(key);
    if (arr) arr.push(reg);
    else byTeam.set(key, [reg]);
  }
  const groups = [...byTeam.entries()].sort((a, b) =>
    a[0].localeCompare(b[0])
  );

  return (
    <div className="space-y-3">
      {groups.map(([teamName, regs]) => (
        <details
          key={teamName}
          className="overflow-hidden rounded border border-zinc-800"
          open={cls === "team"}
        >
          <summary className="flex cursor-pointer items-center gap-3 bg-zinc-900 px-3 py-2 hover:bg-zinc-800">
            <span className="flex-1 font-medium">{teamName}</span>
            <span className="text-xs text-zinc-500">
              {regs.length} {regs.length === 1 ? "driver" : "drivers"}
            </span>
          </summary>
          <div className="space-y-3 p-3">
            {regs.map((reg) => (
              <ResultRow
                key={reg.id}
                slug={slug}
                seasonId={seasonId}
                roundId={roundId}
                reg={reg}
                isMulticlass={isMulticlass}
              />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}
`;
  console.log("Admin: AdminRegList component appended.");
}

fs.writeFileSync(PAGE, s);
console.log("Patch complete.");
EOF
node outputs-tmp/patch-admin-toggle.mjs
rm -rf outputs-tmp

echo ""
echo "Sanity check:"
grep -n 'AdminRegList\|type Cls = \|cls: Cls =\|baseHref =' "$PAGE" | head -10

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Admin round page: 4-button toggle (Combined/Pro/Am/Team) with team grouping"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
