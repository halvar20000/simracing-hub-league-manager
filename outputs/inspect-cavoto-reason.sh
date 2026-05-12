#!/usr/bin/env bash
set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

echo "=== reason_out for ALL drivers in HEAT 1 + FEATURE (Silverstone JSON) ==="
node -e "
const fs = require('fs');
const j = JSON.parse(fs.readFileSync('CAS_Leagues/SFL/eventresult-85370904.json','utf8'));
const races = j.data.session_results.filter(s => s.simsession_type === 6);
for (const race of races) {
  console.log('');
  console.log('--- ' + race.simsession_name + ' ---');
  for (const r of race.results) {
    console.log('  ' + (r.display_name||'').padEnd(28).slice(0,28) +
      ' | reason_out_id=' + String(r.reason_out_id ?? '').padStart(2) +
      ' | reason_out=\"' + (r.reason_out || '') + '\"');
  }
}
"

echo ""
echo "=== Distinct reason_out values across all sessions in all SFL files ==="
node -e "
const fs = require('fs');
const seen = new Map();
for (const f of fs.readdirSync('CAS_Leagues/SFL').filter(x=>x.endsWith('.json'))) {
  const j = JSON.parse(fs.readFileSync('CAS_Leagues/SFL/'+f,'utf8'));
  for (const s of j.data.session_results || []) {
    for (const r of s.results || []) {
      const k = (r.reason_out_id ?? '?') + ':' + (r.reason_out || '');
      seen.set(k, (seen.get(k) || 0) + 1);
    }
  }
}
for (const [k,v] of [...seen.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log('  ' + k.padEnd(40) + ' x' + v);
}
"

echo ""
echo "=== Same scan across ALL CAS_Leagues JSON files (broader sample) ==="
node -e "
const fs = require('fs'); const path = require('path');
const seen = new Map();
function walk(dir) {
  for (const e of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (p.endsWith('.json')) {
      try {
        const j = JSON.parse(fs.readFileSync(p,'utf8'));
        for (const s of j.data?.session_results || []) {
          for (const r of s.results || []) {
            const k = (r.reason_out_id ?? '?') + ':' + (r.reason_out || '');
            seen.set(k, (seen.get(k) || 0) + 1);
          }
        }
      } catch {}
    }
  }
}
walk('CAS_Leagues');
for (const [k,v] of [...seen.entries()].sort((a,b)=>b[1]-a[1])) {
  console.log('  ' + k.padEnd(40) + ' x' + v);
}
"
