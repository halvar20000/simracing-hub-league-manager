"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function AdminTabs({
  isAdmin,
  pendingReports,
}: {
  isAdmin: boolean;
  pendingReports: number;
}) {
  const pathname = usePathname() ?? "";

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  return (
    <nav className="flex flex-wrap items-center gap-1 border-b border-zinc-800 pb-2">
      <span className="mr-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
        {isAdmin ? "Admin" : "Steward"}
      </span>
      <Tab href="/admin" active={isActive("/admin")}>
        Dashboard
      </Tab>
      <Tab
        href="/admin/stewards"
        active={isActive("/admin/stewards")}
      >
        Stewards
        {pendingReports > 0 && (
          <span className="ml-1 inline-block min-w-[1.25rem] rounded-full bg-orange-500 px-1.5 text-center text-[10px] font-bold leading-5 text-zinc-950">
            {pendingReports}
          </span>
        )}
      </Tab>
      <Tab href="/admin/links" active={isActive("/admin/links")}>
        Links
      </Tab>
      {isAdmin && (
        <>
          <Tab href="/admin/users" active={isActive("/admin/users")}>
            Users
          </Tab>
          <Tab href="/admin/teams" active={isActive("/admin/teams")}>
            Teams
          </Tab>
          <Tab
            href="/admin/scoring-systems"
            active={isActive("/admin/scoring-systems")}
          >
            Scoring systems
          </Tab>
        </>
      )}
    </nav>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-t border-b-2 px-3 py-2 text-sm transition-colors ${
        active
          ? "border-orange-500 font-medium text-orange-300"
          : "border-transparent text-zinc-300 hover:border-zinc-700 hover:text-zinc-100"
      }`}
    >
      {children}
    </Link>
  );
}
