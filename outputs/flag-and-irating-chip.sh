#!/usr/bin/env bash
# Country flag + iRating chip:
#  - schema: User.countryCode String?
#  - importer: capture countryCode from iRLM result rows
#  - components: CountryFlag (emoji), IRatingChip (color-coded)
#  - standings.ts: include countryCode on DriverStanding
#  - standings page: render flag next to driver name + iRating chip
#  - simple backfill: pull-from-iRLM on each round picks up countryCode for
#    everyone who has a result. (Skipped: pre-existing users without results.)
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p src/components outputs-tmp scripts

# ---------------------------------------------------------------
# 1) Schema
# ---------------------------------------------------------------
cat > outputs-tmp/patch-schema.mjs <<'EOF'
import fs from "node:fs";
const FILE = "prisma/schema.prisma";
let s = fs.readFileSync(FILE, "utf8");
const start = s.indexOf("model User {");
const end = s.indexOf("}", start);
const block = s.slice(start, end);
if (/countryCode\s+String\?/.test(block)) {
  console.log("schema: User.countryCode already present.");
} else {
  const insert = "  countryCode     String?\n";
  s = s.slice(0, end) + insert + s.slice(end);
  fs.writeFileSync(FILE, s);
  console.log("schema: added User.countryCode.");
}
EOF
node outputs-tmp/patch-schema.mjs

echo ""
echo "=== prisma db push + generate ==="
npx prisma db push
npx prisma generate

# ---------------------------------------------------------------
# 2) iRLM importer — capture countryCode
# ---------------------------------------------------------------
cat > outputs-tmp/patch-importer.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/actions/irlm-import.ts";
let s = fs.readFileSync(FILE, "utf8");

// Insert a small block that updates User.countryCode after we resolve the
// registration. Keep it idempotent — only update when a value is present
// and differs from what we already have.
const before =
`  if (!reg) {
    return {
      ok: false,
      reason: \`no approved registration for iRacingId \${iracingCustId}\`,
    };
  }`;
const after = before + `

  // If iRLM gave us a country code and our user doesn't have one (or it
  // differs), persist it. Best-effort — failures don't break the import.
  const cc = String(row.countryCode ?? "").trim().toUpperCase();
  if (cc.length === 2) {
    try {
      await prisma.user.update({
        where: { id: reg.userId },
        data: { countryCode: cc },
      });
    } catch {
      /* ignore */
    }
  }`;
if (s.includes("// If iRLM gave us a country code")) {
  console.log("importer: countryCode capture already present.");
} else if (!s.includes(before)) {
  console.error("importer anchor not found.");
  process.exit(1);
} else {
  s = s.replace(before, after);
  fs.writeFileSync(FILE, s);
  console.log("importer: now captures countryCode.");
}
EOF
node outputs-tmp/patch-importer.mjs

# IRLMResultRow type might not include countryCode — add it
cat > outputs-tmp/patch-irlm-type.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/irlm.ts";
let s = fs.readFileSync(FILE, "utf8");
if (!/countryCode\??:/.test(s)) {
  // Insert into IRLMResultRow interface — naive: append a field if interface exists
  const ifaceIdx = s.indexOf("export interface IRLMResultRow");
  if (ifaceIdx >= 0) {
    const closeIdx = s.indexOf("}", ifaceIdx);
    s = s.slice(0, closeIdx) + "  countryCode?: string;\n" + s.slice(closeIdx);
    fs.writeFileSync(FILE, s);
    console.log("irlm.ts: IRLMResultRow now includes countryCode?: string.");
  } else {
    console.log("irlm.ts: IRLMResultRow not found, leaving alone.");
  }
} else {
  console.log("irlm.ts: countryCode already declared.");
}
EOF
node outputs-tmp/patch-irlm-type.mjs

# ---------------------------------------------------------------
# 3) Components
# ---------------------------------------------------------------
cat > src/components/CountryFlag.tsx <<'EOF'
import React from "react";

