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
