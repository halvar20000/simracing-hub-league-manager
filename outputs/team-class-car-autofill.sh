#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. New client component: TeamClassCarSelect
# ============================================================================
echo "=== 1. Create TeamClassCarSelect component ==="
cat > src/components/TeamClassCarSelect.tsx <<'TSX'
"use client";

import { useState } from "react";

type Car = { id: string; name: string };

type CarClass = {
  id: string;
  name: string;
  shortCode: string;
  isLocked: boolean;
  cars: Car[];
};

export default function TeamClassCarSelect({
  carClasses,
  defaultClassId,
  defaultCarId,
}: {
  carClasses: CarClass[];
  defaultClassId?: string;
  defaultCarId?: string;
}) {
  const [classId, setClassId] = useState<string>(defaultClassId ?? "");
  const [carId, setCarId] = useState<string>(defaultCarId ?? "");

  const selectedClass = carClasses.find((c) => c.id === classId);
  const availableCars = selectedClass?.cars ?? [];
  const isAutoCar = availableCars.length === 1;
  const autoCarId = isAutoCar ? availableCars[0]!.id : "";

  const onClassChange = (newClassId: string) => {
    setClassId(newClassId);
    const newClass = carClasses.find((c) => c.id === newClassId);
    if (!newClass) {
      setCarId("");
      return;
    }
    if (newClass.cars.length === 1) {
      setCarId(newClass.cars[0]!.id);
    } else if (!newClass.cars.find((c) => c.id === carId)) {
      // Current car doesn't belong to the newly selected class — clear it
      setCarId("");
    }
  };

  return (
    <>
      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Class <span className="text-orange-400">*</span>
        </span>
        <select
          name="carClassId"
          required
          value={classId}
          onChange={(e) => onClassChange(e.target.value)}
          className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
        >
          <option value="">Select class…</option>
          {carClasses.map((c) => (
            <option key={c.id} value={c.id} disabled={c.isLocked}>
              {c.name}
              {c.isLocked ? " — locked (full)" : ""}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1 block text-sm text-zinc-300">
          Car <span className="text-orange-400">*</span>
        </span>
        {isAutoCar ? (
          <>
            <input type="hidden" name="carId" value={autoCarId} />
            <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-sm text-zinc-200">
              <span>{availableCars[0]!.name}</span>
              <span className="text-xs text-zinc-500">
                (only car in this class — auto-selected)
              </span>
            </div>
          </>
        ) : (
          <select
            name="carId"
            required
            value={carId}
            onChange={(e) => setCarId(e.target.value)}
            disabled={!classId}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 disabled:opacity-50"
          >
            <option value="">
              {classId ? "Select car…" : "Pick a class first"}
            </option>
            {availableCars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </select>
        )}
        <span className="mt-1 block text-xs text-zinc-500">
          All teammates drive the same car.
        </span>
      </label>
    </>
  );
}
TSX
echo "  Written."

# ============================================================================
# 2. Patch team registration form: replace class + car selects with component
# ============================================================================
echo ""
echo "=== 2. Patch team registration form ==="
cat > /tmp/lm_patch_class_car.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');
const before = s;

// Add import (only if missing)
if (!s.includes('TeamClassCarSelect')) {
  s = s.replace(
    /import TeamIRatingValidator from "@\/components\/TeamIRatingValidator";/,
    `import TeamIRatingValidator from "@/components/TeamIRatingValidator";
import TeamClassCarSelect from "@/components/TeamClassCarSelect";`
  );
}

// Replace the existing Class label..Car label..end-of-Car-help-span block
// in the team-mode form with a single <TeamClassCarSelect /> component.
//
// The block starts with the Class <label> and ends just after the
// "All teammates drive the same car." help span's closing </label>.
const re = /<label className="block">\s*\n\s*<span className="mb-1 block text-sm text-zinc-300">\s*\n\s*Class <span className="text-orange-400">\*<\/span>\s*\n\s*<\/span>[\s\S]*?All teammates drive the same car\. Cars from locked classes are\s*\n\s*hidden\.\s*\n\s*<\/span>\s*\n\s*<\/label>/;

if (!re.test(s)) {
  console.error('  Anchor not found — Class+Car JSX block not matched.');
  process.exit(1);
}

s = s.replace(
  re,
  `<TeamClassCarSelect
            carClasses={carClasses.map((c) => ({
              id: c.id,
              name: c.name,
              shortCode: c.shortCode,
              isLocked: c.isLocked,
              cars: c.cars.map((car) => ({ id: car.id, name: car.name })),
            }))}
            defaultClassId={existing?.carClassId ?? undefined}
            defaultCarId={existing?.carId ?? undefined}
          />`
);

if (s === before) {
  console.error('  No edit made.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_patch_class_car.js

echo ""
echo "-- Verify --"
grep -n 'TeamClassCarSelect' 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx' | head -5

# ============================================================================
# 3. TS check
# ============================================================================
echo ""
echo "=== 3. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 4. Commit + push
# ============================================================================
echo ""
echo "=== 4. Commit + push ==="
git add -A
git status --short
git commit -m "Team registration: client component for class+car — auto-fills car for single-car classes (LMP2, Porsche Cup)"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "After deploy, on IEC team registration form:"
echo "  • Pick LMP2 → Car field shows 'Dallara P217 (only car in this class — auto-selected)'"
echo "  • Pick Porsche Cup → 'Porsche 911 (992.2)' auto-selected the same way"
echo "  • Pick GT3 → Car becomes a regular dropdown of the 11 GT3 cars"
echo "  • Switching class clears car selection if it doesn't belong to the new class"
echo ""
echo "Server-side validation (car must belong to class) is unchanged, so this is"
echo "purely a UX improvement — submissions still go through the same checks."
