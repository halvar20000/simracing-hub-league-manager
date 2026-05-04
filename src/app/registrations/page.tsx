import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { withdrawRegistration } from "@/lib/actions/registrations";
import { getLeaguePayment } from "@/lib/payment";
import PaymentNotice from "@/components/PaymentNotice";

export default async function MyRegistrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ success?: string; error?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/registrations");
  }

  const { success, error } = await searchParams;

  const registrations = await prisma.registration.findMany({
    where: { userId: session.user.id },
    include: {
      season: { include: { league: true } },
      team: true,
      carClass: true,
    },
    orderBy: { createdAt: "desc" },
  });

  const me = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { firstName: true, lastName: true },
  });
  const driverName = me ? `${me.firstName ?? ""} ${me.lastName ?? ""}`.trim() : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Registrations</h1>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Registration submitted. Awaiting admin approval.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {registrations.length === 0 ? (
        <div className="rounded border border-zinc-800 bg-zinc-900 p-6 text-center">
          <p className="text-zinc-400">
            You haven&apos;t registered for any seasons yet.
          </p>
          <Link
            href="/leagues"
            className="mt-2 inline-block text-orange-400 hover:underline"
          >
            Browse leagues →
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {registrations.map((r) => (
            <div
              key={r.id}
              className="rounded border border-zinc-800 bg-zinc-900 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {r.season.league.name} — {r.season.name} {r.season.year}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-zinc-400">
                    <StatusBadge status={r.status} />
                    {r.startNumber && (
                      <span className="text-zinc-500">
                        # {r.startNumber}
                      </span>
                    )}
                    {r.team && (
                      <span className="text-zinc-500">
                        • {r.team.name}
                      </span>
                    )}
                    {r.carClass && (
                      <span className="text-zinc-500">
                        • {r.carClass.name}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex gap-3 text-sm">
                  <Link
                    href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}`}
                    className="text-orange-400 hover:underline"
                  >
                    View season
                  </Link>
                  {(r.status === "PENDING" || r.status === "APPROVED") && (
                    <form
                      action={withdrawRegistration.bind(null, r.id)}
                    >
                      <button
                        type="submit"
                        className="text-zinc-400 hover:text-red-400"
                      >
                        Withdraw
                      </button>
                    </form>
                  )}
                  {(r.status === "WITHDRAWN" || r.status === "REJECTED") && (
                    <Link
                      href={`/leagues/${r.season.league.slug}/seasons/${r.season.id}/register`}
                      className="text-orange-400 hover:underline"
                    >
                      Re-register
                    </Link>
                  )}
                </div>
              </div>
              {(() => {
                const pi = getLeaguePayment(r.season.league);
                if (!pi) return null;
                const isPaid = r.startingFeePaid === "YES";
                return (
                  <div className="mt-3">
                    <PaymentNotice
                      payment={pi}
                      paid={isPaid}
                      driverName={driverName}
                    />
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: "bg-amber-900 text-amber-200",
    APPROVED: "bg-emerald-900 text-emerald-200",
    REJECTED: "bg-red-900 text-red-200",
    WITHDRAWN: "bg-zinc-800 text-zinc-400",
  };
  return (
    <span
      className={`inline-block rounded px-2 py-0.5 text-xs ${styles[status] ?? ""}`}
    >
      {status}
    </span>
  );
}
