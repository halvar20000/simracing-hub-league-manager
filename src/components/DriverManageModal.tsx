"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * "Manage" button in the frozen driver column of the admin roster. The panel is
 * rendered by the server page and passed in as children. Portalled to <body>
 * because the sticky table cell is its own stacking context, which would trap
 * the overlay underneath the table header.
 */
export default function DriverManageModal({
  driverName,
  defaultOpen = false,
  children,
}: {
  driverName: string;
  /** Opened by the ?driver= link in the registration email. */
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  // In an effect, not as the initial state: the portal needs document.body,
  // which does not exist during server rendering.
  useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="no-print mt-1 inline-block rounded border border-orange-700 bg-orange-950/30 px-2 py-0.5 text-[11px] font-medium text-orange-300 hover:bg-orange-900/40"
      >
        Manage →
      </button>
      {open &&
        createPortal(
          <div
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 p-3 sm:p-6"
            onClick={(e) => {
              if (e.target === e.currentTarget) setOpen(false);
            }}
          >
            <div
              role="dialog"
              aria-label={`Manage ${driverName}`}
              className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-lg border border-zinc-700 bg-[#0a0a0f] shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-2">
                <span className="text-sm font-semibold text-zinc-200">
                  {driverName}
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  className="rounded px-2 py-1 text-lg leading-none text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  ✕
                </button>
              </div>
              <div className="p-4">{children}</div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
