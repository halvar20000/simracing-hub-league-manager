#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. Create /incidents public page
# ============================================================================
echo "=== 1. Create /incidents page ==="
mkdir -p src/app/incidents
PAGE='src/app/incidents/page.tsx'
if [ -f "$PAGE" ]; then
  echo "  Already exists — leaving alone."
else
cat > "$PAGE" <<'TSX'
import type { Metadata } from "next";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { pageMetadata } from "@/lib/og";
import { formatDateTime } from "@/lib/date";

export const metadata: Metadata = pageMetadata({
  title: "Incident Reports",
  description:
    "All incident reports submitted across CAS leagues — grouped by league, sorted by most recent.",
  url: "/incidents",
});

const STATUS_TONE: Record<string, string> = {
  SUBMITTED: "bg-amber-900/40 text-amber-200",
  UNDER_REVIEW: "bg-blue-900/40 text-blue-200",
  DECIDED: "bg-emerald-900/40 text-emerald-200",
  DISMISSED: "bg-zinc-800 text-zinc-400",
  WITHDRAWN: "bg-zinc-800 text-zinc-500",
};

export default async function PublicIncidentsList() {
  const reports = await prisma.incidentReport.findMany({
    include: {
      round: {
        include: {
          season: {
            include: { league: true },
          },
        },
      },
      reporterUser: true,
      reporterRegistration: { include: { team: { select: { name: true } } } },
      involvedDrivers: {
        where: { role: "ACCUSED" },
        include: {
          registration: {
            include: {
              user: true,
              team: { select: { name: true } },
            },
          },
        },
      },
      decision: { select: { verdict: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  // Group by league
  type Group = {
    leagueId: string;
    leagueName: string;
    leagueSlug: string;
    reports: typeof reports;
  };
  const byLeague = new Map<string, Group>();
  for (const r of reports) {
    const lg = r.round.season.league;
    const existing = byLeague.get(lg.id);
    if (existing) {
      existing.reports.push(r);
    } else {
      byLeague.set(lg.id, {
        leagueId: lg.id,
        leagueName: lg.name,
        leagueSlug: lg.slug,
        reports: [r],
      });
    }
  }
  const groups = [...byLeague.values()].sort((a, b) =>
    a.leagueName.localeCompare(b.leagueName)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Incident Reports</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {reports.length} report{reports.length === 1 ? "" : "s"} across{" "}
          {groups.length} league{groups.length === 1 ? "" : "s"}.
        </p>
      </div>

      {groups.length === 0 ? (
        <p className="rounded border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">
          No reports filed yet.
        </p>
      ) : (
        groups.map((g) => (
          <section key={g.leagueId}>
            <h2 className="mb-2 font-display text-base font-semibold tracking-wide">
              {g.leagueName}
            </h2>
            <div className="overflow-x-auto rounded border border-zinc-800">
              <table className="w-full text-sm">
                <thead className="bg-zinc-900 text-left text-zinc-400">
                  <tr>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Round</th>
                    <th className="px-3 py-2">Reporter</th>
                    <th className="px-3 py-2">Accused</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Verdict</th>
                    <th className="px-3 py-2 text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.reports.map((r) => {
                    const teamMode = !!r.round.season.teamRegistration;

                    const reporterLabel = teamMode
                      ? r.reporterRegistration?.team?.name ??
                        `${r.reporterUser.firstName ?? ""} ${r.reporterUser.lastName ?? ""}`.trim()
                      : `${r.reporterUser.firstName ?? ""} ${r.reporterUser.lastName ?? ""}`.trim();

                    let accusedLabel: string;
                    if (teamMode) {
                      const teams = new Set<string>();
                      for (const d of r.involvedDrivers) {
                        const t = d.registration.team?.name;
                        if (t) teams.add(t);
                      }
                      accusedLabel =
                        teams.size === 0
                          ? "—"
                          : [...teams].join(", ");
                    } else {
                      const names = r.involvedDrivers.map((d) =>
                        `${d.registration.user.firstName ?? ""} ${d.registration.user.lastName ?? ""}`.trim()
                      );
                      accusedLabel = names.length === 0 ? "—" : names.join(", ");
                    }

                    return (
                      <tr
                        key={r.id}
                        className="border-t border-zinc-800 hover:bg-zinc-900"
                      >
                        <td className="px-3 py-2 text-xs text-zinc-400">
                          {formatDateTime(r.submittedAt)}
                        </td>
                        <td className="px-3 py-2">
                          <span className="text-zinc-500">
                            {r.round.season.name} {r.round.season.year}
                          </span>{" "}
                          · R{r.round.roundNumber} {r.round.name}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {reporterLabel || "—"}
                        </td>
                        <td className="px-3 py-2 text-zinc-300">
                          {accusedLabel}
                        </td>
                        <td className="px-3 py-2">
                          <span
                            className={`inline-block rounded px-2 py-0.5 text-xs ${
                              STATUS_TONE[r.status] ?? STATUS_TONE.SUBMITTED
                            }`}
                          >
                            {r.status.replace(/_/g, " ")}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-zinc-400">
                          {r.decision?.verdict
                            ? r.decision.verdict.replace(/_/g, " ")
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <Link
                            href={`/reports/${r.id}`}
                            className="text-orange-400 hover:underline"
                          >
                            Open →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        ))
      )}
    </div>
  );
}
TSX
  echo "  Created."
fi

# ============================================================================
# 2. Add "Incidents" link to top nav
# ============================================================================
echo ""
echo "=== 2. Add Incidents link to nav ==="
node -e "
const fs = require('fs');
const FILE = 'src/components/nav.tsx';
let s = fs.readFileSync(FILE, 'utf8');
if (s.includes('href=\"/incidents\"')) {
  console.log('  Already linked.');
  process.exit(0);
}
const before = s;
s = s.replace(
  /<NavLink href=\"\/rosters\">Rosters<\/NavLink>/,
  '<NavLink href=\"/rosters\">Rosters</NavLink>\n          <NavLink href=\"/incidents\">Incidents</NavLink>'
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
ls -la src/app/incidents/page.tsx
grep -n 'href=\"/rosters\"\|href=\"/incidents\"' src/components/nav.tsx | head -5

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
git commit -m "Public: top-level /incidents page listing all reports grouped by league + 'Incidents' link in top nav"
git push

echo ""
echo "Done."
