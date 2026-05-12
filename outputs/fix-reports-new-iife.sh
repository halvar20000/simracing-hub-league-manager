#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

mkdir -p outputs-tmp
cat > outputs-tmp/patch.mjs <<'EOF'
import fs from "node:fs";
const FILE = "src/app/reports/new/page.tsx";
let s = fs.readFileSync(FILE, "utf8");

// Replace the entire {reg.season.rounds.map((r) => (... IIFE ... ))} block
// with a block-body map that returns the JSX directly.
const before = `                <ul className="divide-y divide-zinc-800">
                  {reg.season.rounds.map((r) => (
                    {(() => {
                      const w = protestWindowState({
                        raceStartsAt: r.startsAt,
                        protestWindowHours:
                          reg.season.scoringSystem.protestWindowHours,
                      });
                      const closed = w.status === "CLOSED";
                      return (
                        <li key={r.id}>
                          <Link
                            href={\`/leagues/\${reg.season.league.slug}/seasons/\${reg.season.id}/rounds/\${r.id}/report\`}
                            className={\`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 \${
                              closed ? "opacity-60" : ""
                            }\`}
                          >
                            <span className="flex items-center gap-3">
                              <span className="w-10 text-right text-zinc-500">
                                R{r.roundNumber}
                              </span>
                              <span className="font-medium text-zinc-200">
                                {r.name}
                              </span>
                              {r.track && (
                                <span className="text-zinc-500">— {r.track}</span>
                              )}
                            </span>
                            <span className="flex items-center gap-3">
                              <span className="text-xs text-zinc-500">
                                {formatDateTime(r.startsAt)}
                              </span>
                              {w.status === "OPEN" && w.minutesRemaining != null && (
                                <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                  closes in {formatCountdown(w.minutesRemaining)}
                                </span>
                              )}
                              {closed && (
                                <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                  closed
                                </span>
                              )}
                              <span className="text-orange-400">Report →</span>
                            </span>
                          </Link>
                        </li>
                      );
                    })()}
                  ))}
                </ul>`;

const after = `                <ul className="divide-y divide-zinc-800">
                  {reg.season.rounds.map((r) => {
                    const w = protestWindowState({
                      raceStartsAt: r.startsAt,
                      protestWindowHours:
                        reg.season.scoringSystem.protestWindowHours,
                    });
                    const closed = w.status === "CLOSED";
                    return (
                      <li key={r.id}>
                        <Link
                          href={\`/leagues/\${reg.season.league.slug}/seasons/\${reg.season.id}/rounds/\${r.id}/report\`}
                          className={\`flex items-center justify-between gap-3 px-2 py-2 text-sm hover:bg-zinc-900 \${
                            closed ? "opacity-60" : ""
                          }\`}
                        >
                          <span className="flex items-center gap-3">
                            <span className="w-10 text-right text-zinc-500">
                              R{r.roundNumber}
                            </span>
                            <span className="font-medium text-zinc-200">
                              {r.name}
                            </span>
                            {r.track && (
                              <span className="text-zinc-500">— {r.track}</span>
                            )}
                          </span>
                          <span className="flex items-center gap-3">
                            <span className="text-xs text-zinc-500">
                              {formatDateTime(r.startsAt)}
                            </span>
                            {w.status === "OPEN" && w.minutesRemaining != null && (
                              <span className="rounded bg-emerald-900/40 px-2 py-0.5 text-xs text-emerald-200">
                                closes in {formatCountdown(w.minutesRemaining)}
                              </span>
                            )}
                            {closed && (
                              <span className="rounded bg-zinc-800 px-2 py-0.5 text-xs text-zinc-400">
                                closed
                              </span>
                            )}
                            <span className="text-orange-400">Report →</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>`;

if (!s.includes(before)) {
  console.error("Anchor not found — file may already be patched or formatting differs.");
  process.exit(1);
}
s = s.replace(before, after);
fs.writeFileSync(FILE, s);
console.log("Patched: map now uses block body with explicit return.");
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
git commit -m "Reports /new: switch round map to block-body so IIFE isn't needed"
git push
echo ""
echo "Done. Wait ~60s for Vercel."
