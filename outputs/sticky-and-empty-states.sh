#!/usr/bin/env bash
# 1) Race-by-race standings: sticky thead + sticky Pos column.
# 2) <EmptyState> component, applied to the most common empty messages.
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components outputs-tmp

# ---------------------------------------------------------------
# 1) Sticky columns + header on the race-by-race standings table
# ---------------------------------------------------------------
cat > outputs-tmp/sticky.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) thead "bg-zinc-900 text-zinc-400" -> add sticky top.
//     Only the race-by-race thead — the DriversTable thead doesn't need sticky
//     (it's a single header row, page scroll is fine). Both have the same
//     class string, so we identify the race-by-race thead by its sibling:
//     it sits inside <table className="min-w-full text-[11px]"> while the
//     DriversTable uses text-sm. We anchor on the surrounding table tag.
const beforeA =
  '<table className="min-w-full text-[11px]">\n        <thead className="bg-zinc-900 text-zinc-400">';
const afterA =
  '<table className="min-w-full text-[11px]">\n        <thead className="sticky top-0 z-30 bg-zinc-900 text-zinc-400">';
if (s.includes("sticky top-0 z-30 bg-zinc-900 text-zinc-400")) {
  console.log("sticky thead already applied.");
} else if (!s.includes(beforeA)) {
  console.warn("(a) sticky thead anchor not found — leaving alone.");
} else {
  s = s.replace(beforeA, afterA);
  console.log("(a) sticky thead applied (race-by-race only).");
}

// (b) Body Pos cell sticky-left. The race-by-race body Pos cell is the one
// rendering <PosCell pos={idx + 1} ... />. Anchor on that.
const beforeB =
  '<td className="px-2 py-1.5 font-medium text-zinc-200 tabular-nums">\n                  <PosCell pos={idx + 1} delta={positionDelta} />\n                </td>';
const afterB =
  '<td className="sticky left-0 z-10 bg-zinc-950 px-2 py-1.5 font-medium text-zinc-200 tabular-nums">\n                  <PosCell pos={idx + 1} delta={positionDelta} />\n                </td>';
if (s.includes("sticky left-0 z-10 bg-zinc-950 px-2 py-1.5 font-medium text-zinc-200 tabular-nums")) {
  console.log("(b) sticky-left Pos cell already applied.");
} else if (!s.includes(beforeB)) {
  // Try a more permissive match — class might be slightly different
  const altBefore = /(<td className="px-2 py-1\.5 font-medium[^"]*tabular-nums">[\s\S]{0,40}<PosCell pos=\{idx \+ 1\})/;
  const m = s.match(altBefore);
  if (m) {
    s = s.replace(
      m[0],
      m[0].replace('<td className="', '<td className="sticky left-0 z-10 bg-zinc-950 ')
    );
    console.log("(b) sticky-left Pos cell applied via permissive match.");
  } else {
    console.warn("(b) sticky-left Pos cell anchor not found — leaving alone.");
  }
} else {
  s = s.replace(beforeB, afterB);
  console.log("(b) sticky-left Pos cell applied.");
}

