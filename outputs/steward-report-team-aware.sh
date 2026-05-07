#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

FILE='src/app/admin/leagues/[slug]/seasons/[seasonId]/reports/[reportId]/page.tsx'

cat > /tmp/lm_steward_team.js <<'JS'
const fs = require('fs');
const FILE = process.argv[2];
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Add team includes to data fetch + season teamRegistration field.
s = s.replace(
  /round: \{ include: \{ season: \{ include: \{ league: true, scoringSystem: true \} \} \} \},/,
  `round: {
        include: {
          season: {
            include: {
              league: true,
              scoringSystem: true,
            },
          },
        },
      },`
);

s = s.replace(
  /reporterUser: true,/,
  `reporterUser: true,
      reporterRegistration: { include: { team: { select: { name: true } } } },`
);

s = s.replace(
  /involvedDrivers: \{\s*\n\s*include: \{ registration: \{ include: \{ user: true \} \} \},\s*\n\s*\},/,
  `involvedDrivers: {
        include: {
          registration: {
            include: {
              user: true,
              team: { select: { name: true } },
            },
          },
        },
      },`
);

// (b) Compute teamMode after the report fetch + notFound check.
s = s.replace(
  /(if \(!report \|\| report\.round\.season\.league\.slug !== slug\) notFound\(\);)/,
  `$1

  const teamMode = !!report.round.season.teamRegistration;`
);

// (c) Reporter block — append team name if teamMode.
s = s.replace(
  /<p className="mt-1 font-medium">\s*\n\s*\{report\.reporterUser\.firstName\} \{report\.reporterUser\.lastName\}\s*\n\s*<\/p>/,
  `<p className="mt-1 font-medium">
            {report.reporterUser.firstName} {report.reporterUser.lastName}
            {teamMode && report.reporterRegistration?.team?.name && (
              <span className="ml-2 text-zinc-400">
                — {report.reporterRegistration.team.name}
              </span>
            )}
          </p>`
);

// (d) Accused block — group by team in team mode.
s = s.replace(
  /\{accusedDrivers\.length === 0 \? \(\s*\n\s*<p className="text-sm text-zinc-500">No drivers tagged\.<\/p>\s*\n\s*\) : \(\s*\n\s*<ul className="text-sm">\s*\n\s*\{accusedDrivers\.map\(\(d\) => \(\s*\n\s*<li key=\{d\.id\}>\s*\n\s*\{d\.registration\.startNumber != null && \(\s*\n\s*<span className="text-zinc-500">\s*\n\s*#\{d\.registration\.startNumber\}\s*\n\s*<\/span>\s*\n\s*\)\}\{" "\}\s*\n\s*\{d\.registration\.user\.firstName\} \{d\.registration\.user\.lastName\}\s*\n\s*<\/li>\s*\n\s*\)\)\}\s*\n\s*<\/ul>\s*\n\s*\)\}/,
  `{accusedDrivers.length === 0 ? (
            <p className="text-sm text-zinc-500">No drivers tagged.</p>
          ) : teamMode ? (
            <ul className="space-y-2 text-sm">
              {Array.from(
                accusedDrivers.reduce((map, d) => {
                  const key = d.registration.team?.name ?? "(No team)";
                  const arr = map.get(key) ?? [];
                  arr.push(d);
                  map.set(key, arr);
                  return map;
                }, new Map())
              ).map(([teamName, members]) => (
                <li key={teamName}>
                  <div className="font-semibold text-zinc-200">{teamName}</div>
                  <ul className="ml-4 space-y-0.5 text-zinc-400">
                    {members.map((d) => (
                      <li key={d.id}>
                        {d.registration.user.firstName}{" "}
                        {d.registration.user.lastName}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="text-sm">
              {accusedDrivers.map((d) => (
                <li key={d.id}>
                  {d.registration.startNumber != null && (
                    <span className="text-zinc-500">
                      #{d.registration.startNumber}
                    </span>
                  )}{" "}
                  {d.registration.user.firstName} {d.registration.user.lastName}
                </li>
              ))}
            </ul>
          )}`
);

// (e) Penalty target select — group by team in team mode.
s = s.replace(
  /<option value="">— Select —<\/option>\s*\n\s*\{accusedDrivers\.map\(\(d\) => \(\s*\n\s*<option key=\{d\.id\} value=\{d\.registrationId\}>\s*\n\s*#\{d\.registration\.startNumber \?\? "\?"\}\{" "\}\s*\n\s*\{d\.registration\.user\.firstName\}\{" "\}\s*\n\s*\{d\.registration\.user\.lastName\}\s*\n\s*<\/option>\s*\n\s*\)\)\}/,
  `<option value="">— Select —</option>
                  {teamMode
                    ? Array.from(
                        accusedDrivers.reduce((map, d) => {
                          const key = d.registration.team?.name ?? "(No team)";
                          const arr = map.get(key) ?? [];
                          arr.push(d);
                          map.set(key, arr);
                          return map;
                        }, new Map())
                      ).map(([teamName, members]) => (
                        <optgroup key={teamName} label={teamName}>
                          {members.map((d) => (
                            <option key={d.id} value={d.registrationId}>
                              {d.registration.user.firstName}{" "}
                              {d.registration.user.lastName}
                            </option>
                          ))}
                        </optgroup>
                      ))
                    : accusedDrivers.map((d) => (
                        <option key={d.id} value={d.registrationId}>
                          #{d.registration.startNumber ?? "?"}{" "}
                          {d.registration.user.firstName}{" "}
                          {d.registration.user.lastName}
                        </option>
                      ))}`
);

if (s === before) {
  console.error('  No edits made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_steward_team.js "$FILE"

echo ""
echo "-- Verify --"
grep -n 'teamMode\|reporterRegistration\|optgroup' "$FILE" | head -10

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
git commit -m "Steward report view: show team for Reporter; group Accused + Penalty target by team in team-mode (IEC). Solo views unchanged."
git push

echo ""
echo "Done."
