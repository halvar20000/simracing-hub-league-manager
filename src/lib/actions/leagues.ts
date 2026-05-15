"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/slug";

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

  await prisma.league.create({
    data: { name, slug, description, createdById: admin.id },
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

  if (!name) {
    redirect(`/admin/leagues/${id}/edit?error=Name+is+required`);
  }

  const updated = await prisma.league.update({
    where: { id },
    data: {
      name,
      description,
      discordRegistrationsWebhookUrl,
      registrationNotifyEmails,
      paypalUsername,
      registrationFee,
      registrationFeeCurrency,
      discordGuildId,
      discordRsvpChannelId,
      discordRsvpRoleId,
      discordEmbedColor,
      rsvpDaysBefore,
      rsvpMode,
      rsvpCloseBeforeHours,
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
