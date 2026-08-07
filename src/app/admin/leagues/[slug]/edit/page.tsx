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

        <div className="space-y-2">
          <span className="mb-1 block text-sm text-zinc-300">Logo</span>
          {league.logoUrl && (
            <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-900 p-2">
              {/* Use plain <img> so SVG / Blob URLs work without Next/Image
                  config for those domains. */}
              <img
                src={league.logoUrl}
                alt={`${league.name} logo`}
                className="h-12 w-12 rounded object-contain bg-zinc-950"
              />
              <span className="flex-1 truncate text-xs text-zinc-500">
                {league.logoUrl}
              </span>
              <label className="inline-flex items-center gap-1 text-xs text-zinc-400">
                <input type="checkbox" name="removeLogo" value="1" />
                Remove on save
              </label>
            </div>
          )}
          <input
            type="file"
            name="logoFile"
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            className="block w-full text-sm text-zinc-300 file:mr-3 file:rounded file:border-0 file:bg-zinc-800 file:px-3 file:py-1.5 file:text-sm file:text-zinc-200 hover:file:bg-zinc-700"
          />
          <span className="block text-xs text-zinc-500">
            PNG / JPG / WebP / SVG / GIF · max 5 MB. Upload to replace
            the current logo, or tick &quot;Remove on save&quot; to clear
            it without uploading a new one.
          </span>
        </div>
        <label className="flex items-start gap-2 rounded border border-zinc-800 bg-zinc-900/50 p-3">
          <input
            type="checkbox"
            name="isArchived"
            value="1"
            defaultChecked={league.isArchived}
            className="mt-0.5 h-4 w-4 accent-orange-500"
          />
          <span className="text-sm">
            <span className="font-medium text-zinc-200">
              Archive this league
            </span>
            <span className="mt-0.5 block text-xs text-zinc-500">
              Hidden from the home page, league list, rosters and the overlay
              API. Admin pages and direct links keep working. Untick to bring
              it back.
            </span>
          </span>
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
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                RSVP role ID — @-mention on initial post (optional)
              </span>
              <input
                name="discordRsvpRoleId"
                type="text"
                defaultValue={league.discordRsvpRoleId ?? ""}
                placeholder="e.g. 1224317904145616946"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block w-44">
              <span className="mb-1 block text-xs text-zinc-400">
                Embed color (hex, optional)
              </span>
              <input
                name="discordEmbedColor"
                type="text"
                defaultValue={league.discordEmbedColor ?? ""}
                placeholder="#EB459E"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Reports channel ID — “incident reports open” post
              </span>
              <input
                name="discordReportsChannelId"
                type="text"
                defaultValue={league.discordReportsChannelId ?? ""}
                placeholder="defaults to the RSVP channel"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Posted once per round when the protest window opens. Leave
                empty to use the RSVP channel above; clear both to switch the
                announcement off.
              </span>
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Stream channel ID (Twitch announcement bot)
              </span>
              <input
                name="discordStreamChannelId"
                type="text"
                defaultValue={league.discordStreamChannelId ?? ""}
                placeholder="e.g. 1234567890123456789"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[16rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Default Twitch URL (per-round override available)
              </span>
              <input
                name="twitchUrl"
                type="url"
                defaultValue={league.twitchUrl ?? ""}
                placeholder="https://twitch.tv/cas-sim-tv"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[16rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                YouTube channel — auto-link race stream (optional)
              </span>
              <input
                name="youtubeChannelId"
                type="text"
                defaultValue={league.youtubeChannelId ?? ""}
                placeholder="@cas-tech-performance7363 or UC…"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Channel @handle (from the channel URL) or ID —{" "}
                <strong className="text-zinc-400">not a URL</strong>, and not a
                Twitch link (use the Twitch field below for that). A cron finds
                the stream VOD for each completed round and embeds it on the
                round page. Requires <code>YOUTUBE_API_KEY</code> in env.
              </span>
            </label>
            <label className="block flex-1 min-w-[16rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Twitch channel — auto-link race VOD (optional)
              </span>
              <input
                name="twitchChannelLogin"
                type="text"
                defaultValue={league.twitchChannelLogin ?? ""}
                placeholder="maxstion"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                The channel name from <code>twitch.tv/&lt;name&gt;</code> (a
                full URL is accepted and trimmed down). A cron matches each
                completed round to the broadcast that started around the race
                time and embeds it on the round page. Requires{" "}
                <code>TWITCH_CLIENT_ID</code> + <code>TWITCH_CLIENT_SECRET</code>{" "}
                in env. Note: Twitch deletes past broadcasts after 7-60 days —
                only Highlights and Uploads stay permanently.
              </span>
            </label>
            <label className="block flex-1 min-w-[16rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Garage 61 team URL (optional)
              </span>
              <input
                name="garage61TeamUrl"
                type="url"
                defaultValue={league.garage61TeamUrl ?? ""}
                placeholder="https://garage61.net/app/teams/..."
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
              <span className="mt-1 block text-[11px] text-zinc-500">
                Open your team in Garage 61, then copy the URL from the
                address bar. Drivers must be team members for the link to
                show anything.
              </span>
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Results channel ID — auto-post after each race (optional)
              </span>
              <input
                name="discordResultsChannelId"
                type="text"
                defaultValue={league.discordResultsChannelId ?? ""}
                placeholder="e.g. 234567890123456789"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block flex-1 min-w-[12rem]">
              <span className="mb-1 block text-xs text-zinc-400">
                Welcome channel ID — daily new-member greeting (optional)
              </span>
              <input
                name="discordWelcomeChannelId"
                type="text"
                defaultValue={league.discordWelcomeChannelId ?? ""}
                placeholder="e.g. 234567890123456789"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm font-mono text-zinc-100"
              />
            </label>
            <label className="block w-full">
              <span className="mb-1 block text-xs text-zinc-400">
                Welcome message (optional) — write {"{names}"} where the new
                members&apos; names should appear; leave blank for a default
              </span>
              <textarea
                name="discordWelcomeMessage"
                rows={3}
                defaultValue={league.discordWelcomeMessage ?? ""}
                placeholder="Welcome to the CAS community, {names}! …"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
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
            <label className="block">
              <span className="mb-1 block text-xs text-zinc-400">
                Close RSVP N hours before
              </span>
              <input
                name="rsvpCloseBeforeHours"
                type="number"
                min={0}
                max={72}
                step={1}
                defaultValue={league.rsvpCloseBeforeHours ?? 1}
                className="w-24 rounded border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
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
