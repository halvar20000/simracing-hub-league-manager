"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import { postDiscordWebhook } from "@/lib/discord-webhook";

export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
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
