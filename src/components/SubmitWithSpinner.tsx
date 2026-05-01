"use client";

import { useFormStatus } from "react-dom";

export interface SubmitWithSpinnerProps {
  /** Label shown when idle. */
  label: string;
  /** Label while the action is pending (default: "<label>…"). */
  pendingLabel?: string;
  /** Tailwind classes — keep the colour theme of the original button. */
  className?: string;
  /** Optional name attribute for forms with multiple submit buttons. */
  name?: string;
  /** Optional value attribute for forms with multiple submit buttons. */
  value?: string;
  /** Force-disabled state (in addition to pending). */
  disabled?: boolean;
  /** Hex/Tailwind colour for the spinner stroke (default: currentColor). */
  spinnerColor?: string;
}

export function SubmitWithSpinner({
  label,
  pendingLabel,
  className = "rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400",
  name,
  value,
  disabled,
  spinnerColor,
}: SubmitWithSpinnerProps) {
  const { pending } = useFormStatus();
  const finalLabel = pendingLabel ?? `${label}…`;
  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={pending || disabled}
      className={`inline-flex items-center gap-2 ${className} disabled:cursor-wait disabled:opacity-70`}
    >
      {pending && <Spinner color={spinnerColor} />}
      {pending ? finalLabel : label}
    </button>
  );
}

function Spinner({ color }: { color?: string }) {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin"
      style={color ? { color } : undefined}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
      />
    </svg>
  );
}
