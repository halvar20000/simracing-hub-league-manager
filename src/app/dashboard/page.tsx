import { auth, signIn } from "@/auth";

export default async function DashboardPage() {
  const session = await auth();

  if (!session?.user) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-zinc-400">You need to sign in to access this page.</p>
        <form
          action={async () => {
            "use server";
            await signIn("discord", { redirectTo: "/dashboard" });
          }}
        >
          <button
            type="submit"
            className="rounded bg-indigo-600 px-4 py-2 font-medium hover:bg-indigo-500"
          >
            Sign in with Discord
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="rounded border border-zinc-800 bg-zinc-900 p-6">
        <p>
          Signed in as{" "}
          <span className="font-semibold">{session.user.name}</span>
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          User ID: <code>{session.user.id}</code>
        </p>
        <p className="text-sm text-zinc-400">
          Role: <code>{session.user.role}</code>
        </p>
      </div>
      <p className="text-sm text-zinc-500">
        More views will arrive in Week 2 (leagues, seasons, registrations).
      </p>
    </div>
  );
}
