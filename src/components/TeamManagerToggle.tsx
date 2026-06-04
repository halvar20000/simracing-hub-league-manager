"use client";

import { useEffect, useRef, useState } from "react";

/**
 * "Teammanager (not driving)" checkbox for the team registration form.
 *
 * When checked:
 *  - elements marked [data-driver-only] are hidden and their inputs disabled
 *    (the manager has no own iRating),
 *  - rows marked [data-manager-only-row] become visible (the manager does not
 *    count against the driver cap, freeing one extra driver slot),
 *  - cells marked [data-chef-cell] become visible (the manager picks the
 *    Teamchef among the drivers).
 *
 * Pure DOM toggling inside the closest <form>, same pattern as
 * TeamIRatingValidator / TeamClassCarSelect.
 */
export default function TeamManagerToggle({
  defaultChecked = false,
}: {
  defaultChecked?: boolean;
}) {
  const ref = useRef<HTMLLabelElement>(null);
  const [checked, setChecked] = useState(defaultChecked);

  useEffect(() => {
    if (!ref.current) return;
    const form = ref.current.closest("form");
    if (!form) return;

    for (const el of form.querySelectorAll<HTMLElement>("[data-driver-only]")) {
      el.style.display = checked ? "none" : "";
      for (const input of el.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = checked;
        input.required = !checked && input.dataset.wasRequired === "1";
      }
    }
    for (const el of form.querySelectorAll<HTMLElement>(
      "[data-manager-only-row]"
    )) {
      el.style.display = checked ? "" : "none";
      for (const input of el.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = !checked;
      }
    }
    for (const el of form.querySelectorAll<HTMLElement>("[data-chef-cell]")) {
      el.style.display = checked ? "" : "none";
      for (const input of el.querySelectorAll<HTMLInputElement>("input")) {
        input.disabled = !checked;
      }
    }
  }, [checked]);

  return (
    <label
      ref={ref}
      className="flex cursor-pointer items-start gap-2 rounded border border-cyan-800/60 bg-cyan-950/30 p-3"
    >
      <input
        type="checkbox"
        name="isTeamManager"
        value="1"
        checked={checked}
        onChange={(e) => setChecked(e.target.checked)}
        className="mt-0.5 h-4 w-4 accent-cyan-500"
      />
      <span className="text-sm">
        <span className="font-semibold text-cyan-200">
          Teammanager (not driving)
        </span>
        <span className="mt-0.5 block text-xs text-zinc-400">
          Register as the team&apos;s manager: you organise the team but
          don&apos;t race. You won&apos;t count against the driver limit, need
          no iRacing invitation and are approved automatically. You register
          the drivers below and pick the Teamchef.
        </span>
      </span>
    </label>
  );
}
