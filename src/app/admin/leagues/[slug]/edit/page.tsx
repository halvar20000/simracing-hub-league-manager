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

        <fieldset className="rounded border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <legend className="px-2 text-sm text-zinc-300">
            Per-round RSVP (Discord bot)
          </legend>
          <p className="text-xs text-zinc-500">
            Configure the channel where the bot will post Accept / Decline /
            Tentative buttons before each round. Set <code>DISCORD_BOT_TOKEN</code>,{" "}
            <code>DISCORD_PUBLIC_KEY</code> and <code>DISCORD_APPLICATION_ID</code>{" "}
            as Vercel env vars; the bot needs the <em>Send Messages</em> and{" "}
            <em>Embed Links</em> permissions and{" "}
            <em>applications.commands</em> scope.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Discord Guild ID (optional)
              </span>
              <input
                name="discordGuildId"
                type="text"
                defaultValue={league.discordGuildId ?? ""}
                placeholder="e.g. 123456789012345678"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                RSVP channel ID
              </span>
              <input
                name="discordRsvpChannelId"
                type="text"
                defaultValue={league.discordRsvpChannelId ?? ""}
                placeholder="e.g. 234567890123456789"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">
                Post N days before
              </span>
              <input
                name="rsvpDaysBefore"
                type="number"
                min={1}
                max={30}
                step={1}
                defaultValue={league.rsvpDaysBefore ?? 7}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[16rem]">
              <span className="mb-1 block text-xs text-zinc-400">RSVP mode</span>
              <select
                name="rsvpMode"
                defaultValue={league.rsvpMode ?? "FULL"}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              >
                <option value="FULL">Full — Accept / Decline / Tentative</option>
                <option value="DECLINE_ONLY">
                  Decline only — silent drivers are assumed racing
                </option>
              </select>
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            In Discord, enable Developer Mode (User Settings → Advanced) and
            right-click a channel → Copy Channel ID.
          </p>
          <p className="text-xs text-zinc-500">
            <strong>Decline only mode:</strong> Only a red Decline button is
            shown. Drivers who can race don&apos;t need to click anything. The
            no-show penalty for GT3 WCT still works — declined drivers are
            exempt, silent no-shows get the penalty point.
          </p>
        </fieldset>

        <fieldset className="rounded border border-zinc-800 bg-zinc-900/50 p-4 space-y-3">
          <legend className="px-2 text-sm text-zinc-300">
            Registration fee (optional)
          </legend>
          <p className="text-xs text-zinc-500">
            If set, drivers will see a PayPal payment link after registering.
            The link uses Friends &amp; Family + their real name as reference,
            shown automatically.
          </p>
          <div className="flex flex-wrap gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Amount</span>
              <input
                name="registrationFee"
                type="number"
                min={0}
                step={1}
                defaultValue={league.registrationFee ?? ""}
                placeholder="10"
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">Currency</span>
              <input
                name="registrationFeeCurrency"
                type="text"
                defaultValue={league.registrationFeeCurrency ?? "EUR"}
                placeholder="EUR"
                maxLength={3}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm uppercase text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                PayPal.me username
              </span>
              <input
                name="paypalUsername"
                type="text"
                defaultValue={league.paypalUsername ?? ""}
                placeholder="auro2082"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
          </div>
          <p className="text-xs text-zinc-500">
            Generates link:{" "}
            <code className="rounded bg-zinc-800 px-1.5 py-0.5">
              paypal.me/&lt;username&gt;/&lt;amount&gt;&lt;currency&gt;
            </code>
          </p>
        </fieldset>

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
