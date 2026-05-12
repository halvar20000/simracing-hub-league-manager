#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== Files in CAS_Leagues/IEC/ ==="
ls -la CAS_Leagues/IEC/ 2>/dev/null || { echo "(folder missing — create it and add a JSON)"; exit 1; }

echo ""
for f in CAS_Leagues/IEC/*.json; do
  [ -f "$f" ] || continue
  echo ""
  echo "================================================================"
  echo "=== File: $f"
  echo "================================================================"
  node -e "
  const j = JSON.parse(require('fs').readFileSync('$f','utf8'));
  const d = j.data;
  console.log('subsession_id    :', d.subsession_id);
  console.log('league           :', d.league_name);
  console.log('league_season    :', d.league_season_name);
  console.log('track            :', d.track?.track_name, '(', d.track?.config_name || '-', ')');
  console.log('start_time       :', d.start_time, ' end_time:', d.end_time);
  console.log('event_type       :', d.event_type, '(' + d.event_type_name + ')');
  console.log('limit_minutes    :', d.limit_minutes);
  console.log('driver_changes   :', d.driver_changes);
  console.log('min_team_drivers :', d.min_team_drivers, '  max_team_drivers:', d.max_team_drivers);
  console.log('event_laps       :', d.event_laps_complete);
  console.log('num_drivers      :', d.num_drivers);

  console.log('');
  console.log('Sessions:');
  for (const s of d.session_results || []) {
    console.log('  - ' + s.simsession_name.padEnd(10),
      'type=' + s.simsession_type,
      'rows=' + (s.results||[]).length);
  }

  // Inspect a single race row for shape
  const race = (d.session_results||[]).find(s => s.simsession_type === 6);
  if (race) {
    console.log('');
    console.log('First RACE row (full structure):');
    const sample = (race.results||[]).find(r => r.team_id || r.driver_results) ?? race.results[0];
    console.log(JSON.stringify(sample, null, 2).slice(0, 5000));
  }
  "
done

echo ""
echo "=== Distinct top-level keys across all RACE rows ==="
node -e "
const fs = require('fs');
const keys = new Set();
for (const f of fs.readdirSync('CAS_Leagues/IEC').filter(x => x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('CAS_Leagues/IEC/' + f, 'utf8'));
  for (const s of j.data.session_results || []) {
    if (s.simsession_type !== 6) continue;
    for (const r of s.results || []) {
      for (const k of Object.keys(r)) keys.add(k);
    }
  }
}
console.log([...keys].sort().join(', '));
"
