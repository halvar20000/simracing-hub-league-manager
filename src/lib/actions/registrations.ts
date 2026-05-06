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
  const carId = String(formData.get("carId") ?? "").trim() || null;
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

  // Validate car if provided; auto-resolve carClassId for non-multiclass seasons
  let resolvedCarClassId: string | null = carClassId;
  if (carId) {
    const car = await prisma.car.findUnique({
      where: { id: carId },
      select: { seasonId: true, carClassId: true },
    });
    if (!car || car.seasonId !== seasonId) {
      redirect(
        `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Invalid+car`
      );
    }
    if (season.isMulticlass && carClassId && car.carClassId !== carClassId) {
      redirect(
        `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Car+does+not+belong+to+selected+class`
      );
    }
    if (!resolvedCarClassId) {
      resolvedCarClassId = car.carClassId;
    }
  }

  // If any class has cars defined, car selection is required
  const classesWithCars = await prisma.carClass.findMany({
    where: { seasonId, cars: { some: {} } },
    select: { id: true },
  });
  if (classesWithCars.length > 0 && !carId) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Car+is+required`
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
  const seasonHasStartedRound = await prisma.round.findFirst({
    where: {
      seasonId,
      countsForChampionship: true,
      startsAt: { lte: new Date() },
    },
    select: { id: true },
  });


  if (
    existing &&
    existing.carId &&
    (season.status === "ACTIVE" || !!seasonHasStartedRound) &&
    existing.carId !== carId
  ) {
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=Car+is+locked+after+season+start`
    );
  }


  if (existing) {
    await prisma.registration.update({
      where: { id: existing.id },
      data: {
        status: "PENDING",
        startNumber,
        teamId,
        carClassId: resolvedCarClassId,
        carId,
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
        carClassId: resolvedCarClassId,
        carId,
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

export async function createTeamRegistration(
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

  const leader = await prisma.user.findUnique({
    where: { id: sessionUser.id },
  });
  if (
    !leader ||
    !leader.firstName ||
    !leader.lastName ||
    !leader.iracingMemberId
  ) {
    redirect("/profile?error=Please+complete+your+profile+before+registering");
  }

  // ---------- parse form ----------
  const teamName = String(formData.get("teamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim();
  const carId = String(formData.get("carId") ?? "").trim();
  const LMP2_MIN_IRATING = 1500;
  const MAX_IRATING = 5000;
  const leaderIRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim() || null;

  const errBack = (msg: string) =>
    redirect(
      `/leagues/${leagueSlug}/seasons/${seasonId}/register?error=${encodeURIComponent(msg)}`
    );

  if (!teamName) errBack("Team name is required");
  if (!carClassId) errBack("Class is required");
  if (!carId) errBack("Car is required");

  // ---------- validate class + car ----------
  const carClass = await prisma.carClass.findUnique({
    where: { id: carClassId },
  });
  if (!carClass || carClass.seasonId !== seasonId) errBack("Invalid class");
  if (carClass!.isLocked) errBack("That class is locked — no new registrations");

  if (!leaderIRatingRaw || !/^\d+$/.test(leaderIRatingRaw)) {
    errBack("Your current iRating is required");
  }
  const leaderIRating = parseInt(leaderIRatingRaw, 10);
  if (leaderIRating > MAX_IRATING) {
    errBack(`iRating must be ${MAX_IRATING} or lower (you entered ${leaderIRating})`);
  }
  if (carClass!.shortCode === "LMP2" && leaderIRating < LMP2_MIN_IRATING) {
    errBack(`LMP2 requires iRating ${LMP2_MIN_IRATING} or higher (you entered ${leaderIRating})`);
  }

  const car = await prisma.car.findUnique({ where: { id: carId } });
  if (!car || car.seasonId !== seasonId || car.carClassId !== carClassId) {
    errBack("Invalid car for the selected class");
  }

  // ---------- find or create Team ----------
  let team = await prisma.team.findFirst({
    where: { seasonId, name: teamName },
  });

  if (team) {
    if (team.leaderUserId !== leader!.id) {
      const teammate = await prisma.registration.findFirst({
        where: { teamId: team.id, userId: leader!.id },
        select: { id: true },
      });
      if (teammate) {
        errBack(
          "This team is already registered. Ask the team leader to update the lineup via Manage Team."
        );
      } else {
        errBack(
          `Team name "${teamName}" is already registered for this season. Pick a different name.`
        );
      }
    }
  }
  if (!team) {
    team = await prisma.team.create({
      data: { seasonId, name: teamName, leaderUserId: leader!.id },
    });
  }

  // ---------- leader registration ----------
  await prisma.registration.upsert({
    where: { seasonId_userId: { seasonId, userId: leader!.id } },
    update: {
      status: "PENDING",
      teamId: team.id,
      carClassId,
      carId,
      iRating: leaderIRating,
      notes,
      approvedById: null,
      approvedAt: null,
    },
    create: {
      seasonId,
      userId: leader!.id,
      status: "PENDING",
      teamId: team.id,
      carClassId,
      carId,
      iRating: leaderIRating,
      notes,
    },
  });

  // ---------- teammates ----------
  type TM = { name: string; iracingId: string; email: string; iRating: number };
  const teammates: TM[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = String(formData.get(`teammate${i}Name`) ?? "").trim();
    const iracingId = String(formData.get(`teammate${i}IracingId`) ?? "").trim();
    const email = String(formData.get(`teammate${i}Email`) ?? "").trim();
    if (!name && !iracingId) continue;
    if (!name || !iracingId) {
      errBack(
        `Teammate row ${i}: both iRacing name and iRacing ID are required`
      );
    }
    const iratingRaw = String(formData.get(`teammate${i}IRating`) ?? "").trim();
    if (!iratingRaw || !/^\d+$/.test(iratingRaw)) {
      errBack(`Teammate row ${i}: iRating is required and must be a number`);
    }
    const tIrating = parseInt(iratingRaw, 10);
    if (tIrating > MAX_IRATING) {
      errBack(`Teammate row ${i}: iRating must be ${MAX_IRATING} or lower (entered ${tIrating})`);
    }
    if (carClass!.shortCode === "LMP2" && tIrating < LMP2_MIN_IRATING) {
      errBack(`Teammate row ${i}: LMP2 requires iRating ${LMP2_MIN_IRATING} or higher (entered ${tIrating})`);
    }
    teammates.push({ name, iracingId, email, iRating: tIrating });
  }

  const teammateNames: string[] = [];
  for (const tm of teammates) {
    // Find existing user by iRacing ID, then by email, then create.
    let mate = await prisma.user.findFirst({
      where: { iracingMemberId: tm.iracingId },
    });
    if (!mate && tm.email) {
      mate = await prisma.user.findFirst({ where: { email: tm.email } });
      if (mate && !mate.iracingMemberId) {
        mate = await prisma.user.update({
          where: { id: mate.id },
          data: { iracingMemberId: tm.iracingId },
        });
      }
    }
    if (!mate) {
      const parts = tm.name.split(/\s+/);
      const firstName = parts[0] || tm.name;
      const lastName = parts.slice(1).join(" ") || "";
      mate = await prisma.user.create({
        data: {
          firstName,
          lastName,
          iracingMemberId: tm.iracingId,
          email: tm.email || null,
        },
      });
    }
    if (mate.id === leader!.id) continue; // can't be teammate of self

    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId, userId: mate.id } },
      update: {
        status: "PENDING",
        teamId: team.id,
        carClassId,
        carId,
        startNumber: null,
        iRating: tm.iRating,
        approvedById: null,
        approvedAt: null,
      },
      create: {
        seasonId,
        userId: mate.id,
        status: "PENDING",
        teamId: team.id,
        carClassId,
        carId,
        startNumber: null,
        iRating: tm.iRating,
      },
    });
    teammateNames.push(`${mate.firstName ?? ""} ${mate.lastName ?? ""}`.trim());
  }

  // ---------- Discord webhook (fire-and-forget) ----------
  try {
    const lg = await prisma.league.findUnique({
      where: { slug: leagueSlug },
      select: { discordRegistrationsWebhookUrl: true },
    });
    if (lg?.discordRegistrationsWebhookUrl) {
      const baseUrl =
        process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
      await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: `🏁 New team registration — ${season.league.name} ${season.name}`,
            description:
              `**${team.name}** — ${carClass!.name} class, ${car!.name}`,
            url: `${baseUrl}/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`,
            color: 0xff6b35,
            fields: [
              {
                name: "Team leader",
                value: `${leader!.firstName} ${leader!.lastName} (iR ${leader!.iracingMemberId})`,
                inline: false,
              },
              ...(teammateNames.length > 0
                ? [
                    {
                      name: `Teammates (${teammateNames.length})`,
                      value: teammateNames.join("\n"),
                      inline: false,
                    },
                  ]
                : []),
              ...(notes
                ? [{ name: "Notes", value: notes, inline: false }]
                : []),
            ],
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    }
  } catch {
    // never block registration on webhook failure
  }

  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/roster`);
  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/teams`);
  redirect("/registrations?success=team");
}

const TEAM_LMP2_MIN_IRATING = 1500;
const TEAM_MAX_IRATING = 5000;

async function requireTeamLeader(teamId: string) {
  const sessionUser = await requireAuth();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: {
      season: { include: { league: true } },
      registrations: { include: { user: true }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!team) throw new Error("Team not found");
  if (team.leaderUserId !== sessionUser.id) {
    throw new Error("Only the team leader can perform this action");
  }
  return { team, sessionUser };
}

export async function updateTeamRegistration(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  const carClass = team.registrations[0]?.carClassId
    ? await prisma.carClass.findUnique({
        where: { id: team.registrations[0].carClassId! },
      })
    : null;

  // Leader iRating
  const leaderRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
  if (!leaderRatingRaw || !/^\d+$/.test(leaderRatingRaw)) {
    throw new Error("Your current iRating is required");
  }
  const leaderIRating = parseInt(leaderRatingRaw, 10);
  if (leaderIRating > TEAM_MAX_IRATING) {
    throw new Error(
      `iRating must be ${TEAM_MAX_IRATING} or lower (you entered ${leaderIRating})`
    );
  }
  if (carClass?.shortCode === "LMP2" && leaderIRating < TEAM_LMP2_MIN_IRATING) {
    throw new Error(
      `LMP2 requires iRating ${TEAM_LMP2_MIN_IRATING} or higher (you entered ${leaderIRating})`
    );
  }

  // Update leader registration's iRating
  await prisma.registration.update({
    where: {
      seasonId_userId: {
        seasonId: team.seasonId,
        userId: team.leaderUserId!,
      },
    },
    data: { iRating: leaderIRating },
  });

  // Parse + validate teammate rows
  type TM = {
    name: string;
    iracingId: string;
    email: string;
    iRating: number;
  };
  const tmIn: TM[] = [];
  for (let i = 1; i <= 4; i++) {
    const name = String(formData.get(`teammate${i}Name`) ?? "").trim();
    const iracingId = String(formData.get(`teammate${i}IracingId`) ?? "").trim();
    const email = String(formData.get(`teammate${i}Email`) ?? "").trim();
    const iratingRaw = String(formData.get(`teammate${i}IRating`) ?? "").trim();
    if (!name && !iracingId && !iratingRaw) continue;
    if (!name || !iracingId) {
      throw new Error(
        `Teammate row ${i}: both iRacing name and iRacing ID are required`
      );
    }
    if (!iratingRaw || !/^\d+$/.test(iratingRaw)) {
      throw new Error(`Teammate row ${i}: iRating is required`);
    }
    const iR = parseInt(iratingRaw, 10);
    if (iR > TEAM_MAX_IRATING) {
      throw new Error(
        `Teammate row ${i}: iRating must be ${TEAM_MAX_IRATING} or lower (entered ${iR})`
      );
    }
    if (carClass?.shortCode === "LMP2" && iR < TEAM_LMP2_MIN_IRATING) {
      throw new Error(
        `Teammate row ${i}: LMP2 requires iRating ${TEAM_LMP2_MIN_IRATING} or higher (entered ${iR})`
      );
    }
    tmIn.push({ name, iracingId, email, iRating: iR });
  }

  // Existing teammates (active, not the leader)
  const existingTeammates = team.registrations.filter(
    (r) => r.userId !== team.leaderUserId && r.status !== "WITHDRAWN"
  );

  const seenUserIds = new Set<string>();

  for (const tm of tmIn) {
    let mate = await prisma.user.findFirst({
      where: { iracingMemberId: tm.iracingId },
    });
    if (!mate && tm.email) {
      mate = await prisma.user.findFirst({ where: { email: tm.email } });
      if (mate && !mate.iracingMemberId) {
        mate = await prisma.user.update({
          where: { id: mate.id },
          data: { iracingMemberId: tm.iracingId },
        });
      }
    }
    if (!mate) {
      const parts = tm.name.split(/\s+/);
      const firstName = parts[0] || tm.name;
      const lastName = parts.slice(1).join(" ") || "";
      mate = await prisma.user.create({
        data: {
          firstName,
          lastName,
          iracingMemberId: tm.iracingId,
          email: tm.email || null,
        },
      });
    }
    if (mate.id === team.leaderUserId) continue;

    const existingReg = team.registrations.find((r) => r.userId === mate!.id);

    if (existingReg && existingReg.status !== "WITHDRAWN") {
      // Existing — preserve invitation flags, just update what changed
      await prisma.registration.update({
        where: { id: existingReg.id },
        data: { iRating: tm.iRating },
      });
    } else {
      // New (or previously withdrawn) — reset invitation flags
      await prisma.registration.upsert({
        where: {
          seasonId_userId: { seasonId: team.seasonId, userId: mate.id },
        },
        update: {
          status: "PENDING",
          teamId: team.id,
          carClassId: team.registrations[0]?.carClassId,
          carId: team.registrations[0]?.carId,
          startNumber: null,
          iRating: tm.iRating,
          iracingInvitationSent: "NO",
          iracingInvitationAccepted: "NO",
        },
        create: {
          seasonId: team.seasonId,
          userId: mate.id,
          status: "PENDING",
          teamId: team.id,
          carClassId: team.registrations[0]?.carClassId,
          carId: team.registrations[0]?.carId,
          startNumber: null,
          iRating: tm.iRating,
          iracingInvitationSent: "NO",
          iracingInvitationAccepted: "NO",
        },
      });
    }
    seenUserIds.add(mate.id);
  }

  // Withdraw any existing teammate not present in the form
  for (const r of existingTeammates) {
    if (!seenUserIds.has(r.userId)) {
      await prisma.registration.update({
        where: { id: r.id },
        data: { status: "WITHDRAWN" },
      });
    }
  }

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/teams/${teamId}/manage`);
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=team_updated`);
}

export async function withdrawTeam(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  await prisma.registration.updateMany({
    where: { teamId },
    data: { status: "WITHDRAWN" },
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=team_withdrawn`);
}

export async function transferTeamLeadership(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const newLeaderUserId = String(formData.get("newLeaderUserId") ?? "");
  if (!teamId) throw new Error("teamId required");
  if (!newLeaderUserId) throw new Error("New leader is required");

  const { team, sessionUser } = await requireTeamLeader(teamId);

  const newLeaderReg = team.registrations.find(
    (r) => r.userId === newLeaderUserId && r.status !== "WITHDRAWN"
  );
  if (!newLeaderReg) {
    throw new Error("New leader must be a current team member (not withdrawn)");
  }
  if (newLeaderUserId === sessionUser.id) {
    throw new Error("New leader cannot be yourself");
  }

  await prisma.$transaction([
    prisma.team.update({
      where: { id: teamId },
      data: { leaderUserId: newLeaderUserId },
    }),
    prisma.registration.updateMany({
      where: { teamId, userId: sessionUser.id },
      data: { status: "WITHDRAWN" },
    }),
  ]);

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  redirect(`/registrations?success=leadership_transferred`);
}

