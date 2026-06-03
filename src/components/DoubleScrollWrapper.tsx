"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Wraps a wide table in TWO horizontally-scrollable areas — a thin
 * phantom strip ABOVE the table and the real overflow container BELOW.
 * The two scrollbars are kept in sync so the user can scroll the table
 * horizontally from either the top or the bottom of it. Useful when the
 * table is taller than the viewport and reaching the bottom scrollbar
 * means scrolling the page first.
 *
 * Behavior:
 * - Renders a child wrapper with `overflow-x-auto`; the table goes inside.
 * - Mirrors the inner content's scrollWidth into a 1px-tall phantom div
 *   inside the top strip; that gives the top strip a real scrollbar that
 *   matches the table width.
 * - `scrollLeft` is mirrored both ways via a tiny guard against feedback
 *   loops.
 * - A ResizeObserver re-syncs the phantom width when the table grows /
 *   shrinks (e.g., column filters add/remove rows that change cell widths).
 *
 * Pair with the global `.scrollbar-visible` utility so the scrollbars are
 * actually drawn on macOS.
 */
export function DoubleScrollWrapper({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const topRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const phantomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const top = topRef.current;
    const bottom = bottomRef.current;
    const phantom = phantomRef.current;
    if (!top || !bottom || !phantom) return;

    const sync = () => {
      // Use the bottom container's scrollWidth as the truth — that's the
      // real width of the table content including any overflow.
      phantom.style.width = `${bottom.scrollWidth}px`;
    };
    sync();

    // Re-sync when the table (or anything inside it) changes size.
    const inner = bottom.firstElementChild as HTMLElement | null;
    const ro =
      inner && "ResizeObserver" in window ? new ResizeObserver(sync) : null;
    if (ro && inner) ro.observe(inner);
    window.addEventListener("resize", sync);

    // Two-way scroll sync with a re-entrancy guard.
    let lock = false;
    const onTopScroll = () => {
      if (lock) return;
      lock = true;
      bottom.scrollLeft = top.scrollLeft;
      lock = false;
    };
    const onBottomScroll = () => {
      if (lock) return;
      lock = true;
      top.scrollLeft = bottom.scrollLeft;
      lock = false;
    };
    top.addEventListener("scroll", onTopScroll, { passive: true });
    bottom.addEventListener("scroll", onBottomScroll, { passive: true });

    return () => {
      top.removeEventListener("scroll", onTopScroll);
      bottom.removeEventListener("scroll", onBottomScroll);
      window.removeEventListener("resize", sync);
      ro?.disconnect();
    };
  }, []);

  return (
    <div className={className}>
      <div
        ref={topRef}
        className="overflow-x-auto scrollbar-visible rounded-t border border-b-0 border-zinc-800 bg-zinc-900/50"
        aria-hidden="true"
      >
        <div ref={phantomRef} style={{ height: 1 }} />
      </div>
      <div
        ref={bottomRef}
        className="overflow-x-auto scrollbar-visible rounded-b border border-zinc-800"
      >
        {children}
      </div>
    </div>
  );
}
