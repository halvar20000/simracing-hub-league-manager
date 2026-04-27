import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { formatDateTime } from "@/lib/date";
import {
  promoteUserToAdmin,
  demoteUserToDriver,
} from "@/lib/actions/admin-users";

export default async function AdminUsers() {
  const session = await auth();
  const myId = session?.user?.id;

  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { lastName: "asc" }, { firstName: "asc" }],
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {users.length} total — {users.filter((u) => u.role === "ADMIN").length}{" "}
          admin, {users.filter((u) => u.role === "DRIVER").length} driver
        </p>
      </div>

      <div className="overflow-hidden rounded border border-zinc-800">
        <table className="w-full text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">iRacing ID</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">
                  {u.firstName ?? ""} {u.lastName ?? u.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400">{u.email ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.iracingMemberId ?? "—"}
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-3 py-2 text-zinc-500 text-xs">
                  {formatDateTime(u.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id === myId ? (
                    <span className="text-xs text-zinc-500">(you)</span>
                  ) : u.role === "ADMIN" ? (
                    <form action={demoteUserToDriver.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="rounded border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:bg-zinc-800"
                      >
                        Make Driver
                      </button>
                    </form>
                  ) : (
                    <form action={promoteUserToAdmin.bind(null, u.id)}>
                      <button
                        type="submit"
                        className="rounded bg-orange-500 px-2 py-1 text-xs font-medium text-zinc-950 hover:bg-orange-400"
                      >
                        Promote to Admin
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-orange-900 text-orange-200",
    DRIVER: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${styles[role] ?? ""}`}
    >
      {role}
    </span>
  );
}
