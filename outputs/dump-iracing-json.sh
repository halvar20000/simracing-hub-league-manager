#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

SAMPLE='CAS_Leagues/CC/eventresult-84212976.json'

echo "=== File size + line count ==="
ls -la "$SAMPLE"
wc -l "$SAMPLE"

echo ""
echo "=== Top-level keys ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE', 'utf8'));
const top = Object.keys(j);
console.log('Top-level keys:', top);
for (const k of top) {
  const v = j[k];
  if (Array.isArray(v)) {
    console.log('  ' + k + ': [Array, length=' + v.length + ']');
    if (v.length > 0 && typeof v[0] === 'object') {
      console.log('    first item keys:', Object.keys(v[0]).slice(0, 30));
    }
  } else if (v && typeof v === 'object') {
    console.log('  ' + k + ': {Object, keys=' + Object.keys(v).slice(0, 15).join(',') + '}');
  } else {
    console.log('  ' + k + ' =', JSON.stringify(v).slice(0, 80));
  }
}
"

echo ""
echo "=== session_results (or equivalent) — list of session names ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE', 'utf8'));
const sessions = j.session_results || j.sessions || [];
console.log('Sessions found:', sessions.length);
for (const s of sessions) {
  console.log('  ', s.simsession_name || s.name || s.session_name || '?',
    '| type=', s.simsession_type ?? s.session_type ?? '?',
    '| results=', (s.results || s.Rows || s.rows || []).length);
}
"

echo ""
echo "=== First driver row (race session) — full key list ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE', 'utf8'));
const sessions = j.session_results || j.sessions || [];
const race = sessions.find((s) =>
  /race/i.test(s.simsession_name || s.name || s.session_name || '')
) || sessions[0];
const rows = race?.results || race?.Rows || race?.rows || [];
const first = rows[0];
if (first) {
  console.log('Sample driver (', first.display_name || first.Name || '?', '):');
  console.log(JSON.stringify(first, null, 2).slice(0, 4000));
} else {
  console.log('(no driver rows found)');
}
"

echo ""
echo "=== Track / event metadata ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE', 'utf8'));
console.log('track:', JSON.stringify(j.track || j.Track || null, null, 2));
console.log('subsession_id:', j.subsession_id || j.SubsessionId || null);
console.log('start_time:', j.start_time || j.StartTime || null);
console.log('event_type:', j.event_type || j.EventType || null);
"
