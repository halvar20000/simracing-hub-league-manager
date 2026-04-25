import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireAdmin();

  return (
    <div className="grid gap-8 md:grid-cols-[200px_1fr]">
      <aside className="space-y-1 text-sm">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
          Admin
        </h2>
        <Link
          href="/admin"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Dashboard
        </Link>
        <Link
          href="/admin/leagues"
          className="block rounded px-3 py-2 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-100"
        >
          Leagues
        </Link>
      </aside>
      <div>{children}</div>
    </div>
  );
}
