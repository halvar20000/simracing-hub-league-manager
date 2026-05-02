import { requireAdmin } from "@/lib/auth-helpers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { updateLeague } from "@/lib/actions/leagues";

export default async function EditLeaguePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  await requireAdmin();
  const { slug } = await params;
  const league = await prisma.league.findUnique({ where: { slug } });
  if (!league) notFound();

  const update = updateLeague.bind(null, league.id);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/admin/leagues/${league.slug}`}
          className="text-sm text-zinc-400 hover:text-zinc-200"
        >
          ← Back to {league.name}
        </Link>
        <h1 className="mt-2 text-2xl font-bold">Edit League</h1>
      </div>

      <form action={update} className="max-w-xl space-y-4">
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Name</span>
          <input
            name="name"
            required
            defaultValue={league.name}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">Description</span>
          <textarea
            name="description"
            defaultValue={league.description ?? ""}
            rows={4}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Email recipients for new registrations (one per line)
          </span>
          <textarea
            name="registrationNotifyEmails"
            rows={3}
            defaultValue={(league.registrationNotifyEmails ?? []).join("\n")}
            placeholder={"admin@example.com\nsteward@example.com"}
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Sent via Resend. Requires RESEND_API_KEY in env. Leave blank to disable.
          </span>
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-zinc-300">
            Discord webhook URL for registrations (optional)
          </span>
          <input
            name="discordRegistrationsWebhookUrl"
            type="url"
            defaultValue={league.discordRegistrationsWebhookUrl ?? ""}
            placeholder="https://discord.com/api/webhooks/..."
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:border-orange-500 focus:outline-none"
          />
          <span className="mt-1 block text-xs text-zinc-500">
            Posts a message to your Discord channel each time a driver
            submits a registration. Leave blank to disable. Get the URL
            in Discord via Channel Settings → Integrations → Webhooks.
          </span>
        </label>

        <div className="flex gap-2">
          <button
            type="submit"
            className="rounded bg-orange-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-orange-400"
          >
            Save changes
          </button>
          <Link
            href={`/admin/leagues/${league.slug}`}
            className="rounded border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
