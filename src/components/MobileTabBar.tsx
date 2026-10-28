"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * App-style bottom tab bar on phones (hidden from lg up, where the full nav
 * row fits). Respects the iPhone home-indicator inset (viewport-fit=cover).
 */
const TABS = [
  { href: "/", label: "Home", match: (p: string) => p === "/", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/leagues", label: "Leagues", match: (p: string) => p.startsWith("/leagues"), icon: "M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0zM17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" },
  { href: "/calendar", label: "Calendar", match: (p: string) => p.startsWith("/calendar"), icon: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4" },
  { href: "/streams", label: "Streams", match: (p: string) => p.startsWith("/streams"), icon: "M4 5h16v11H4zM10 9l4 2.5-4 2.5zM8 20h8" },
  { href: "/profile", label: "Me", match: (p: string) => ["/profile", "/registrations", "/reports", "/dashboard"].some((x) => p.startsWith(x)), icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" },
];

export default function MobileTabBar({ signedIn }: { signedIn: boolean }) {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-zinc-800 bg-[#0a0a0f]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden lg:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {TABS.map((t) => {
          const href = t.href === "/profile" && !signedIn ? "/dashboard" : t.href;
          const on = t.match(pathname);
          return (
            <li key={t.href}>
              <Link
                href={href}
                aria-current={on ? "page" : undefined}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] ${on ? "text-[#ff6b35]" : "text-zinc-400"}`}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
