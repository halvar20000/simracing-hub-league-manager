import { requireSteward } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import AdminTabs from "@/components/AdminTabs";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const me = await requireSteward();
  const isAdmin = me.role === "ADMIN";

  const pendingReports = await prisma.incidentReport.count({
    where: { status: "SUBMITTED" },
  });

  return (
    <div className="space-y-6">
      <AdminTabs isAdmin={isAdmin} pendingReports={pendingReports} />
      <div>{children}</div>
    </div>
  );
}
