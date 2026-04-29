"use client";

import { useFormStatus } from "react-dom";

export function PullFromIRLMButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded border border-emerald-600 bg-emerald-950/40 px-3 py-1.5 text-sm font-medium text-emerald-300 hover:bg-emerald-900 disabled:cursor-wait disabled:opacity-70"
    >
      {pending ? (
        <>
          <Spinner />
          Pulling from iRLM…
        </>
      ) : (
        "Pull from iRLM"
      )}
    </button>
  );
}

function Spinner() {
  return (
    <svg
      className="h-3.5 w-3.5 animate-spin text-emerald-300"
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
