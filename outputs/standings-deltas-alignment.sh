#!/usr/bin/env bash
# Fix standings cell alignment: split each value+delta into two fixed-width
# inline-block spans so columns line up regardless of delta length.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

# Replace the DriversTable cell rendering with fixed-width value+delta blocks
node -e "
const fs = require('fs');
const path = 'src/app/leagues/[slug]/seasons/[seasonId]/standings/page.tsx';
let s = fs.readFileSync(path, 'utf8');

// 1. Replace PosDelta and ValueDelta with cell helpers that own their width
const oldHelpers = /function PosDelta\([\s\S]*?return \(\s*<span\s*className=\\\`ml-1 text-\[9px\] tabular-nums \\\\\\\$\{positive \? \"text-emerald-400\" : \"text-red-400\"\}\\\`\s*>[\s\S]*?<\/span>\s*\);\s*\}\s*function ValueDelta\([\s\S]*?<\/span>\s*\);\s*\}/;

const newHelpers = \`function PosCell({ pos, delta }: { pos: number; delta: number | null }) {
  return (
    <>
      <span className=\"inline-block w-6 text-right tabular-nums\">{pos}</span>
      <span className=\"inline-block w-10 text-left text-[9px] tabular-nums\">
        {delta == null || delta === 0 ? null : (
          <span className={delta > 0 ? \"text-emerald-400\" : \"text-red-400\"}>
            {delta > 0 ? \"▲\" : \"▼\"}{Math.abs(delta)}
          </span>
        )}
      </span>
    </>
  );
}

function ValueCell({
  value,
  delta,
  lowerIsBetter = false,
  width = \"w-10\",
}: {
  value: number | string;
  delta: number | null;
  lowerIsBetter?: boolean;
  width?: string;
}) {
  const isGood =
    delta == null || delta === 0
      ? false
      : lowerIsBetter
      ? delta < 0
      : delta > 0;
  return (
    <>
      <span className={\\\`inline-block \\\${width} text-right tabular-nums\\\`}>{value}</span>
      <span className=\"inline-block w-10 text-left text-[9px] tabular-nums\">
        {delta == null || delta === 0 ? null : (
          <span className={isGood ? \"text-emerald-400\" : \"text-red-400\"}>
            {delta > 0 ? \\\`+\\\${delta}\\\` : delta}
          </span>
        )}
      </span>
    </>
  );
}\`;

if (s.match(/function PosDelta/)) {
  s = s.replace(/function PosDelta[\s\S]*?\n\}\n\n/, '');
  s = s.replace(/function ValueDelta[\s\S]*?\n\}\n\n/, '');
  s = s.replace(/^(import .+;\n)+\n/m, (m) => m + '');
  // Insert new helpers before the DriversTable component
  s = s.replace(/function DriversTable\(/, newHelpers + '\nfunction DriversTable(');
}

// 2. Replace the cells that used <PosDelta/> and <ValueDelta/> with new components
s = s.replace(
  /<td className=\"px-3 py-2 font-medium tabular-nums\">\s*\{idx \+ 1\}\s*<PosDelta delta=\{positionDelta\} \/>\s*<\/td>/,
  '<td className=\"px-3 py-2 font-medium tabular-nums\"><PosCell pos={idx + 1} delta={positionDelta} /></td>'
);

s = s.replace(
  /<td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\">\s*\{r\.totalIncidents\}\s*<ValueDelta delta=\{incDelta\} lowerIsBetter \/>\s*<\/td>/,
  '<td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\"><ValueCell value={r.totalIncidents} delta={incDelta} lowerIsBetter /></td>'
);

s = s.replace(
  /<td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\">\s*\{r\.rawPoints\}\s*<ValueDelta delta=\{rawDelta\} \/>\s*<\/td>/,
  '<td className=\"px-3 py-2 text-right text-zinc-400 tabular-nums\"><ValueCell value={r.rawPoints} delta={rawDelta} /></td>'
);

s = s.replace(
  /<td className=\"px-3 py-2 text-right text-red-400 tabular-nums\">\s*\{r\.manualPenalties > 0 \? \\\`−\\\$\{r\.manualPenalties\}\\\` : 0\}\s*<ValueDelta delta=\{penDelta\} lowerIsBetter \/>\s*<\/td>/,
  '<td className=\"px-3 py-2 text-right text-red-400 tabular-nums\"><ValueCell value={r.manualPenalties > 0 ? \\\`−\\\${r.manualPenalties}\\\` : 0} delta={penDelta} lowerIsBetter /></td>'
);

s = s.replace(
  /<td className=\"px-3 py-2 text-right font-bold text-orange-400 tabular-nums\">\s*\{total\}\s*<ValueDelta delta=\{totalDelta\} \/>\s*<\/td>/,
  '<td className=\"px-3 py-2 text-right font-bold text-orange-400 tabular-nums\"><ValueCell value={total} delta={totalDelta} width=\"w-12\" /></td>'
);

fs.writeFileSync(path, s);
console.log('Patched standings page with fixed-width value + delta cells.');
"

echo ""
echo "Done. Refresh the standings page — values and deltas should now sit in proper columns."
