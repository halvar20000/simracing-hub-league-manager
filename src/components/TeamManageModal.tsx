"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Manage team" button that opens the existing /teams/[teamId]/manage page
 * inside a modal (an iframe in `?embed=1` chrome-stripped mode) so the admin /
 * team leader never leaves the roster. The roster is refreshed when the modal
 * is closed so any membership changes show immediately.
 *
 * Drop-in replacement for the previous <Link href={`/teams/${id}/manage`}>.
 */
export default function TeamManageModal({
  teamId,
  label = "Manage team →",
  className = "inline-block rounded border border-orange-700 bg-orange-950/30 px-2 py-0.5 text-[11px] font-medium text-orange-300 hover:bg-orange-900/40",
}: {
  teamId: string;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  function close() {
    setOpen(false);
    // Pull fresh roster data so edits made in the modal are reflected.
    router.refresh();
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 sm:p-6"
          onClick={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div className="relative flex h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border border-zinc-700 bg-[#0a0a0f] shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
              <span className="text-sm font-semibold text-zinc-200">
                Manage team
              </span>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="rounded px-2 py-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
              >
                ✕
              </button>
            </div>
            <iframe
              src={`/teams/${teamId}/manage?embed=1`}
              title="Manage team"
              className="h-full w-full flex-1 border-0 bg-[#0a0a0f]"
            />
          </div>
        </div>
      )}
    </>
  );
}
