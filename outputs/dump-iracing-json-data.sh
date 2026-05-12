#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"
SAMPLE='CAS_Leagues/CC/eventresult-84212976.json'

echo "=== All keys under .data (with type/length info) ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE','utf8'));
const d = j.data;
for (const k of Object.keys(d).sort()) {
  const v = d[k];
  if (Array.isArray(v)) {
    console.log('  ' + k.padEnd(30) + ' [array, length=' + v.length + ']');
    if (v.length > 0 && typeof v[0] === 'object') {
      console.log('    first item keys:', Object.keys(v[0]).slice(0,30).join(', '));
    }
  } else if (v && typeof v === 'object') {
    console.log('  ' + k.padEnd(30) + ' {object, keys=' + Object.keys(v).slice(0,15).join(',') + '}');
  } else {
    console.log('  ' + k.padEnd(30) + ' = ' + JSON.stringify(v).slice(0,100));
  }
}
"

echo ""
echo "=== session_results inside .data ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE','utf8'));
const sessions = j.data.session_results || [];
console.log('count:', sessions.length);
for (const s of sessions) {
  const rows = s.results || [];
  console.log('  simsession_name=', s.simsession_name,
    '| simsession_type=', s.simsession_type,
    '| simsession_subtype=', s.simsession_subtype,
    '| simsession_number=', s.simsession_number,
    '| results=', rows.length);
}
"

echo ""
echo "=== First driver row of the RACE session (full keys) ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE','utf8'));
const sessions = j.data.session_results || [];
const race = sessions.find(s => /race/i.test(s.simsession_name||'')) || sessions[sessions.length-1];
const rows = race.results || [];
console.log('Session name:', race.simsession_name);
console.log('First driver:', JSON.stringify(rows[0], null, 2));
"

echo ""
echo "=== Track metadata fields ==="
node -e "
const j = JSON.parse(require('fs').readFileSync('$SAMPLE','utf8'));
const d = j.data;
console.log('subsession_id:', d.subsession_id);
console.log('season_id:', d.season_id);
console.log('series_id:', d.series_id);
console.log('series_name:', d.series_name);
console.log('start_time:', d.start_time);
console.log('end_time:', d.end_time);
console.log('event_type:', d.event_type, ' event_type_name:', d.event_type_name);
console.log('track:', JSON.stringify(d.track, null, 2));
console.log('car_classes:', (d.car_classes||[]).map(c => ({id:c.car_class_id, name:c.name, short:c.short_name})));
"

echo ""
echo "=== Are there 2 race sessions in any of the samples? (multi-race round detection) ==="
for f in CAS_Leagues/CC/eventresult-*.json; do
  echo "--- $f ---"
  node -e "
  const j = JSON.parse(require('fs').readFileSync('$f','utf8'));
  const ss = j.data.session_results || [];
  console.log(ss.map(s => s.simsession_name).join(' | '));
  "
done
