"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Live iRating validation for the solo registration form (SFL Cup).
 *
 * Mirrors TeamIRatingValidator: watches the form's `iRating` input and
 * disables the submit button while the value is invalid. The cap is only
 * enforced for non-exempt drivers — a driver who raced in the previous SFL
 * Cup season (exempt) may enter any iRating.
 */
export default function SoloIRatingValidator({
  maxIRating,
  exempt,
}: {
  maxIRating: number;
  exempt: boolean;
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
      const raw = String(fd.get("iRating") ?? "").trim();

      if (!raw) {
        errs.push("Your current iRating is required");
      } else if (!/^\d+$/.test(raw)) {
        errs.push("iRating must be a whole number");
      } else if (!exempt) {
        const n = parseInt(raw, 10);
        if (n > maxIRating) {
          errs.push(
            `This season is capped at ${maxIRating} iRating for new drivers — you entered ${n}`
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
  }, [maxIRating, exempt]);

  // Disable / re-enable the form's submit button based on validation.
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
