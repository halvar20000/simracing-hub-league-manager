"use client";

/**
 * Labelled form field with an explanation that appears on hover.
 *
 * The planner used the native `title` attribute in ~110 places. That is a poor
 * fit here: it waits a second, renders in the OS tooltip style (unreadable
 * white-on-grey against a dark page), never shows on touch, and cannot be
 * styled or wrapped. This replaces it with a real popover that opens
 *
 *   - on hover anywhere in the field (label OR control — the user asked for
 *     "hovering the field", not "hunting for a tiny icon"),
 *   - on keyboard focus of the control (`group-focus-within`),
 *   - on tapping the ⓘ, which is the only path a touch device has.
 *
 * Hover and focus are pure CSS so typing in the field never re-renders the
 * tree; only the tap-to-pin path holds state.
 *
 * The popover sits ABOVE the field. Inside a horizontally scrolling table it
 * would be clipped, so table headers use the bare <Hint> instead, which is the
 * same popover hung off the icon alone.
 */

import { useId, useState } from "react";

const POPOVER =
  "pointer-events-none absolute bottom-full left-0 z-50 mb-1.5 w-64 max-w-[80vw] " +
  "rounded-md border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-[11px] " +
  "font-normal normal-case leading-snug tracking-normal text-zinc-300 shadow-xl " +
  "shadow-black/60 print:hidden";

const MARK =
  "ml-1 inline-flex h-3.5 w-3.5 shrink-0 cursor-help items-center justify-center " +
  "rounded-full border border-zinc-700 text-[9px] leading-none text-zinc-500 " +
  "transition group-hover:border-orange-500/60 group-hover:text-orange-300 print:hidden";

/**
 * The explanation icon on its own — for table headers, checkboxes and anywhere
 * else that has no <Field> wrapper to hang the hover off.
 */
export function Hint({ text }: { text: string }) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  return (
    <span className="group/hint relative inline-block align-middle">
      <button
        type="button"
        aria-label={text}
        aria-describedby={id}
        onClick={(e) => {
          // Inside a <label> a click would otherwise focus the control and,
          // for a checkbox, toggle it.
          e.preventDefault();
          e.stopPropagation();
          setPinned((p) => !p);
        }}
        className={`${MARK} group-hover/hint:border-orange-500/60 group-hover/hint:text-orange-300`}
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`${POPOVER} left-auto right-0 ${
          pinned ? "block" : "hidden group-hover/hint:block"
        }`}
      >
        {text}
      </span>
    </span>
  );
}

/**
 * A label + control pair. `hint` is the sentence that tells the user what the
 * field is for; omit it only where the label genuinely says everything.
 */
export function Field({
  label,
  hint,
  children,
  className = "",
  labelFor,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
  labelFor?: string;
}) {
  const [pinned, setPinned] = useState(false);
  const id = useId();
  return (
    <div className={`group relative ${className}`}>
      <label
        htmlFor={labelFor}
        className="mb-0.5 flex items-center text-[11px] font-medium uppercase tracking-wider text-zinc-500"
      >
        <span>{label}</span>
        {hint && (
          <button
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            onClick={(e) => {
              e.preventDefault();
              setPinned((p) => !p);
            }}
            className={MARK}
          >
            i
          </button>
        )}
      </label>
      {children}
      {hint && (
        <span
          id={id}
          role="tooltip"
          className={`${POPOVER} ${
            pinned ? "block" : "hidden group-hover:block group-focus-within:block"
          }`}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

/**
 * A checkbox with its own hover explanation. Same popover, but the label text
 * is sentence-case and sits to the right of the box.
 */
export function CheckField({
  checked,
  onChange,
  label,
  hint,
  disabled,
  className = "",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div className={`group relative ${className}`}>
      <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="flex items-center">
          {label}
          {hint && <span className={MARK}>i</span>}
        </span>
      </label>
      {hint && (
        <span role="tooltip" className={`${POPOVER} hidden group-hover:block group-focus-within:block`}>
          {hint}
        </span>
      )}
    </div>
  );
}
