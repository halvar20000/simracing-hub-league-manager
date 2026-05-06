#!/usr/bin/env bash
set -euo pipefail
if command -v pbcopy >/dev/null 2>&1; then
  exec > >(tee >(pbcopy)) 2>&1
fi
cd "$HOME/Nextcloud/AI/league-manager"

# ============================================================================
# 1. New client component: TeamIRatingValidator
# ============================================================================
echo "=== 1. Create TeamIRatingValidator ==="
cat > src/components/TeamIRatingValidator.tsx <<'TSX'
"use client";

import { useEffect, useRef, useState } from "react";

const LMP2_MIN = 1500;
const MAX = 5000;

type ClassInfo = { id: string; shortCode: string };

export default function TeamIRatingValidator({
  classes,
  lockedClassShortCode,
}: {
  classes?: ClassInfo[];
  lockedClassShortCode?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!ref.current) return;
    const form = ref.current.closest("form");
    if (!form) return;

    const validate = () => {
      const fd = new FormData(form);
      const errs: string[] = [];

      // Determine current class shortCode
      let scl = lockedClassShortCode;
      if (!scl && classes) {
        const cid = String(fd.get("carClassId") ?? "");
        scl = classes.find((c) => c.id === cid)?.shortCode;
      }
      const isLMP2 = scl === "LMP2";

      // Leader iRating
      const lr = String(fd.get("leaderIRating") ?? "").trim();
      if (lr) {
        if (!/^\d+$/.test(lr)) {
          errs.push("Your iRating must be a number");
        } else {
          const n = parseInt(lr, 10);
          if (n > MAX) {
            errs.push(`Your iRating ${n} is above the ${MAX} maximum`);
          }
          if (isLMP2 && n < LMP2_MIN) {
            errs.push(
              `LMP2 requires iRating ≥ ${LMP2_MIN} — you entered ${n}`
            );
          }
        }
      }

      // Teammate iRatings
      for (let i = 1; i <= 4; i++) {
        const tname = String(fd.get(`teammate${i}Name`) ?? "").trim();
        const tid = String(fd.get(`teammate${i}IracingId`) ?? "").trim();
        const tr = String(fd.get(`teammate${i}IRating`) ?? "").trim();
        const filled = !!tname || !!tid || !!tr;
        if (!filled) continue;
        if (!tname || !tid) {
          errs.push(`Teammate row ${i}: iRacing name and ID are both required`);
        }
        if (!tr) {
          errs.push(`Teammate row ${i}: iRating is required`);
          continue;
        }
        if (!/^\d+$/.test(tr)) {
          errs.push(`Teammate row ${i}: iRating must be a number`);
          continue;
        }
        const n = parseInt(tr, 10);
        if (n > MAX) {
          errs.push(`Teammate ${i}: iRating ${n} is above the ${MAX} maximum`);
        }
        if (isLMP2 && n < LMP2_MIN) {
          errs.push(
            `Teammate ${i}: LMP2 requires iRating ≥ ${LMP2_MIN} — entered ${n}`
          );
        }
      }

      setErrors(errs);
    };

    validate();
    form.addEventListener("input", validate);
    form.addEventListener("change", validate);
    return () => {
      form.removeEventListener("input", validate);
      form.removeEventListener("change", validate);
    };
  }, [classes, lockedClassShortCode]);

  // Disable / re-enable the form's submit button based on validation
  useEffect(() => {
    if (!ref.current) return;
    const form = ref.current.closest("form");
    if (!form) return;
    const btn = form.querySelector('button[type="submit"]');
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = errors.length > 0;
      btn.title = errors.length > 0 ? errors[0] : "";
      if (errors.length > 0) {
        btn.classList.add("opacity-50", "cursor-not-allowed");
      } else {
        btn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  }, [errors]);

  return (
    <div ref={ref}>
      {errors.length > 0 && (
        <div className="rounded border border-red-700/50 bg-red-950/30 p-3 text-sm text-red-200">
          <p className="font-semibold">Cannot submit yet — iRating rules:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
            {errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
TSX
echo "  Written."

# ============================================================================
# 2. Insert into team registration form (in register/page.tsx)
# ============================================================================
echo ""
echo "=== 2. Insert validator into team registration form ==="
cat > /tmp/lm_validator_register.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/leagues/[slug]/seasons/[seasonId]/register/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('TeamIRatingValidator')) {
  console.log('  Already wired.');
  process.exit(0);
}
const before = s;

// Add import
s = s.replace(
  /import PaymentNotice from "@\/components\/PaymentNotice";/,
  `import PaymentNotice from "@/components/PaymentNotice";
import TeamIRatingValidator from "@/components/TeamIRatingValidator";`
);

// Insert validator JSX inside the team form, just before the
// `<div className="flex gap-2">` that wraps the submit button (in team mode).
// The team-mode form has the PaymentNotice rendered just above that submit row.
// We anchor on `{paymentInfo && (` followed by the PaymentNotice and the
// submit container — but only in the team-mode block.
//
// Use a unique anchor: the team-mode submit button text "Submit team registration".
s = s.replace(
  /(\s*\{paymentInfo && \(\s*\n\s*<PaymentNotice payment=\{paymentInfo\} variant="preview" \/>\s*\n\s*\)\}\s*\n\s*\n\s*<div className="flex gap-2">\s*\n\s*<button\s*\n\s*type="submit"[\s\S]*?(?:Submit team registration|Update team registration))/,
  `
          <TeamIRatingValidator
            classes={carClasses.map((c) => ({ id: c.id, shortCode: c.shortCode }))}
          />$1`
);

if (s === before) {
  console.error('  Anchor not found — may need a different anchor for the team form.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_validator_register.js

# ============================================================================
# 3. Insert into manage page form
# ============================================================================
echo ""
echo "=== 3. Insert validator into manage form ==="
cat > /tmp/lm_validator_manage.js <<'JS'
const fs = require('fs');
const FILE = 'src/app/teams/[teamId]/manage/page.tsx';
let s = fs.readFileSync(FILE, 'utf8');

if (s.includes('TeamIRatingValidator')) {
  console.log('  Already wired.');
  process.exit(0);
}
const before = s;

// Add import
s = s.replace(
  /import \{\s*\n\s*updateTeamRegistration,\s*\n\s*withdrawTeam,\s*\n\s*transferTeamLeadership,\s*\n\} from "@\/lib\/actions\/registrations";/,
  `import {
  updateTeamRegistration,
  withdrawTeam,
  transferTeamLeadership,
} from "@/lib/actions/registrations";
import TeamIRatingValidator from "@/components/TeamIRatingValidator";`
);

// Insert before the Save button. Anchor on `Save changes` text.
s = s.replace(
  /(\s*<button\s*\n\s*type="submit"\s*\n\s*className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"\s*\n\s*>\s*\n\s*Save changes)/,
  `
          <TeamIRatingValidator
            lockedClassShortCode={leaderReg?.carClass?.shortCode}
          />$1`
);

if (s === before) {
  console.error('  Anchor not found.');
  process.exit(1);
}
fs.writeFileSync(FILE, s);
console.log('  Patched.');
JS
node /tmp/lm_validator_manage.js

# ============================================================================
# 4. TS check
# ============================================================================
echo ""
echo "=== 4. TypeScript check ==="
npx --yes tsc --noEmit -p tsconfig.json || {
  echo "!!! TS errors. NOT pushing."
  exit 1
}

# ============================================================================
# 5. Commit + push
# ============================================================================
echo ""
echo "=== 5. Commit + push ==="
git add -A
git status --short
git commit -m "Team forms: client-side iRating validator — disables submit + shows banner when out of range"
git push

echo ""
echo "Done. Wait ~60s for Vercel."
echo ""
echo "Behaviour after deploy:"
echo "  • Team registration form: typing leader iRating > 5000 immediately"
echo "    disables 'Submit team registration' and shows the red banner."
echo "  • Picking LMP2 with leader/teammate iRating < 1500 same effect."
echo "  • Banner clears + button re-enables when all values are valid."
echo "  • Same on /teams/<id>/manage Save button."
echo "  • Server-side validation still in place (defence in depth) for users"
echo "    with JS disabled or trying to bypass."
