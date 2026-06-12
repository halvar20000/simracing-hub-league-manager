"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Floating "contact the developer" button, fixed bottom-right on every page.
 * Icon-only by default; the label slides out on hover (desktop). Hidden on
 * the /contact page itself and in the admin area (admins know the way).
 */
export default function ContactFab() {
  const pathname = usePathname();
  if (pathname.startsWith("/contact") || pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <Link
      href="/contact"
      aria-label="Report an issue / Contact developer"
      title="Report an issue / Contact developer"
      className="group fixed bottom-5 right-5 z-50 flex items-center gap-0 rounded-full border border-[#ff6b35] bg-zinc-950/90 px-3.5 py-3 text-sm font-medium text-[#ff6b35] shadow-lg shadow-black/40 backdrop-blur transition-colors hover:bg-[#ff6b35] hover:text-zinc-950"
    >
      <span aria-hidden className="text-base leading-none">
        🛠️
      </span>
      <span className="max-w-0 overflow-hidden whitespace-nowrap transition-all duration-300 group-hover:ml-2 group-hover:max-w-xs">
        Report an issue
      </span>
    </Link>
  );
}
