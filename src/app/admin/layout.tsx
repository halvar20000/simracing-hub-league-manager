import Link from "next/link";
import { requireSteward } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireSteward();
  const isAdmin = me.role === "ADMIN";

  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          {isAdmin ? "Admin" : "Steward"}
        </h2>
        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        {isAdmin && (
          <>
            <Link
              href="/admin/users"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Users
            </Link>
            <Link
              href="/admin/teams"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Teams
            </Link>
            <Link
              href="/admin/scoring-systems"
              className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
            >
              Scoring systems
            </Link>
          </>
        )}
      </aside>
      <div>{children}</div>
    </div>
  );
}
