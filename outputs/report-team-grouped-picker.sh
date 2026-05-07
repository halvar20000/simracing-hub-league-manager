#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 0. Find the picker file
# ============================================================================
PICKER_FILE=$(find src -name 'InvolvedDriversPicker*' | head -1)
if [ -z "$PICKER_FILE" ]; then
  echo "Could not find InvolvedDriversPicker file."
  exit 1
fi
echo "Picker file: $PICKER_FILE"

# ============================================================================
# 1. Rewrite the picker with team support
# ============================================================================
echo ""
echo "=== 1. Rewrite InvolvedDriversPicker ==="
cat > "$PICKER_FILE" <<'TSX'
"use client";

import { useMemo, useState } from "react";

export interface Driver {
  registrationId: string;
  startNumber: number | null;
  firstName: string | null;
  lastName: string | null;
  countryCode: string | null;
  teamId?: string | null;
  teamName?: string | null;
}

function flagFor(code: string | null): string {
  if (!code || code.length !== 2) return "";
  const cps = [...code.toUpperCase()].map(
    (c) => 0x1f1e6 + c.charCodeAt(0) - 65
  );
  return String.fromCodePoint(...cps);
}

export function InvolvedDriversPicker({
  drivers,
  excludeRegistrationId,
  name = "involvedRegistrationIds",
  teamMode = false,
}: {
  drivers: Driver[];
  excludeRegistrationId?: string;
  name?: string;
  teamMode?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => d.registrationId !== excludeRegistrationId)
      .filter((d) => {
        if (!q) return true;
        const name = `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase();
        const num = d.startNumber != null ? String(d.startNumber) : "";
        const team = (d.teamName ?? "").toLowerCase();
        return name.includes(q) || num.includes(q) || team.includes(q);
      })
      .sort((a, b) => {
        if (teamMode) {
          const at = a.teamName ?? "~";
          const bt = b.teamName ?? "~";
          const tcmp = at.localeCompare(bt);
          if (tcmp !== 0) return tcmp;
        }
        const an = a.startNumber ?? 9999;
        const bn = b.startNumber ?? 9999;
        if (an !== bn) return an - bn;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }, [drivers, query, excludeRegistrationId, teamMode]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Group by team when teamMode is on
  const grouped = useMemo(() => {
    if (!teamMode) return null;
    const map = new Map<string, Driver[]>();
    for (const d of visible) {
      const key = d.teamName ?? "(No team)";
      const arr = map.get(key);
      if (arr) arr.push(d);
      else map.set(key, [d]);
    }
    return [...map.entries()];
  }, [teamMode, visible]);

  function renderRow(d: Driver) {
    const isOn = selected.has(d.registrationId);
    return (
      <li key={d.registrationId}>
        <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
          <input
            type="checkbox"
            checked={isOn}
            onChange={() => toggle(d.registrationId)}
            className="h-4 w-4 accent-orange-500"
          />
          {!teamMode && (
            <span className="w-10 text-right text-xs text-zinc-500">
              {d.startNumber != null ? `#${d.startNumber}` : "—"}
            </span>
          )}
          <span className="text-base">{flagFor(d.countryCode)}</span>
          <span className="flex-1 text-sm text-zinc-200">
            {d.firstName} {d.lastName}
          </span>
        </label>
      </li>
    );
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={
          teamMode
            ? "Search by team or driver name…"
            : "Search by name or start number…"
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />
      <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {visible.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">No drivers match.</p>
        ) : teamMode && grouped ? (
          <div className="divide-y divide-zinc-800">
            {grouped.map(([teamName, members]) => (
              <div key={teamName}>
                <div className="bg-zinc-900/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
                  {teamName}
                </div>
                <ul>{members.map(renderRow)}</ul>
              </div>
            ))}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">{visible.map(renderRow)}</ul>
        )}
      </div>
      <p className="text-xs text-zinc-500">
        {selected.size} driver{selected.size === 1 ? "" : "s"} selected
        {selected.size > 0 && " — they will be tagged as ACCUSED on the report."}
      </p>
      {[...selected].map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
TSX
echo "  Rewritten."

# ============================================================================
# 2. Update report page: include team in roster + pass teamMode to picker
# ============================================================================
echo ""
echo "=== 2. Patch report page ==="
cat > /tmp/lm_patch_report_page.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add team to roster query include
s = s.replace(
  /const roster = await prisma\.registration\.findMany\(\{\s*\n\s*where: \{ seasonId, status: "APPROVED" \},\s*\n\s*include: \{\s*\n\s*user: \{\s*\n\s*select: \{\s*\n\s*firstName: true,\s*\n\s*lastName: true,\s*\n\s*countryCode: true,\s*\n\s*\},\s*\n\s*\},\s*\n\s*\},\s*\n\s*orderBy: \[\{ startNumber: "asc" \}\],\s*\n\s*\}\);/,
  `const roster = await prisma.registration.findMany({
    where: { seasonId, status: "APPROVED" },
    include: {
      user: {
        select: {
          firstName: true,
          lastName: true,
          countryCode: true,
        },
      },
      team: { select: { id: true, name: true } },
    },
    orderBy: [{ startNumber: "asc" }],
  });`
);

// (b) Add team fields to driverChoices map
s = s.replace(
  /const driverChoices = roster\.map\(\(r\) => \(\{\s*\n\s*registrationId: r\.id,\s*\n\s*startNumber: r\.startNumber,\s*\n\s*firstName: r\.user\.firstName,\s*\n\s*lastName: r\.user\.lastName,\s*\n\s*countryCode: r\.user\.countryCode,\s*\n\s*\}\)\);/,
  `const driverChoices = roster.map((r) => ({
    registrationId: r.id,
    startNumber: r.startNumber,
    firstName: r.user.firstName,
    lastName: r.user.lastName,
    countryCode: r.user.countryCode,
    teamId: r.team?.id ?? null,
    teamName: r.team?.name ?? null,
  }));`
);

// (c) Need season.teamRegistration. The page already loads season — add a
// flag computation, or we look it up where needed. Try to find where season
// is fetched.
//
// Then pass teamMode={season.teamRegistration} to the picker.
s = s.replace(
  /<InvolvedDriversPicker\s*\n\s*drivers=\{driverChoices\}\s*\n\s*excludeRegistrationId=\{reporterReg\.id\}\s*\n\s*\/>/,
  `<InvolvedDriversPicker
            drivers={driverChoices}
            excludeRegistrationId={reporterReg.id}
            teamMode={!!season?.teamRegistration}
          />`
);

if (s === before) {
  console.error('  No edits made — paste the season-fetch lines so I can target precisely.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_report_page.js

# ============================================================================
# 3. Verify
# ============================================================================
echo ""
echo "=== 3. Verify ==="
echo "-- picker --"
grep -n 'teamMode\|teamName\|grouped' "$PICKER_FILE" | head -10
echo ""
echo "-- report page --"
grep -n 'team:\|teamId\|teamName\|teamMode' 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx' | head -10

# ============================================================================
# 4. TS check
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Report form: group involved-driver picker by team for team-mode seasons (IEC); solo seasons unchanged"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, on /leagues/cas-iec/seasons/<id>/rounds/<id>/report:"
echo "  • Search box hint: 'Search by team or driver name…'"
echo "  • Driver list rendered with team headers:"
echo "      TEAM ALPHA"
echo "        🇦🇹 John Doe"
echo "        🇩🇪 Jane Smith"
echo "      TEAM BRAVO"
echo "        🇫🇷 Mike Johnson"
echo "        ..."
echo "  • No start number column (irrelevant in team racing)"
echo ""
echo "Solo season report forms (GT3 WCT etc.) keep the existing flat layout."
