#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

cat > /tmp/lm_admin_links_reporting.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/admin/links/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// (a) Stewards queue at top-level
if (!s.includes('Stewards queue')) {
  const re = /(<LinkRow label="Admin dashboard" url=\{`\$\{baseUrl\}\/admin`\} \/>)/;
  if (!re.test(s)) {
    console.error('  Top-level anchor not found.');
    process.exit(1);
  }
  s = s.replace(
    re,
    `$1
          <LinkRow label="Stewards queue" url={\`\${baseUrl}/admin/stewards\`} />`
  );
  console.log('  Added Stewards queue.');
}

// (b) Reports queue per season's admin section — anchor on the Cars LinkRow
if (!s.includes('Reports queue')) {
  const re = /<LinkRow\s*\n\s*label="Cars"\s*\n\s*url=\{`\$\{adminBase\}\/cars`\}\s*\n\s*muted=\{isCompleted\}\s*\n\s*\/>/;
  if (!re.test(s)) {
    console.error('  Cars anchor not found in season block.');
    process.exit(1);
  }
  s = s.replace(
    re,
    `<LinkRow
                          label="Cars"
                          url={\`\${adminBase}/cars\`}
                          muted={isCompleted}
                        />
                        <LinkRow
                          label="Reports queue"
                          url={\`\${adminBase}/reports\`}
                          muted={isCompleted}
                        />`
  );
  console.log('  Added Reports queue per season.');
}

if (s === before) {
  console.log('  Already patched.');
  process.exit(0);
}
fs.writeFileSync(FILE, s);
JS
node /tmp/lm_admin_links_reporting.js

echo ""
echo "-- Verify --"
grep -n 'Stewards queue\|Reports queue' src/app/admin/links/page.tsx | head -5

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
git commit -m "Admin /links: add Stewards queue + per-season Reports queue links"
git push

echo ""
echo "Done."