// (c) Race-by-race header's Pos <th> already has "sticky left-0" per earlier
// dump. Just bump z-index to 40 so it sits above the new sticky-top thead's z.
const beforeC = '<th rowSpan={2} className="sticky left-0 z-10 bg-zinc-900 px-2 py-2 text-left">Pos</th>';
const afterC  = '<th rowSpan={2} className="sticky left-0 top-0 z-40 bg-zinc-900 px-2 py-2 text-left">Pos</th>';
if (s.includes(afterC)) {
  console.log("(c) Pos header already at z-40.");
} else if (!s.includes(beforeC)) {
  console.warn("(c) Pos header anchor not found — leaving alone.");
} else {
  s = s.replace(beforeC, afterC);
  console.log("(c) Pos header bumped to z-40 with sticky-top.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/sticky.mjs

# ---------------------------------------------------------------
# 2) EmptyState component
# ---------------------------------------------------------------
cat > src/components/EmptyState.tsx <<'EOF'
import Link from "next/link";
import React from "react";

export function EmptyState({
  icon,
  title,
  description,
  cta,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-700 bg-zinc-900/30 p-8 text-center">
      {icon ? (
        <div className="mx-auto mb-3 inline-block text-zinc-500">{icon}</div>
      ) : null}
      <p className="text-sm font-medium text-zinc-300">{title}</p>
      {description ? (
        <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
          {description}
        </p>
      ) : null}
      {cta ? (
        <Link
          href={cta.href}
          className="mt-4 inline-block rounded bg-[#ff6b35] px-3 py-1.5 text-xs font-medium text-zinc-950 hover:bg-[#ff8550]"
        >
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export function ChartIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 3v18h18" />
      <path d="M18 17V9" />
      <path d="M13 17V5" />
      <path d="M8 17v-3" />
    </svg>
  );
}

export function FlagIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 22V4" />
      <path d="M4 4h13l-2 5 2 5H4" />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="32"
      height="32"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
EOF
echo "Wrote src/components/EmptyState.tsx"

# ---------------------------------------------------------------
# 3) Apply EmptyState to: public round page (no results), season page
#    (no rounds, no roster), standings (DriversTable empty rows)
# ---------------------------------------------------------------
cat > outputs-tmp/empty-page-patches.mjs <<'EOF'
import fs from "node:fs";

// (a) Public round page: "No results entered yet for this round."
{
  const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
  let s = fs.readFileSync(FILE, "utf8");
  if (!s.includes("EmptyState")) {
    // Add import (after the formatDateTime import)
    s = s.replace(
      'import { formatDateTime } from "@/lib/date";',
      'import { formatDateTime } from "@/lib/date";\nimport { EmptyState, FlagIcon } from "@/components/EmptyState";'
    );
    // Replace the no-results <p>
    const before =
      '<p className="text-sm text-zinc-500">\n            No results entered yet for this round.\n          </p>';
    const after =
      '<EmptyState\n            icon={<FlagIcon />}\n            title="No results entered yet"\n            description="Once race results are imported, they will appear here."\n          />';
    if (s.includes(before)) {
      s = s.replace(before, after);
      console.log("(a) round page: no-results block -> EmptyState.");
    } else {
      console.warn("(a) round page: no-results anchor not found.");
    }
    fs.writeFileSync(FILE, s);
  }
}

// (b) Public season page: empty calendar + empty roster
{
  const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
  let s = fs.readFileSync(FILE, "utf8");
  if (!s.includes("EmptyState")) {
    s = s.replace(
      'import { computeDriverStandings } from "@/lib/standings";',
      'import { computeDriverStandings } from "@/lib/standings";\nimport { EmptyState, CalendarIcon, UsersIcon } from "@/components/EmptyState";'
    );

    // Empty roster
    const rosterBefore =
      '<p className="text-sm text-zinc-500">No approved drivers yet.</p>';
    const rosterAfter =
      '<EmptyState\n            icon={<UsersIcon />}\n            title="No approved drivers yet"\n            description="Drivers who register and are approved will show up here."\n          />';
    if (s.includes(rosterBefore)) {
      s = s.replace(rosterBefore, rosterAfter);
      console.log("(b) season page: roster empty -> EmptyState.");
    }

    // Empty calendar — replace the <tr><td colSpan={6}>No rounds scheduled yet.</td></tr>
    const calBefore =
      '<tr>\n                  <td colSpan={6} className="px-3 py-4 text-center text-zinc-500">\n                    No rounds scheduled yet.\n                  </td>\n                </tr>';
    const calAfter =
      '<tr>\n                  <td colSpan={6} className="p-0">\n                    <EmptyState\n                      icon={<CalendarIcon />}\n                      title="No rounds scheduled yet"\n                      description="Rounds will appear once the schedule is published."\n                    />\n                  </td>\n                </tr>';
    if (s.includes(calBefore)) {
      s = s.replace(calBefore, calAfter);
      console.log("(b) season page: calendar empty -> EmptyState.");
    }

    fs.writeFileSync(FILE, s);
  }
}

// (c) Standings DriversTable / RaceByRaceTable: replace the "No standings to show yet" <p>
{
  const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
  let s = fs.readFileSync(FILE, "utf8");
  if (!s.includes("EmptyState")) {
    s = s.replace(
      'import { CountryFlag } from "@/components/CountryFlag";',
      'import { CountryFlag } from "@/components/CountryFlag";\nimport { EmptyState, ChartIcon } from "@/components/EmptyState";'
    );
    // Replace ALL occurrences of the "No standings to show yet" block
    const reEmpty =
      /<p className="text-sm text-zinc-500">No standings to show yet\.<\/p>/g;
    const replacement =
      '<EmptyState icon={<ChartIcon />} title="No standings to show yet" description="Standings will appear after the first round results are imported." />';
    if (reEmpty.test(s)) {
      s = s.replace(reEmpty, replacement);
      console.log("(c) standings: empty block(s) -> EmptyState.");
    } else {
      console.warn("(c) standings: no empty-block matches.");
    }
    fs.writeFileSync(FILE, s);
  }
}

console.log("Done patching empty states.");
EOF
node outputs-tmp/empty-page-patches.mjs

rm -rf outputs-tmp

git add -A
git commit -m "Standings: sticky thead + Pos column. EmptyState component used on round/season/standings empty cases."
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy:"
echo "  - Standings race-by-race grid: header pinned to top while you scroll;"
echo "    Pos column pinned to left edge while you scroll horizontally."
echo "  - Empty round / season / standings show a card with icon + helpful text"
echo "    instead of plain grey one-liners."
