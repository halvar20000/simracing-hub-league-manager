"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * The phone/tablet nav menu: a plain <details> (works before hydration),
 * closed again after every navigation and on a tap outside it.
 */
export default function MobileMenu({
  summary,
  children,
}: {
  summary: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    if (ref.current) ref.current.open = false;
  }, [pathname]);

  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const el = ref.current;
      if (el?.open && !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, []);

  return (
    <details ref={ref} className="group relative">
      {summary}
      {children}
    </details>
  );
}
