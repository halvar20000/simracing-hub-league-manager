"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { postDiscordWebhook } from "@/lib/discord-webhook";
import { sendResendEmail } from "@/lib/resend-email";

export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
  token: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect("/leagues");
  }

  if (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE") {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}?error=Registration+is+not+open`
    );
  }

  if (season.registrationToken && season.registrationToken !== token) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}?error=Registration+is+link-protected`
    );
  }


  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
  if (
    !user ||
    !user.firstName ||
    !user.lastName ||
    !user.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  const startNumberRaw = String(formData.get("startNumber") ?? "").trim();
  const startNumber = startNumberRaw ? parseInt(startNumberRaw, 10) : null;
  const teamIdFromDropdown =
    String(formData.get("teamId") ?? "").trim() || null;
  const newTeamName = String(formData.get("newTeamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;

  // Resolve team:
  //   - If newTeamName is provided, find or create that team (it wins)
  //   - Otherwise use the team from the dropdown
  let teamId: string | null = teamIdFromDropdown;
  if (newTeamName) {
    const existingTeam = await prisma.team.findUnique({
      where: { seasonId_name: { seasonId, name: newTeamName } },
    });
    if (existingTeam) {
      teamId = existingTeam.id;
    } else {
      const created = await prisma.team.create({
        data: { seasonId, name: newTeamName },
      });
      teamId = created.id;
    }
  }

  if (season.isMulticlass && !carClassId) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Class+is+required+for+multiclass+seasons`
    );
  }

  const existing = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId, userId: user.id } },
  });

  if (existing && existing.status === "APPROVED") {
    redirect(
      `/registrations?error=You+are+already+approved+for+this+season`
    );
  }

  if (existing) {
    await prisma.registration.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
        approvedById: null,
        approvedAt: null,
      },
    });
  } else {
    await prisma.registration.create({
      data: {
        seasonId,
        userId: user.id,
        status: "PENDING",
        startNumber,
        teamId,
        carClassId,
        notes,
      },
    });
  }

  // Fire-and-forget Discord webhook (non-blocking)
  try {
    const lg = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { discordRegistrationsWebhookUrl: true },
    });
    const webhookUrl = lg?.discordRegistrationsWebhookUrl;
    if (webhookUrl) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      const teamLabel = teamId
        ? (await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }))?.name ?? "—"
        : "Independent";
      const className = carClassId
        ? (await prisma.carClass.findUnique({ where: { id: carClassId }, select: { name: true } }))?.name ?? "—"
        : null;
      const fields = [
        { name: "Driver", value: `${user.firstName} ${user.lastName}`, inline: true },
        { name: "iRacing ID", value: String(user.iracingMemberId), inline: true },
        { name: "Start #", value: startNumber != null ? `#${startNumber}` : "—", inline: true },
        { name: "Team", value: teamLabel, inline: true },
      ];
      if (className) fields.push({ name: "Class", value: className, inline: true });
      if (notes) fields.push({ name: "Notes", value: notes, inline: false });
      await postDiscordWebhook(webhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: `📝 New registration — ${season.league.name} ${season.name}`,
            description:
              existing && existing.status !== "PENDING"
                ? `Updated registration (was ${existing.status.toLowerCase()})`
                : "New pending registration awaiting approval",
            url: `${baseUrl}/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`,
            color: 0xff6b35,
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    }
  } catch {
    // Never block registration on webhook failure
  }

  // Fire-and-forget email notification(s)
  try {
    const lg2 = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { registrationNotifyEmails: true },
    });
    const recipients = (lg2?.registrationNotifyEmails ?? []).filter(
      (e) => typeof e === "string" && /@/.test(e)
    );
    if (recipients.length > 0) {
      const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      const rosterUrl = `${baseUrl}/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`;
      const teamLabel2 = teamId
        ? (await prisma.team.findUnique({ where: { id: teamId }, select: { name: true } }))?.name ?? "—"
        : "Independent";
      const className2 = carClassId
        ? (await prisma.carClass.findUnique({ where: { id: carClassId }, select: { name: true } }))?.name ?? "—"
        : null;

      const subject =
        existing && existing.status !== "PENDING"
          ? `Updated registration — ${season.league.name} ${season.name}`
          : `New registration — ${season.league.name} ${season.name}`;

      const escape = (v: string | number | null | undefined) =>
        String(v ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;");

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
          <h2 style="margin: 0 0 8px 0; color: #ff6b35;">📝 ${escape(subject)}</h2>
          <p style="margin: 0 0 16px 0; color: #52525b; font-size: 13px;">
            ${existing && existing.status !== "PENDING" ? "Updated registration (was " + escape(existing.status.toLowerCase()) + ")" : "New pending registration awaiting approval"}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #71717a; width: 110px;">Driver</td><td>${escape(user.firstName)} ${escape(user.lastName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">iRacing ID</td><td>${escape(user.iracingMemberId)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Start #</td><td>${startNumber != null ? "#" + escape(startNumber) : "—"}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Team</td><td>${escape(teamLabel2)}</td></tr>
            ${className2 ? `<tr><td style="padding: 6px 0; color: #71717a;">Class</td><td>${escape(className2)}</td></tr>` : ""}
            ${notes ? `<tr><td style="padding: 6px 0; color: #71717a; vertical-align: top;">Notes</td><td>${escape(notes)}</td></tr>` : ""}
          </table>
          <p style="margin-top: 20px;">
            <a href="${rosterUrl}" style="display: inline-block; background: #ff6b35; color: #18181b; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open roster</a>
          </p>
          <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring</p>
        </div>
      `;

      const text = [
        subject,
        "",
        `Driver: ${user.firstName} ${user.lastName}`,
        `iRacing ID: ${user.iracingMemberId}`,
        `Start #: ${startNumber != null ? "#" + startNumber : "—"}`,
        `Team: ${teamLabel2}`,
        className2 ? `Class: ${className2}` : null,
        notes ? `Notes: ${notes}` : null,
        "",
        `Open roster: ${rosterUrl}`,
      ].filter((x): x is string => x !== null).join("\n");

      await sendResendEmail({ to: recipients, subject, html, text });
    }
  } catch {
    // Never block registration on email failure
  }


  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`
  );
  redirect("/registrations?success=1");
}

export async function withdrawRegistration(registrationId: string) {
  const sessionUser = await requireAuth();

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { season: { include: { league: true } } },
  });
  if (!reg || reg.userId !== sessionUser.id) {
    redirect("/registrations");
  }

  await prisma.registration.update({
    where: { id: registrationId },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath("/registrations");
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  redirect("/registrations");
}
