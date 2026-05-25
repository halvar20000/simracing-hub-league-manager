import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import TableFilter from "@/components/TableFilter";
import AdminUserRow from "@/components/AdminUserRow";

export default async function AdminUsers() {
  await requireAdmin();
  const session = await auth();
  const myId = session?.user?.id;

  const users = await prisma.user.findMany({
    orderBy: [
      { isActive: "desc" },
      { role: "asc" },
      { lastName: "asc" },
      { firstName: "asc" },
    ],
    include: {
      // The Discord ID from a website login lives on the OAuth Account, not
      // on User.discordId — pull it so the table can show it too.
      accounts: {
        where: { provider: "discord" },
        select: { providerAccountId: true },
      },
    },
  });

  const adminCount = users.filter((u) => u.role === "ADMIN").length;
  const stewardCount = users.filter((u) => u.role === "STEWARD").length;
  const driverCount = users.filter((u) => u.role === "DRIVER").length;
  const inactiveCount = users.filter((u) => !u.isActive).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Users</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {users.length} total — {adminCount} admin, {stewardCount} steward,{" "}
          {driverCount} driver
          {inactiveCount > 0 && (
            <>
              {" "}
              • <span className="text-zinc-500">{inactiveCount} inactive</span>
            </>
          )}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          <span className="text-zinc-300">Edit</span> changes a driver&apos;s
          name, email, iRacing ID, Discord ID or country. Setting a{" "}
          <span className="text-zinc-300">Discord ID</span> lets the RSVP bot
          recognise a driver who hasn&apos;t signed in to the website yet.{" "}
          <span className="text-zinc-300">Delete</span> is a soft delete — it
          deactivates the account and can be reversed with{" "}
          <span className="text-zinc-300">Restore</span>.
        </p>
      </div>

      <TableFilter
        tableId="usersTable"
        placeholder="Filter users by name, email, iRacing ID…"
      />

      <div className="overflow-x-auto rounded border border-zinc-800">
        <table id="usersTable" className="w-full min-w-[1480px] text-sm">
          <thead className="bg-zinc-900 text-left text-zinc-400">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">iRacing ID</th>
              <th
                className="px-3 py-2"
                title="Discord user ID. Editable values are admin-set; '· login' marks an ID that came from the driver signing in with Discord."
              >
                Discord ID
              </th>
              <th className="px-3 py-2">Country</th>
              <th
                className="px-3 py-2"
                title="Sports Car iRating (from members-ng.iracing.com sync)"
              >
                SC iR
              </th>
              <th className="px-3 py-2" title="Sports Car Safety Rating">
                SC SR
              </th>
              <th className="px-3 py-2" title="Sports Car license class">
                SC Lic
              </th>
              <th className="px-3 py-2" title="Formula Car iRating">
                FC iR
              </th>
              <th className="px-3 py-2" title="Oval iRating">
                Oval iR
              </th>
              <th
                className="px-3 py-2"
                title="Last refresh of the iRacing data block"
              >
                Synced
              </th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Joined</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <AdminUserRow
                key={u.id}
                user={u}
                isSelf={u.id === myId}
                accountDiscordId={u.accounts[0]?.providerAccountId ?? null}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
