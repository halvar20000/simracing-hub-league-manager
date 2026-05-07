#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

PICKER_FILE=$(find src -name 'InvolvedDriversPicker*' | head -1)
echo "Picker: $PICKER_FILE"

# ============================================================================
# 1. Rewrite picker to show team-level checkboxes when teamMode
# ============================================================================
echo ""
echo "=== 1. Rewrite InvolvedDriversPicker for team-only mode ==="
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

  // ---- Solo mode: drivers list ----
  const visibleDrivers = useMemo(() => {
    if (teamMode) return [];
    const q = query.trim().toLowerCase();
    return drivers
      .filter((d) => d.registrationId !== excludeRegistrationId)
      .filter((d) => {
        if (!q) return true;
        const dn = `${d.firstName ?? ""} ${d.lastName ?? ""}`.toLowerCase();
        const num = d.startNumber != null ? String(d.startNumber) : "";
        return dn.includes(q) || num.includes(q);
      })
      .sort((a, b) => {
        const an = a.startNumber ?? 9999;
        const bn = b.startNumber ?? 9999;
        if (an !== bn) return an - bn;
        return (a.lastName ?? "").localeCompare(b.lastName ?? "");
      });
  }, [drivers, query, excludeRegistrationId, teamMode]);

  // ---- Team mode: aggregate by team ----
  const visibleTeams = useMemo(() => {
    if (!teamMode) return [];
    const q = query.trim().toLowerCase();
    const map = new Map<
      string,
      { teamId: string; teamName: string; memberRegIds: string[] }
    >();
    for (const d of drivers) {
      if (d.registrationId === excludeRegistrationId) continue;
      const teamId = d.teamId ?? "__no_team__";
      const teamName = d.teamName ?? "(No team)";
      const existing = map.get(teamId);
      if (existing) {
        existing.memberRegIds.push(d.registrationId);
      } else {
        map.set(teamId, { teamId, teamName, memberRegIds: [d.registrationId] });
      }
    }
    let arr = [...map.values()];
    if (q) arr = arr.filter((t) => t.teamName.toLowerCase().includes(q));
    arr.sort((a, b) => a.teamName.localeCompare(b.teamName));
    return arr;
  }, [drivers, query, excludeRegistrationId, teamMode]);

  // Map of selected (teamId or driver regId) -> registration IDs to submit
  const submitRegIds = useMemo(() => {
    if (!teamMode) {
      return [...selected]; // each selected key IS already a registrationId
    }
    const ids: string[] = [];
    for (const teamId of selected) {
      const t = visibleTeams.find((x) => x.teamId === teamId);
      if (t) ids.push(...t.memberRegIds);
    }
    return ids;
  }, [selected, teamMode, visibleTeams]);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        placeholder={
          teamMode ? "Search by team name…" : "Search by name or start number…"
        }
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
      />

      <div className="max-h-64 overflow-y-auto rounded border border-zinc-800 bg-zinc-950">
        {teamMode ? (
          visibleTeams.length === 0 ? (
            <p className="px-3 py-3 text-sm text-zinc-500">No teams match.</p>
          ) : (
            <ul className="divide-y divide-zinc-800">
              {visibleTeams.map((t) => {
                const isOn = selected.has(t.teamId);
                return (
                  <li key={t.teamId}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-zinc-900">
                      <input
                        type="checkbox"
                        checked={isOn}
                        onChange={() => toggle(t.teamId)}
                        className="h-4 w-4 accent-orange-500"
                      />
                      <span className="flex-1 text-sm font-semibold text-zinc-200">
                        {t.teamName}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {t.memberRegIds.length} driver
                        {t.memberRegIds.length === 1 ? "" : "s"}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )
        ) : visibleDrivers.length === 0 ? (
          <p className="px-3 py-3 text-sm text-zinc-500">No drivers match.</p>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {visibleDrivers.map((d) => {
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
                    <span className="w-10 text-right text-xs text-zinc-500">
                      {d.startNumber != null ? `#${d.startNumber}` : "—"}
                    </span>
                    <span className="text-base">{flagFor(d.countryCode)}</span>
                    <span className="flex-1 text-sm text-zinc-200">
                      {d.firstName} {d.lastName}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <p className="text-xs text-zinc-500">
        {teamMode ? (
          <>
            {selected.size} team{selected.size === 1 ? "" : "s"} selected
            {selected.size > 0 &&
              ` — all members (${submitRegIds.length} driver${submitRegIds.length === 1 ? "" : "s"}) will be tagged as ACCUSED.`}
          </>
        ) : (
          <>
            {selected.size} driver{selected.size === 1 ? "" : "s"} selected
            {selected.size > 0 &&
              " — they will be tagged as ACCUSED on the report."}
          </>
        )}
      </p>

      {submitRegIds.map((id) => (
        <input key={id} type="hidden" name={name} value={id} />
      ))}
    </div>
  );
}
TSX
echo "  Rewritten."

# ============================================================================
# 2. Update report page label "Other driver(s) involved" → conditional
# ============================================================================
echo ""
echo "=== 2. Patch report page label ==="
node -e "
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/rounds/[roundId]/report/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;
s = s.replace(
  /Other driver\(s\) involved/,
  '{seasonForFlag?.teamRegistration ? \"Other team(s) involved\" : \"Other driver(s) involved\"}'
);
if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
"

echo ""
echo "-- Verify --"
grep -n 'teamMode\|Other driver\|Other team\|seasonForFlag' src/app/leagues/\[slug\]/seasons/\[seasonId\]/rounds/\[roundId\]/report/page.tsx | head -10
echo ""
grep -n 'visibleTeams\|memberRegIds\|submitRegIds' "$PICKER_FILE" | head -10

echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Report form: team-mode shows team-only checkboxes; label says 'Other team(s) involved'; submits all team members as ACCUSED"
git push

echo ""
echo "Done."
