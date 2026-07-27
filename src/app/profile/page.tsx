import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import ProfileForm from "@/components/ProfileForm";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/api/auth/signin?callbackUrl=/profile");
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });
  if (!user) redirect("/api/auth/signin");

  const { error, success } = await searchParams;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Profile</h1>
        <p className="mt-1 text-sm text-zinc-400">
          Required before you can register for a season. Start with your
          iRacing ID — if we already know you, your name fills in
          automatically.
        </p>
      </div>

      {success && (
        <div className="rounded border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">
          Profile saved.
        </div>
      )}
      {error && (
        <div className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-200">
          {error}
        </div>
      )}

      <ProfileForm
        initial={{
          firstName: user.firstName ?? "",
          lastName: user.lastName ?? "",
          email: user.email ?? "",
          iracingMemberId: user.iracingMemberId ?? "",
        }}
      />

      <div className="rounded border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-semibold text-zinc-200">Race Logger</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Record your races on your own PC and let the log reach CLS by itself — it feeds
          Driver of the Day and the stint-planner analysis.
        </p>
        <Link
          href="/race-logger"
          className="mt-3 inline-block rounded border border-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-800"
        >
          Set up the race logger →
        </Link>
      </div>
    </div>
  );
}
