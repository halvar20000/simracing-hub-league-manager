"use client";

/**
 * Tiny client component: a button that calls window.print(). Used on
 * the printable roster page so admins can launch the browser's print
 * dialog without finding Cmd+P.
 */
export function PrintTrigger({ label = "Print" }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-orange-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-orange-400"
    >
      {label}
    </button>
  );
}
