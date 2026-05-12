#!/usr/bin/env bash
# Add CountryFlag to every remaining driver-listing view:
#  - Round page: ResultsTable, CombinedMultiRaceTable, TeamView, RoundPodium
#  - Admin round page: ResultRow header
#  - Public season page: roster table
#  - Admin teams page: expanded driver list
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp

# ---------------------------------------------------------------
# 1) RoundPodium component: add countryCode to type + render in card
# ---------------------------------------------------------------
cat > outputs-tmp/podium.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/components/RoundPodium.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Add countryCode field to PodiumDriver
const typeBefore = "  startNumber: number | null;\n  teamName: string | null;";
const typeAfter  = "  startNumber: number | null;\n  countryCode: string | null;\n  teamName: string | null;";
if (!s.includes("countryCode: string | null;")) {
  if (!s.includes(typeBefore)) { console.error("podium type anchor missing"); process.exit(1); }
  s = s.replace(typeBefore, typeAfter);
  console.log("podium: added countryCode to type.");
}

// (b) Add CountryFlag import + render before the name in the card
if (!s.includes('CountryFlag')) {
  s = s.replace(
    'import React from "react";',
    'import React from "react";\nimport { CountryFlag } from "./CountryFlag";'
  );
}
const nameBefore = '          {name || "—"}\n        </div>';
const nameAfter  = '          <CountryFlag code={driver.countryCode} />\n          {name || "—"}\n        </div>';
if (!s.includes('<CountryFlag code={driver.countryCode}')) {
  if (!s.includes(nameBefore)) { console.warn("podium name anchor not found"); }
  else {
    s = s.replace(nameBefore, nameAfter);
    console.log("podium: flag added to card.");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/podium.mjs

# ---------------------------------------------------------------
# 2) Public round page: pass countryCode to podium + add flag to tables
# ---------------------------------------------------------------
cat > outputs-tmp/round-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Pass countryCode in the podium computation (right after startNumber)
const podiumComputeBefore = "        startNumber: sample.registration.startNumber,\n        teamName: sample.registration.team?.name ?? null,";
const podiumComputeAfter  = "        startNumber: sample.registration.startNumber,\n        countryCode: sample.registration.user.countryCode ?? null,\n        teamName: sample.registration.team?.name ?? null,";
if (!s.includes("countryCode: sample.registration.user.countryCode ?? null,")) {
  if (!s.includes(podiumComputeBefore)) { console.warn("podium compute anchor missing"); }
  else {
    s = s.replace(podiumComputeBefore, podiumComputeAfter);
    console.log("round page: podium now passes countryCode.");
  }
}

// (b) ResultsTable driver cell — wrap with flag
const cellOld = `<td
                  className={\`px-3 py-2 \${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                >
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}`;
const cellNew = `<td
                  className={\`px-3 py-2 \${r.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                >
                  <CountryFlag code={r.registration.user.countryCode} />
                  {r.registration.user.firstName}{" "}
                  {r.registration.user.lastName}`;
if (!s.includes("<CountryFlag code={r.registration.user.countryCode} />")) {
  if (s.includes(cellOld)) {
    s = s.replace(cellOld, cellNew);
    console.log("round page: ResultsTable flag added.");
  } else {
    console.warn("round page: ResultsTable cell anchor not found");
  }
}

// (c) CombinedMultiRaceTable driver cell — wrap with flag
const ccOld = `<td
                  className={\`px-3 py-2 \${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                >
                  {sample.registration.user.firstName}{" "}
                  {sample.registration.user.lastName}`;
const ccNew = `<td
                  className={\`px-3 py-2 \${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                >
                  <CountryFlag code={sample.registration.user.countryCode} />
                  {sample.registration.user.firstName}{" "}
                  {sample.registration.user.lastName}`;
if (!s.includes("<CountryFlag code={sample.registration.user.countryCode} />")) {
  if (s.includes(ccOld)) {
    s = s.replace(ccOld, ccNew);
    console.log("round page: CombinedMultiRaceTable flag added.");
  } else {
    console.warn("round page: CombinedMultiRaceTable anchor not found");
  }
}

// (d) TeamView driver cell — wrap with flag
const tvOld = `<td
                      className={\`px-3 py-1.5 \${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                    >
                      {sample.registration.user.firstName}{" "}
                      {sample.registration.user.lastName}`;
const tvNew = `<td
                      className={\`px-3 py-1.5 \${sample.registration.excludedAt ? "text-zinc-500 line-through decoration-red-500/60" : ""}\`}
                    >
                      <CountryFlag code={sample.registration.user.countryCode} />
                      {sample.registration.user.firstName}{" "}
                      {sample.registration.user.lastName}`;
// Skip if already present (we keyed off the smaller td className above which differs from this one)
if (!s.includes(tvNew)) {
  if (s.includes(tvOld)) {
    s = s.replace(tvOld, tvNew);
    console.log("round page: TeamView flag added.");
  } else {
    console.warn("round page: TeamView anchor not found");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/round-page.mjs

# ---------------------------------------------------------------
# 3) Admin round page: widen reg type + flag in ResultRow header
# ---------------------------------------------------------------
cat > outputs-tmp/admin-round.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Widen inline user type to include countryCode
const userTypeRe = /user:\s*\{\s*firstName:\s*string \| null;\s*lastName:\s*string \| null\s*\}/g;
const matches = s.match(userTypeRe) ?? [];
let widened = 0;
for (const m of matches) {
  const replacement = "user: { firstName: string | null; lastName: string | null; countryCode: string | null }";
  if (!s.includes(replacement)) {
    s = s.replace(m, replacement);
    widened++;
  }
}
if (widened > 0) console.log(`admin round: widened ${widened} user type(s).`);

// (b) Import CountryFlag
if (!s.includes('from "@/components/CountryFlag"')) {
  s = s.replace(
    'import { pullResultsFromIRLM }',
    'import { CountryFlag } from "@/components/CountryFlag";\nimport { pullResultsFromIRLM }'
  );
}

// (c) Add flag in ResultRow header before driver name
const before = "{reg.user.firstName} {reg.user.lastName}";
const after = "<CountryFlag code={reg.user.countryCode} />{reg.user.firstName} {reg.user.lastName}";
if (!s.includes("<CountryFlag code={reg.user.countryCode}")) {
  if (s.includes(before)) {
    s = s.replace(before, after);
    console.log("admin round: flag added to ResultRow header.");
  } else {
    console.warn("admin round: header anchor not found");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/admin-round.mjs

# ---------------------------------------------------------------
# 4) Public season page roster: add flag
# ---------------------------------------------------------------
cat > outputs-tmp/season-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('from "@/components/CountryFlag"')) {
  s = s.replace(
    'import { SeasonHero } from "@/components/SeasonHero";',
    'import { SeasonHero } from "@/components/SeasonHero";\nimport { CountryFlag } from "@/components/CountryFlag";'
  );
}

const before = `<td className="px-3 py-2 font-medium">
                      {r.user.firstName} {r.user.lastName}
                    </td>`;
const after = `<td className="px-3 py-2 font-medium">
                      <CountryFlag code={r.user.countryCode} />
                      {r.user.firstName} {r.user.lastName}
                    </td>`;
if (!s.includes("<CountryFlag code={r.user.countryCode}")) {
  if (s.includes(before)) {
    s = s.replace(before, after);
    console.log("season page: flag added to roster.");
  } else {
    console.warn("season page: roster anchor not found");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/season-page.mjs

# ---------------------------------------------------------------
# 5) Admin teams page: add flag in expanded driver list
# ---------------------------------------------------------------
cat > outputs-tmp/admin-teams.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/admin/teams/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

if (!s.includes('from "@/components/CountryFlag"')) {
  s = s.replace(
    'import { prisma } from "@/lib/prisma";',
    'import { prisma } from "@/lib/prisma";\nimport { CountryFlag } from "@/components/CountryFlag";'
  );
}

const before = `<td className="px-3 py-1.5">
                          {reg.user.firstName} {reg.user.lastName}
                        </td>`;
const after = `<td className="px-3 py-1.5">
                          <CountryFlag code={reg.user.countryCode} />
                          {reg.user.firstName} {reg.user.lastName}
                        </td>`;
if (!s.includes("<CountryFlag code={reg.user.countryCode}")) {
  if (s.includes(before)) {
    s = s.replace(before, after);
    console.log("admin teams: flag added.");
  } else {
    console.warn("admin teams: anchor not found");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/admin-teams.mjs

rm -rf outputs-tmp

git add -A
git commit -m "Country flags everywhere: round page (results/multi-race/team/podium), admin round, season roster, admin teams"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