function emojiFor(code: string): string {
  if (!code || code.length !== 2) return "";
  const upper = code.toUpperCase();
  const cps = [...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  if (cps.some((cp) => cp < 0x1f1e6 || cp > 0x1f1ff)) return "";
  return String.fromCodePoint(...cps);
}

export function CountryFlag({
  code,
  className,
}: {
  code: string | null | undefined;
  className?: string;
}) {
  if (!code) return null;
  const emoji = emojiFor(code);
  if (!emoji) return null;
  return (
    <span
      title={code.toUpperCase()}
      aria-label={code.toUpperCase()}
      className={className ?? "mr-1.5 inline-block align-[-2px] text-[14px] leading-none"}
    >
      {emoji}
    </span>
  );
}
EOF
echo "Wrote src/components/CountryFlag.tsx"

cat > src/components/IRatingChip.tsx <<'EOF'
import React from "react";

// iRating tiers — pulled from common iRacing community conventions.
function tierForIRating(value: number): {
  label: string;
  className: string;
} {
  if (value < 1000)
    return { label: "Rookie", className: "bg-zinc-800 text-zinc-300 border-zinc-700" };
  if (value < 2000)
    return { label: "D", className: "bg-amber-950 text-amber-300 border-amber-800/60" };
  if (value < 3000)
    return { label: "C", className: "bg-emerald-950 text-emerald-300 border-emerald-800/60" };
  if (value < 4000)
    return { label: "B", className: "bg-sky-950 text-sky-300 border-sky-800/60" };
  if (value < 5000)
    return { label: "A", className: "bg-violet-950 text-violet-300 border-violet-800/60" };
  return { label: "Pro", className: "bg-yellow-950 text-yellow-300 border-yellow-700/60" };
}

export function IRatingChip({
  value,
  className,
}: {
  value: number | null | undefined;
  className?: string;
}) {
  if (value == null) return <span className="text-zinc-500">—</span>;
  const t = tierForIRating(value);
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] tabular-nums ${t.className} ${className ?? ""}`}
      title={`${value} iRating (${t.label})`}
    >
      <span className="font-semibold">{value}</span>
    </span>
  );
}
EOF
echo "Wrote src/components/IRatingChip.tsx"

# ---------------------------------------------------------------
# 4) standings.ts — fetch + expose countryCode on DriverStanding
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/lib/standings.ts";
let s = fs.readFileSync(FILE, "utf8");

// (a) Add countryCode to DriverStanding interface
const ifaceAnchor = "  driverLastName: string | null;";
const ifaceReplace =
  "  driverLastName: string | null;\n  countryCode: string | null;";
if (!s.includes("countryCode: string | null;")) {
  if (!s.includes(ifaceAnchor)) {
    console.error("DriverStanding interface anchor missing.");
    process.exit(1);
  }
  s = s.replace(ifaceAnchor, ifaceReplace);
  console.log("standings.ts: added countryCode to DriverStanding.");
}

// (b) Populate countryCode in the constructor (right after driverLastName)
const ctorAnchor = "      driverLastName: reg.user.lastName,";
const ctorReplace =
  "      driverLastName: reg.user.lastName,\n      countryCode: reg.user.countryCode,";
if (!s.includes("countryCode: reg.user.countryCode")) {
  if (!s.includes(ctorAnchor)) {
    console.error("DriverStanding constructor anchor missing.");
    process.exit(1);
  }
  s = s.replace(ctorAnchor, ctorReplace);
  console.log("standings.ts: constructor now sets countryCode.");
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings.mjs

# ---------------------------------------------------------------
# 5) Standings page DriversTable: render flag + iRating chip
# ---------------------------------------------------------------
cat > outputs-tmp/patch-standings-page.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// (a) Imports
const importAnchor = 'import {\n  computeDriverStandings,\n  computeTeamStandings,';
if (!s.includes('from "@/components/CountryFlag"')) {
  s = s.replace(
    importAnchor,
    'import { CountryFlag } from "@/components/CountryFlag";\nimport { IRatingChip } from "@/components/IRatingChip";\n' + importAnchor
  );
  console.log("standings page: imported CountryFlag + IRatingChip.");
}

// (b) Driver name cell — wrap with flag (this is the no-strikethrough version)
const cellOld =
  '<td className="px-3 py-2 font-medium">\n                  {r.driverFirstName} {r.driverLastName}';
const cellNew =
  '<td className="px-3 py-2 font-medium">\n                  <CountryFlag code={r.countryCode} />\n                  {r.driverFirstName} {r.driverLastName}';
if (!s.includes("<CountryFlag code={r.countryCode} />")) {
  if (!s.includes(cellOld)) {
    console.warn("standings page: driver name cell anchor not found — skipping flag insert. (Standings rendering may have been customised; review manually.)");
  } else {
    s = s.replace(cellOld, cellNew);
    console.log("standings page: flag added before driver name.");
  }
}

// (c) iRating cell — replace plain number with IRatingChip
const irOld =
  '<td className="px-3 py-2 text-right text-zinc-400 tabular-nums">\n                  {r.iRating ?? "—"}\n                </td>';
const irNew =
  '<td className="px-3 py-2 text-right">\n                  <IRatingChip value={r.iRating} />\n                </td>';
if (!s.includes("<IRatingChip value={r.iRating} />")) {
  if (!s.includes(irOld)) {
    console.warn("standings page: iRating cell anchor not found — skipping chip insert.");
  } else {
    s = s.replace(irOld, irNew);
    console.log("standings page: iRating chip applied.");
  }
}

fs.writeFileSync(FILE, s);
EOF
node outputs-tmp/patch-standings-page.mjs

rm -rf outputs-tmp

# ---------------------------------------------------------------
# 6) Recompute scoring so DriverStanding rebuilds with countryCode flowing
# ---------------------------------------------------------------
cat > scripts/recompute-all-rounds.ts <<'EOF'
import { prisma } from "@/lib/prisma";
import { recomputeRoundScoring } from "@/lib/scoring";
async function main() {
  const rounds = await prisma.round.findMany({
    where: { raceResults: { some: {} } },
    select: { id: true, roundNumber: true, season: { select: { name: true, league: { select: { slug: true } } } } },
    orderBy: [{ season: { league: { slug: "asc" } } }, { season: { name: "asc" } }, { roundNumber: "asc" }],
  });
  for (const r of rounds) {
    await recomputeRoundScoring(prisma, r.id);
    console.log(`Recomputed ${r.season.league.slug} ${r.season.name} R${r.roundNumber}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
EOF
echo ""
echo "=== Recompute (caches refresh; countryCode is null for now) ==="
npx tsx scripts/recompute-all-rounds.ts

echo ""
echo "=== Commit and push ==="
git add -A
git commit -m "Country flag + iRating chip on standings; importer captures countryCode"
git push

echo ""
echo "Done. After Vercel deploys:"
echo "  - Standings: driver names get a flag; iRating column becomes a colored chip."
echo "  - Most flags will be missing for now (countryCode is null on existing"
echo "    User rows). To populate them, click 'Pull from iRLM' on each round once;"
echo "    the importer now captures countryCode from result rows."
echo "  - Drivers in seasons that have already been pulled: re-pull rounds to"
echo "    backfill flags. Drivers who never raced won't get flags until they do."
