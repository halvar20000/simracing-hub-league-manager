import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { formatDateTime } from "@/lib/date";
import { setUserRole } from "@/lib/actions/admin-users";
import type { Role } from "@prisma/client";
import TableFilter from "@/components/TableFilter";

export default async function AdminUsers() {
  await requireAdmin();
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
          admin, {users.filter((u) => u.role === "STEWARD").length} steward,{" "}
          {users.filter((u) => u.role === "DRIVER").length} driver
        </p>
      </div>

      <TableFilter tableId="usersTable" placeholder="Filter users by name, email, iRacing ID…" />

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table id="usersTable" className="w-full min-w-[1100px] text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">iRacing ID</th>
              <th className="px-3 py-2" title="Sports Car iRating (from members-ng.iracing.com sync)">SC iR</th>
              <th className="px-3 py-2" title="Sports Car Safety Rating">SC SR</th>
              <th className="px-3 py-2" title="Sports Car license class">SC Lic</th>
              <th className="px-3 py-2" title="Formula Car iRating">FC iR</th>
              <th className="px-3 py-2" title="Oval iRating">Oval iR</th>
              <th className="px-3 py-2" title="Last refresh of the iRacing data block">Synced</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2 text-right">Set role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr
                key={u.id}
                data-filter={[
                  u.firstName,
                  u.lastName,
                  u.name,
                  u.email,
                  u.iracingMemberId,
                  u.role,
                  u.iratingSportsCar,
                  u.licenseClassSportsCar,
                ]
                  .filter((x) => x != null && x !== "")
                  .join(" ")
                  .toLowerCase()}
                className="border-t border-zinc-800 hover:bg-zinc-900"
              >
                <td className="px-3 py-2 font-medium">
                  {u.firstName ?? ""} {u.lastName ?? u.name ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400">{u.email ?? "—"}</td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.iracingMemberId ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-200 tabular-nums">
                  {u.iratingSportsCar ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.safetyRatingSportsCar != null
                    ? u.safetyRatingSportsCar.toFixed(2)
                    : "—"}
                </td>
                <td className="px-3 py-2 text-xs">
                  <LicenseBadge cls={u.licenseClassSportsCar} />
                </td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.iratingFormulaCar ?? "—"}
                </td>
                <td className="px-3 py-2 text-zinc-400 tabular-nums">
                  {u.iratingOval ?? "—"}
                </td>
                <td
                  className="px-3 py-2 text-[11px] text-zinc-500 whitespace-nowrap"
                  title={
                    u.iracingLastSyncedAt
                      ? new Date(u.iracingLastSyncedAt).toLocaleString()
                      : "Never synced"
                  }
                >
                  {u.iracingLastSyncedAt
                    ? new Date(u.iracingLastSyncedAt).toLocaleDateString()
                    : "—"}
                </td>
                <td className="px-3 py-2">
                  <RoleBadge role={u.role} />
                </td>
                <td className="px-3 py-2 text-xs text-zinc-500">
                  {formatDateTime(u.createdAt)}
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id === myId ? (
                    <span className="text-xs text-zinc-500">(you)</span>
                  ) : (
                    <RoleSelector currentRole={u.role} userId={u.id} />
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

function RoleSelector({
  currentRole,
  userId,
}: {
  currentRole: Role;
  userId: string;
}) {
  return (
    <div className="flex justify-end gap-1">
      {(["ADMIN", "STEWARD", "DRIVER"] as Role[]).map((role) => (
        <form key={role} action={setUserRole.bind(null, userId, role)}>
          <button
            type="submit"
            disabled={currentRole === role}
            className={`rounded px-2 py-1 text-xs ${
              currentRole === role
                ? "cursor-default bg-zinc-800 text-zinc-500"
                : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {role.charAt(0) + role.slice(1).toLowerCase()}
          </button>
        </form>
      ))}
    </div>
  );
}

/**
 * Small coloured pill for the iRacing Sports Car license class. Empty
 * (or Rookie) gets a muted style so the column still scans cleanly when
 * a driver hasn't raced Sports Car yet.
 */
function LicenseBadge({ cls }: { cls: string | null }) {
  if (!cls) return <span className="text-zinc-600">—</span>;
  const styles: Record<string, string> = {
    "Class A": "bg-emerald-900/40 text-emerald-200 border-emerald-700/50",
    "Class B": "bg-blue-900/40 text-blue-200 border-blue-700/50",
    "Class C": "bg-amber-900/40 text-amber-200 border-amber-700/50",
    "Class D": "bg-orange-900/40 text-orange-200 border-orange-700/50",
    Rookie: "bg-zinc-800 text-zinc-400 border-zinc-700",
    Pro: "bg-fuchsia-900/40 text-fuchsia-200 border-fuchsia-700/50",
  };
  return (
    <span
      className={`inline-block rounded border px-1.5 py-0.5 text-[10px] ${
        styles[cls] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"
      }`}
    >
      {cls}
    </span>
  );
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<string, string> = {
    ADMIN: "bg-orange-900 text-orange-200",
    STEWARD: "bg-blue-900 text-blue-200",
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
