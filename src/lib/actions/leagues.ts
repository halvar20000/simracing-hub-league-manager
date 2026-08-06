"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/slug";
import { uploadLogoIfProvided } from "@/lib/logo-upload";
import { normalizeChannelLogin } from "@/lib/twitch";

export async function createLeague(formData: FormData) {
  const admin = await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  if (!name) {
    redirect("/admin/leagues/new?error=Name+is+required");
  }

  const baseSlug = slugify(name);
  let slug = baseSlug;
  let counter = 1;
  while (await prisma.league.findUnique({ where: { slug } })) {
    slug = `${baseSlug}-${counter++}`;
  }

  // Upload logo (if any) before the DB insert so we can fail loudly
  // without leaving a half-created league behind.
  const upload = await uploadLogoIfProvided(formData, `league-logos/${slug}`);
  if (upload.error) {
    redirect(`/admin/leagues/new?error=${encodeURIComponent(upload.error)}`);
  }

  await prisma.league.create({
    data: {
      name,
      slug,
      description,
      logoUrl: upload.url,
      createdById: admin.id,
    },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${slug}`);
}

export async function updateLeague(id: string, formData: FormData) {
  await requireAdmin();

  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim() || null;

  const webhookRaw = String(formData.get("discordRegistrationsWebhookUrl") ?? "").trim();
  const discordRegistrationsWebhookUrl = webhookRaw || null;

  const emailsRaw = String(formData.get("registrationNotifyEmails") ?? "");
  const registrationNotifyEmails = emailsRaw
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter((e) => e.length > 0 && /@/.test(e));

  const paypalUsername =
    String(formData.get("paypalUsername") ?? "").trim() || null;

  const feeRaw = String(formData.get("registrationFee") ?? "").trim();
  const registrationFee =
    feeRaw && /^\d+$/.test(feeRaw) ? parseInt(feeRaw, 10) : null;

  const currencyRaw = String(formData.get("registrationFeeCurrency") ?? "")
    .trim()
    .toUpperCase();
  const registrationFeeCurrency = currencyRaw || "EUR";

  // Per-round RSVP Discord integration
  const discordGuildId =
    String(formData.get("discordGuildId") ?? "").trim() || null;
  const discordRsvpChannelId =
    String(formData.get("discordRsvpChannelId") ?? "").trim() || null;
  const discordRsvpRoleId =
    String(formData.get("discordRsvpRoleId") ?? "").trim() || null;
  // Embed color: accept "#RRGGBB" or "RRGGBB"; reject anything else by
  // storing null so the embed falls back to its default.
  const embedColorRaw = String(formData.get("discordEmbedColor") ?? "").trim();
  const discordEmbedColor = /^#?[0-9a-fA-F]{6}$/.test(embedColorRaw)
    ? embedColorRaw.startsWith("#")
      ? embedColorRaw
      : "#" + embedColorRaw
    : null;

  // Twitch stream announcement bot — channel + default Twitch URL.
  const discordStreamChannelId =
    String(formData.get("discordStreamChannelId") ?? "").trim() || null;
  const twitchUrl = String(formData.get("twitchUrl") ?? "").trim() || null;

  // YouTube channel for auto-linking each round's stream VOD. Stored as the
  // admin typed it (an @handle or a "UC…" channel ID); resolved at match time.
  // Reject anything URL-shaped up front: pasting a channel URL (or worse, a
  // Twitch URL) here used to be accepted silently and then fail forever inside
  // the cron, with no visible error anywhere. A youtube.com/@handle URL is
  // salvageable, so trim it down instead of rejecting.
  const youtubeChannelIdRaw = String(
    formData.get("youtubeChannelId") ?? ""
  ).trim();
  let youtubeChannelId: string | null = youtubeChannelIdRaw || null;
  if (youtubeChannelId) {
    const ytHandle = youtubeChannelId.match(
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/(@[\w.-]+)/i
    );
    const ytChannelId = youtubeChannelId.match(
      /^(?:https?:\/\/)?(?:www\.)?youtube\.com\/channel\/(UC[\w-]{22})/i
    );
    if (ytHandle) youtubeChannelId = ytHandle[1];
    else if (ytChannelId) youtubeChannelId = ytChannelId[1];
    else if (/^https?:\/\//i.test(youtubeChannelId) || /\//.test(youtubeChannelId)) {
      redirect(
        `/admin/leagues/${id}/edit?error=${encodeURIComponent(
          "The YouTube channel field takes an @handle or a UC… channel ID, not a URL. For a Twitch stream, use the “Twitch channel” field instead."
        )}`
      );
    }
  }

  // Twitch channel login for auto-linking each round's broadcast VOD. Accepts
  // a bare login, "@login" or a full twitch.tv URL; stored normalized.
  const twitchChannelLoginRaw = String(
    formData.get("twitchChannelLogin") ?? ""
  ).trim();
  let twitchChannelLogin: string | null = null;
  if (twitchChannelLoginRaw) {
    twitchChannelLogin = normalizeChannelLogin(twitchChannelLoginRaw);
    if (!twitchChannelLogin) {
      redirect(
        `/admin/leagues/${id}/edit?error=${encodeURIComponent(
          "That doesn't look like a Twitch channel name. Use the name from twitch.tv/<name>, e.g. maxstion."
        )}`
      );
    }
  }

  // Discord results-post + new-member welcome bot config.
  const discordResultsChannelId =
    String(formData.get("discordResultsChannelId") ?? "").trim() || null;
  const discordWelcomeChannelId =
    String(formData.get("discordWelcomeChannelId") ?? "").trim() || null;
  const discordWelcomeMessage =
    String(formData.get("discordWelcomeMessage") ?? "").trim() || null;

  // Garage 61 team URL (optional). Validate that it points at garage61.net
  // so a typo doesn't go silently into the DB.
  const garage61TeamUrlRaw = String(
    formData.get("garage61TeamUrl") ?? ""
  ).trim();
  const garage61TeamUrl =
    garage61TeamUrlRaw &&
    /^https?:\/\/(www\.)?garage61\.net\//i.test(garage61TeamUrlRaw)
      ? garage61TeamUrlRaw
      : null;
  const daysBeforeRaw = String(formData.get("rsvpDaysBefore") ?? "").trim();
  const rsvpDaysBefore =
    daysBeforeRaw && /^\d+$/.test(daysBeforeRaw)
      ? Math.max(1, Math.min(30, parseInt(daysBeforeRaw, 10)))
      : 7;

  const rsvpModeRaw = String(formData.get("rsvpMode") ?? "FULL").trim();
  const rsvpMode = rsvpModeRaw === "DECLINE_ONLY" ? "DECLINE_ONLY" : "FULL";

  const closeHoursRaw = String(formData.get("rsvpCloseBeforeHours") ?? "").trim();
  const rsvpCloseBeforeHours =
    closeHoursRaw && /^\d+$/.test(closeHoursRaw)
      ? Math.max(0, Math.min(72, parseInt(closeHoursRaw, 10)))
      : 1;

  // Archived leagues are hidden from all public pages; admin keeps access.
  const isArchived = String(formData.get("isArchived") ?? "") === "1";

  if (!name) {
    redirect(`/admin/leagues/${id}/edit?error=Name+is+required`);
  }

  // Logo upload (optional). When admin ticks "Remove existing logo" we
  // clear the URL but DON'T delete the underlying blob — older Round/
  // Season pages may still reference it via cached HTML. When a new
  // file is uploaded we replace the URL and try to del() the previous
  // blob (best-effort; ignore failures).
  const existing = await prisma.league.findUnique({
    where: { id },
    select: { slug: true, logoUrl: true },
  });
  if (!existing) {
    redirect(`/admin/leagues/${id}/edit?error=League+not+found`);
  }
  const removeLogo = formData.get("removeLogo") === "1";
  const upload = await uploadLogoIfProvided(
    formData,
    `league-logos/${existing.slug}`
  );
  if (upload.error) {
    redirect(
      `/admin/leagues/${id}/edit?error=${encodeURIComponent(upload.error)}`
    );
  }
  let logoUrl: string | null | undefined = undefined; // leave unchanged
  if (upload.url) {
    logoUrl = upload.url;
    if (existing.logoUrl) {
      try {
        await del(existing.logoUrl);
      } catch {
        /* best-effort */
      }
    }
  } else if (removeLogo) {
    logoUrl = null;
  }

  const updated = await prisma.league.update({
    where: { id },
    data: {
      name,
      description,
      ...(logoUrl !== undefined ? { logoUrl } : {}),
      discordRegistrationsWebhookUrl,
      registrationNotifyEmails,
      paypalUsername,
      registrationFee,
      registrationFeeCurrency,
      discordGuildId,
      discordRsvpChannelId,
      discordRsvpRoleId,
      discordEmbedColor,
      discordStreamChannelId,
      twitchUrl,
      youtubeChannelId,
      twitchChannelLogin,
      discordResultsChannelId,
      discordWelcomeChannelId,
      discordWelcomeMessage,
      garage61TeamUrl,
      rsvpDaysBefore,
      rsvpMode,
      rsvpCloseBeforeHours,
      isArchived,
    },
  });

  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect(`/admin/leagues/${updated.slug}`);
}

export async function deleteLeague(id: string) {
  await requireAdmin();
  await prisma.league.delete({ where: { id } });
  revalidatePath("/admin/leagues");
  revalidatePath("/leagues");
  redirect("/admin/leagues");
}
