"use server";

import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/auth-helpers";
import {
  recomputeWaitlistForSeason,
  setRegistrationRetired,
} from "@/lib/waitlist";
import { postDiscordWebhook } from "@/lib/discord-webhook";
import { sendResendEmail } from "@/lib/resend-email";
import { getSflIRatingGate } from "@/lib/sfl-irating-gate";
import { getUserLiveIratingForLeague } from "@/lib/league-irating-category";
import {
  teamSizeLimit,
  countTeamMembers,
  teammateSlots,
  MANAGE_TEAM_ROW_SCAN,
} from "@/lib/team-limit";
import { parseStartNumberInput } from "@/lib/start-number";
import {
  resolveTeamOwnership,
  isActiveTeamMember,
} from "@/lib/team-ownership";

// Append a query param to a redirect target, using "&" if the base already
// carries a query string (e.g. the embedded Manage Team view passes
// `redirectTo=/teams/<id>/manage?embed=1`). Keeps the iframe chrome-free by
// returning to the same embed URL instead of the full-page /registrations.
function withQuery(base: string, key: string, value: string): string {
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}${key}=${encodeURIComponent(value)}`;
}

/**
 * Base URL for bouncing back to the registration form with an error.
 *
 * A link-protected season only renders the form when the personal invitation
 * token is present, so an error redirect that drops `?t=` lands the driver on
 * "Registration is link-protected" and the real reason is never shown. Always
 * carry the token back. Returns a prefix ending in "?" (or "?t=…&") so call
 * sites can append `error=…`.
 */
function registerBaseUrl(
  leagueSlug: string,
  seasonId: string,
  token: string
): string {
  const base = `/leagues/${leagueSlug}/seasons/${seasonId}/register?`;
  return token ? `${base}t=${encodeURIComponent(token)}&` : base;
}

export async function createRegistration(
  leagueSlug: string,
  seasonId: string,
  token: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();
  const registerBase = registerBaseUrl(leagueSlug, seasonId, token);

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect("/leagues");
  }

  // GT3 WCT: the driver never picks a class — an admin allocates the Pro/Am
  // tier after registration, so the registration form omits the class field.
  const isGt3Wct = season.league.slug === "cas-gt3-wct";

  // Archived seasons take no new entries, whatever their status says.
  if (
    season.isArchived ||
    (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE")
  ) {
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

  let startNumber: string | null;
  try {
    startNumber = parseStartNumberInput(formData.get("startNumber"));
  } catch {
    redirect(
      `${registerBase}error=Start+number+must+be+1-4+digits`
    );
  }
  const teamIdFromDropdown =
    String(formData.get("teamId") ?? "").trim() || null;
  const newTeamName = String(formData.get("newTeamName") ?? "").trim();
  const carClassId = String(formData.get("carClassId") ?? "").trim() || null;
  const carId = String(formData.get("carId") ?? "").trim() || null;
  const notes = String(formData.get("notes") ?? "").trim() || null;
  const iRatingRaw = String(formData.get("iRating") ?? "").trim();

  // SFL Cup: enforce the iRating cap. New drivers are capped at the gate's
  // maxIRating; drivers who raced in the most recent prior SFL Cup season are
  // exempt. getSflIRatingGate is a no-op (applies=false) for other leagues.
  let iRatingValue: number | null = null;
  if (iRatingRaw) {
    if (!/^\d+$/.test(iRatingRaw)) {
      redirect(
        `${registerBase}error=${encodeURIComponent(
          "iRating must be a whole number"
        )}`
      );
    }
    iRatingValue = parseInt(iRatingRaw, 10);
  }

  const sflGate = await getSflIRatingGate(season, user.id);
  if (sflGate.applies) {
    if (iRatingValue == null) {
      redirect(
        `${registerBase}error=${encodeURIComponent(
          "Your current iRating is required"
        )}`
      );
    }
    if (!sflGate.exempt && iRatingValue > sflGate.maxIRating) {
      redirect(
        `${registerBase}error=${encodeURIComponent(
          `This season is capped at ${sflGate.maxIRating} iRating. Only drivers who raced in the previous SFL Cup season may register above it.`
        )}`
      );
    }
    // Belt-and-braces: the user-typed value is unverified. If we have a
    // live synced iRating for this league's category (Formula Car for
    // SFL Cup) and it exceeds the cap, reject regardless of what they
    // typed. Closes the "type a lower number than your real iRating"
    // loophole the form would otherwise allow.
    if (!sflGate.exempt) {
      const liveIrating = getUserLiveIratingForLeague(user, season.league.slug);
      if (liveIrating != null && liveIrating > sflGate.maxIRating) {
        redirect(
          `${registerBase}error=${encodeURIComponent(
            `Your live iRating (${liveIrating}) is above the ${sflGate.maxIRating} cap for new SFL Cup drivers. Only drivers who raced in the previous SFL Cup season may register above it.`
          )}`
        );
      }
    }
  }

  const existing = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId, userId: user.id } },
  });

  // The start number is picked once at initial registration — after that,
  // only an admin can change it. Any driver edit keeps the existing number.
  if (existing) {
    startNumber = existing.startNumber;
  }

  // A registration locks once the driver's FIRST result of the season has
  // been uploaded (they actually raced). Until then everything stays
  // editable — a driver who skipped the opening rounds may still change car.
  const driverHasResult = existing
    ? await prisma.raceResult.findFirst({
        where: { registrationId: existing.id },
        select: { id: true },
      })
    : null;

  // APPROVED drivers may edit their registration (car, start number, notes)
  // until they have raced for the first time. The edit keeps the approval —
  // no reset to PENDING. Team changes after approval go through an admin.
  const approvedEdit = !!existing && existing.status === "APPROVED";
  if (approvedEdit && driverHasResult) {
    redirect(
      `/registrations?error=${encodeURIComponent(
        "You have already raced this season — registration changes now go through an admin."
      )}`
    );
  }

  // Resolve team:
  //   - Approved edit: the team is locked — keep the existing one
  //   - If newTeamName is provided, find or create that team (it wins)
  //   - Otherwise use the team from the dropdown
  let teamId: string | null = teamIdFromDropdown;
  if (approvedEdit) {
    teamId = existing!.teamId;
  } else if (newTeamName) {
    // Case-insensitive match so "cas racing" never creates a near-duplicate
    // of an existing "CAS Racing" — team names exist only once per season.
    const existingTeam = await prisma.team.findFirst({
      where: { seasonId, name: { equals: newTeamName, mode: "insensitive" } },
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

  // Re-check the per-team cap server-side (the picker hides full teams, but
  // a crafted POST could bypass it). The current user is excluded so
  // re-registering on their own team always works.
  const teamLimit = teamSizeLimit({
    leagueSlug: season.league.slug,
    teamMaxDrivers: season.teamMaxDrivers,
  });
  if (teamLimit != null && teamId && !approvedEdit) {
    const occupied = await countTeamMembers(teamId, user.id);
    if (occupied >= teamLimit) {
      redirect(
        `${registerBase}error=${encodeURIComponent(
          `That team is already full — it has the maximum of ${teamLimit} drivers. Pick another team or create your own.`
        )}`
      );
    }
  }

  if (season.isMulticlass && !isGt3Wct && !carClassId) {
    redirect(
      `${registerBase}error=Class+is+required+for+multiclass+seasons`
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
        `${registerBase}error=Invalid+car`
      );
    }
    // A car is valid for the chosen class when either:
    //  - it's pinned to that class (car.carClassId === carClassId), or
    //  - it's a season-wide shared car (car.carClassId === null) — allowed
    //    for every class.
    if (
      season.isMulticlass &&
      carClassId &&
      car.carClassId !== null &&
      car.carClassId !== carClassId
    ) {
      redirect(
        `${registerBase}error=Car+does+not+belong+to+selected+class`
      );
    }
    // Only fall back to the car's pinned class if we don't already have one
    // from the form (shared cars have no pinned class — keep the user's pick).
    if (!resolvedCarClassId && car.carClassId) {
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
      `${registerBase}error=Car+is+required`
    );
  }


  // GT3 WCT: never derive the class from the chosen car and never wipe an
  // allocation the admin already made — keep whatever is on the existing
  // registration (null for a brand-new one) so only an admin can set it.
  if (isGt3Wct) {
    resolvedCarClassId = existing?.carClassId ?? null;
  }

  // The car is locked once the driver's first result has been uploaded —
  // until then, drivers may freely change it (regardless of season status).
  if (
    existing &&
    existing.carId &&
    !!driverHasResult &&
    existing.carId !== carId
  ) {
    redirect(
      `${registerBase}error=Car+is+locked+after+your+first+race`
    );
  }


  if (existing) {
    await prisma.registration.update({
      where: { id: existing.id },
      data: approvedEdit
        ? {
            // Approved edit: car/start number/notes only — the approval and
            // the team stay untouched.
            startNumber,
            carClassId: resolvedCarClassId,
            carId,
            notes,
            ...(iRatingValue != null ? { iRating: iRatingValue } : {}),
          }
        : {
            status: "PENDING",
            startNumber,
            teamId,
            carClassId: resolvedCarClassId,
            carId,
            notes,
            // Only overwrite iRating when the form actually submitted one, so a
            // league without the iRating field never wipes an existing value.
            ...(iRatingValue != null ? { iRating: iRatingValue } : {}),
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
        iRating: iRatingValue,
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
      if (iRatingValue != null)
        fields.push({ name: "iRating", value: String(iRatingValue), inline: true });
      if (notes) fields.push({ name: "Notes", value: notes, inline: false });
      await postDiscordWebhook(webhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: existing
              ? `✏️ Updated registration — ${season.league.name} ${season.name}`
              : `📝 New registration — ${season.league.name} ${season.name}`,
            description: approvedEdit
              ? "Approved registration updated by the driver (stays approved)"
              : existing && existing.status !== "PENDING"
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

      // Discord ID helps the team link the driver to our Discord. Prefer the
      // numeric ID stored on the User; fall back to the linked OAuth account.
      const discordId =
        user.discordId ??
        (
          await prisma.account.findFirst({
            where: { userId: user.id, provider: "discord" },
            select: { providerAccountId: true },
          })
        )?.providerAccountId ??
        null;

      const subject = existing
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
            ${approvedEdit ? "Approved registration updated by the driver (stays approved)" : existing && existing.status !== "PENDING" ? "Updated registration (was " + escape(existing.status.toLowerCase()) + ")" : "New pending registration awaiting approval"}
          </p>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr><td style="padding: 6px 0; color: #71717a; width: 110px;">Driver</td><td>${escape(user.firstName)} ${escape(user.lastName)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">iRacing ID</td><td>${escape(user.iracingMemberId)}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Discord ID</td><td>${discordId ? escape(discordId) : "— (not linked)"}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Start #</td><td>${startNumber != null ? "#" + escape(startNumber) : "—"}</td></tr>
            <tr><td style="padding: 6px 0; color: #71717a;">Team</td><td>${escape(teamLabel2)}</td></tr>
            ${className2 ? `<tr><td style="padding: 6px 0; color: #71717a;">Class</td><td>${escape(className2)}</td></tr>` : ""}
            ${iRatingValue != null ? `<tr><td style="padding: 6px 0; color: #71717a;">iRating</td><td>${escape(iRatingValue)}</td></tr>` : ""}
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
        `Discord ID: ${discordId ?? "— (not linked)"}`,
        `Start #: ${startNumber != null ? "#" + startNumber : "—"}`,
        `Team: ${teamLabel2}`,
        className2 ? `Class: ${className2}` : null,
        iRatingValue != null ? `iRating: ${iRatingValue}` : null,
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
  redirect(approvedEdit ? "/registrations?success=updated" : "/registrations?success=1");
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
    data: { status: "WITHDRAWN", waitlistedAt: null },
  });

  // If this driver held a confirmed seat, promote the next on the waiting list
  // (order-proof, by registration date).
  after(async () => {
    try {
      await recomputeWaitlistForSeason(reg.seasonId);
    } catch {
      /* swallow */
    }
  });

  revalidatePath("/registrations");
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  redirect("/registrations");
}

/**
 * Driver self-service: retire from a season. Same effect as the admin Retire
 * button — the driver's results/points/position are kept, but they free their
 * grid seat (the next waiting-list driver is promoted) and drop out of RSVP /
 * fill-in / no-show flows. Retire only; coming back is admin-controlled
 * (the admin roster page has Un-retire) so a driver can't flip-flop and bump
 * a just-promoted waiting-list driver back off the grid.
 */
export async function retireOwnRegistration(registrationId: string) {
  const sessionUser = await requireAuth();

  const reg = await prisma.registration.findUnique({
    where: { id: registrationId },
    include: { season: { include: { league: true } } },
  });
  // Must be the driver's own APPROVED registration on a running season, and not
  // a non-driving team-manager entry.
  const seasonRunning =
    reg?.season.status === "OPEN_REGISTRATION" ||
    reg?.season.status === "ACTIVE";
  if (
    !reg ||
    reg.userId !== sessionUser.id ||
    reg.status !== "APPROVED" ||
    reg.isTeamManager ||
    !seasonRunning
  ) {
    redirect("/registrations");
  }

  // Sets retiredAt and recomputes the waiting list (promotes + DMs the next
  // driver on a capped season).
  await setRegistrationRetired(registrationId, true);

  revalidatePath("/registrations");
  revalidatePath(
    `/admin/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}/roster`
  );
  revalidatePath(`/leagues/${reg.season.league.slug}/seasons/${reg.seasonId}`);
  redirect("/registrations?success=retired");
}

export async function createTeamRegistration(
  leagueSlug: string,
  seasonId: string,
  token: string,
  formData: FormData
) {
  const sessionUser = await requireAuth();
  const registerBase = registerBaseUrl(leagueSlug, seasonId, token);

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect("/leagues");
  }
  // Archived seasons take no new entries, whatever their status says.
  if (
    season.isArchived ||
    (season.status !== "OPEN_REGISTRATION" && season.status !== "ACTIVE")
  ) {
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
  // "Teammanager (not driving)": the registrant manages the team but is not
  // a driver — no iRating/car, auto-approved, excluded from the driver cap.
  // The Teamchef (Team.leaderUserId) is then picked among the driver rows.
  const isTeamManager = String(formData.get("isTeamManager") ?? "") === "1";

  const errBack = (msg: string) =>
    redirect(
      `${registerBase}error=${encodeURIComponent(msg)}`
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

  // Managers don't drive — their own iRating is irrelevant.
  let leaderIRating: number | null = null;
  if (!isTeamManager) {
    if (!leaderIRatingRaw || !/^\d+$/.test(leaderIRatingRaw)) {
      errBack("Your current iRating is required");
    }
    leaderIRating = parseInt(leaderIRatingRaw, 10);
    if (leaderIRating > MAX_IRATING) {
      errBack(`iRating must be ${MAX_IRATING} or lower (you entered ${leaderIRating})`);
    }
    if (carClass!.shortCode === "LMP2" && leaderIRating < LMP2_MIN_IRATING) {
      errBack(`LMP2 requires iRating ${LMP2_MIN_IRATING} or higher (you entered ${leaderIRating})`);
    }
  }

  const car = await prisma.car.findUnique({ where: { id: carId } });
  // Shared cars (carClassId === null) are valid for every class.
  if (
    !car ||
    car.seasonId !== seasonId ||
    (car.carClassId !== null && car.carClassId !== carClassId)
  ) {
    errBack("Invalid car for the selected class");
  }

  // ---------- find or create Team ----------
  let team = await prisma.team.findFirst({
    where: { seasonId, name: teamName },
  });

  // Adopting an ownerless team heals Team.leaderUserId further down.
  let adoptOwnerlessTeam = false;
  if (team) {
    const owner = await resolveTeamOwnership(team);
    // An ownerless team (leader/manager deleted or merged away) may be taken
    // over by anyone still on its roster — otherwise the team is locked
    // forever and even Manage Team refuses everyone.
    adoptOwnerlessTeam =
      owner.ownerless && (await isActiveTeamMember(team.id, leader!.id));
    const mayResubmit =
      owner.leaderUserId === leader!.id ||
      owner.managerUserId === leader!.id ||
      adoptOwnerlessTeam;
    if (!mayResubmit) {
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
    // Manager mode: the registrant becomes the manager; the Teamchef
    // (leaderUserId) is assigned below from the driver rows.
    team = await prisma.team.create({
      data: isTeamManager
        ? { seasonId, name: teamName, managerUserId: leader!.id }
        : { seasonId, name: teamName, leaderUserId: leader!.id },
    });
  } else if (isTeamManager && team.managerUserId !== leader!.id) {
    // Existing team without a manager being resubmitted by its leader who now
    // ticks the manager box — claim the manager slot.
    team = await prisma.team.update({
      where: { id: team.id },
      data: { managerUserId: leader!.id },
    });
  } else if (adoptOwnerlessTeam) {
    // Heal the dangling pointer: the roster member who just resubmitted
    // becomes the leader, so Manage Team works for him from now on.
    team = await prisma.team.update({
      where: { id: team.id },
      data: { leaderUserId: leader!.id, managerUserId: null },
    });
  }

  // ---------- leader / manager registration ----------
  // A manager registration is auto-approved: no iRacing invitation, no
  // starting-fee tracking, no admin approval step. No car/class either —
  // those belong to the drivers.
  //
  // A manager may also be a DRIVER of another team. In that case his driver
  // registration must stay untouched — the manager role lives purely on
  // Team.managerUserId. Only pure (non-driving) managers get/keep a manager
  // registration row.
  const ownReg = await prisma.registration.findUnique({
    where: { seasonId_userId: { seasonId, userId: leader!.id } },
    select: { status: true, isTeamManager: true, teamId: true },
  });
  const ownActiveDriverReg =
    !!ownReg &&
    !ownReg.isTeamManager &&
    ownReg.status !== "WITHDRAWN" &&
    ownReg.status !== "REJECTED";
  if (isTeamManager && ownActiveDriverReg && ownReg!.teamId === team.id) {
    errBack(
      "You drive for this team — a manager must not drive for the team he manages."
    );
  }
  const skipOwnRegistration = isTeamManager && ownActiveDriverReg;

  if (!skipOwnRegistration) {
    await prisma.registration.upsert({
      where: { seasonId_userId: { seasonId, userId: leader!.id } },
      update: isTeamManager
        ? {
            status: "APPROVED",
            isTeamManager: true,
            teamId: team.id,
            carClassId: null,
            carId: null,
            iRating: null,
            notes,
            approvedById: null,
            approvedAt: new Date(),
          }
        : {
            status: "PENDING",
            isTeamManager: false,
            teamId: team.id,
            carClassId,
            carId,
            iRating: leaderIRating,
            notes,
            approvedById: null,
            approvedAt: null,
          },
      create: isTeamManager
        ? {
            seasonId,
            userId: leader!.id,
            status: "APPROVED",
            isTeamManager: true,
            teamId: team.id,
            notes,
            approvedAt: new Date(),
          }
        : {
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
  }

  // ---------- teammates ----------
  // Cap how many teammate rows we accept. The leader counts as one driver, so
  // `maxTeammates = teamLimit - 1` when a cap is configured (IEC: cap 3 → 2
  // teammate rows). Uncapped seasons keep the historical 4-row limit.
  const teamLimit = teamSizeLimit({
    leagueSlug: season.league.slug,
    teamMaxDrivers: season.teamMaxDrivers,
  });
  // A non-driving manager does not count against the cap, so all `teamLimit`
  // driver slots are available as teammate rows.
  const maxTeammates =
    teamLimit != null
      ? Math.max(0, isTeamManager ? teamLimit : teamLimit - 1)
      : isTeamManager
        ? 5
        : 4;
  type TM = {
    name: string;
    iracingId: string;
    email: string;
    iRating: number;
    rowIndex: number;
  };
  const teammates: TM[] = [];
  for (let i = 1; i <= 5; i++) {
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
    teammates.push({ name, iracingId, email, iRating: tIrating, rowIndex: i });
  }

  // Enforce the per-team driver cap server-side. The form only renders
  // `maxTeammates` rows but a crafted POST could still submit more.
  if (teammates.length > maxTeammates) {
    errBack(
      isTeamManager
        ? `This season caps teams at ${teamLimit} drivers (your manager slot doesn't count). You submitted ${teammates.length} drivers — remove the extra rows.`
        : `This season caps teams at ${teamLimit} drivers (team leader + ${maxTeammates} teammates). You submitted ${teammates.length} teammates — remove the extra rows.`
    );
  }

  // Row count alone is not enough on a RESUBMISSION of an existing team: this
  // action never withdraws teammates that are absent from the form, so drivers
  // already on the roster keep their slot and would push the team over the cap
  // (the v2.0.2 bug — a cap-3 team ending up with 4 drivers). Count the drivers
  // who will still be there afterwards: everyone active on the team who is
  // neither the leader/manager nor re-submitted in one of the rows. Matched by
  // iRacing member id so no User row has to be created just to run the check.
  if (teamLimit != null) {
    const submittedIracingIds = new Set(teammates.map((t) => t.iracingId));
    const survivors = await prisma.registration.findMany({
      where: {
        teamId: team.id,
        status: { in: ["PENDING", "APPROVED"] },
        excludedAt: null,
        retiredAt: null,
        isTeamManager: false,
        userId: { not: leader!.id },
      },
      select: { user: { select: { iracingMemberId: true } } },
    });
    const keptExisting = survivors.filter(
      (r) =>
        !r.user.iracingMemberId ||
        !submittedIracingIds.has(r.user.iracingMemberId)
    ).length;
    // The registrant occupies a driver slot unless he registers as a
    // non-driving manager.
    const projected =
      (isTeamManager ? 0 : 1) + teammates.length + keptExisting;
    if (projected > teamLimit) {
      errBack(
        `This season caps teams at ${teamLimit} drivers. "${teamName}" already has ${keptExisting} driver${keptExisting === 1 ? "" : "s"} on the roster who ${keptExisting === 1 ? "is" : "are"} not in this form, so this submission would make ${projected}. Use Manage Team to change the lineup instead.`
      );
    }
  }

  // Manager mode: at least one driver is required, and the Teamchef must be
  // one of the driver rows (defaults to the first row).
  let chefRowIndex: number | null = null;
  if (isTeamManager) {
    if (teammates.length === 0) {
      errBack("Add at least one driver — a team can't race with only a manager.");
    }
    const chefRaw = String(formData.get("teamchefIndex") ?? "").trim();
    chefRowIndex =
      chefRaw && /^\d+$/.test(chefRaw) ? parseInt(chefRaw, 10) : 1;
  }

  const teammateNames: string[] = [];
  let chefUser: { id: string; firstName: string | null; lastName: string | null } | null = null;
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
    // Exact Teamchef pick wins; the first created driver is the fallback.
    if (isTeamManager && (chefRowIndex === tm.rowIndex || chefUser === null)) {
      chefUser = mate;
    }
  }

  // Manager mode: assign the Teamchef (Team.leaderUserId) from the driver
  // rows so the chef keeps the usual Manage Team rights alongside the manager.
  if (isTeamManager && chefUser) {
    await prisma.team.update({
      where: { id: team.id },
      data: { leaderUserId: chefUser.id },
    });
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
                name: isTeamManager ? "Team manager (not driving)" : "Team leader",
                value: `${leader!.firstName} ${leader!.lastName} (iR ${leader!.iracingMemberId})`,
                inline: false,
              },
              ...(isTeamManager && chefUser
                ? [
                    {
                      name: "Teamchef",
                      value: `${chefUser.firstName ?? ""} ${chefUser.lastName ?? ""}`.trim(),
                      inline: false,
                    },
                  ]
                : []),
              ...(teammateNames.length > 0
                ? [
                    {
                      name: `${isTeamManager ? "Drivers" : "Teammates"} (${teammateNames.length})`,
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
  // The non-driving team manager has the same management rights as the
  // leader (Teamchef). Admins can manage every team.
  const owner = await resolveTeamOwnership(team);
  const isManager = owner.managerUserId === sessionUser.id;
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true },
  });
  const isAdmin = me?.role === "ADMIN";
  // Ownerless team (leader/manager deleted or merged away): let an active
  // roster member manage it and heal the pointer, instead of locking the
  // team behind an id that no longer exists.
  const adopts =
    owner.ownerless && (await isActiveTeamMember(team.id, sessionUser.id));
  if (owner.leaderUserId !== sessionUser.id && !isManager && !isAdmin && !adopts) {
    throw new Error(
      "Only the team leader, team manager or an admin can perform this action"
    );
  }
  if (adopts) {
    await prisma.team.update({
      where: { id: team.id },
      data: { leaderUserId: sessionUser.id, managerUserId: null },
    });
    team.leaderUserId = sessionUser.id;
    team.managerUserId = null;
  }
  return { team, sessionUser, isManager, isAdmin };
}

export async function updateTeamRegistration(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  // Reference registration for class/car — never the manager's (it has none).
  const baseReg = team.registrations.find(
    (r) => !r.isTeamManager && r.status !== "WITHDRAWN"
  );
  const carClass = baseReg?.carClassId
    ? await prisma.carClass.findUnique({
        where: { id: baseReg.carClassId },
      })
    : null;

  // Leader (Teamchef) iRating — the field updates the chef's registration,
  // also when a manager submits the form on the chef's behalf.
  const leaderRatingRaw = String(formData.get("leaderIRating") ?? "").trim();
  if (!leaderRatingRaw || !/^\d+$/.test(leaderRatingRaw)) {
    throw new Error("The team leader's current iRating is required");
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
  if (team.leaderUserId) {
    await prisma.registration.update({
      where: {
        seasonId_userId: {
          seasonId: team.seasonId,
          userId: team.leaderUserId,
        },
      },
      data: { iRating: leaderIRating },
    });
  }

  // Per-team driver cap — the Manage Team form is bound by it like every other
  // entry point. Until v2.0.3 this action ignored the cap entirely and always
  // offered 4 teammate rows, so a team leader could grow a cap-3 IEC team to
  // 5 drivers straight past `Season.teamMaxDrivers`.
  const teamLimit = teamSizeLimit({
    leagueSlug: team.season.league.slug,
    teamMaxDrivers: team.season.teamMaxDrivers,
  });
  // The Teamchef occupies a driver slot; a non-driving Teammanager does not,
  // and an ownerless team (dangling leaderUserId) has none to occupy.
  const leaderIsDriver = team.registrations.some(
    (r) =>
      r.userId === team.leaderUserId &&
      !r.isTeamManager &&
      r.status !== "WITHDRAWN"
  );
  const maxTeammateRows = teammateSlots({
    limit: teamLimit,
    leaderIsDriver,
  });

  // Parse + validate teammate rows
  type TM = {
    name: string;
    iracingId: string;
    email: string;
    iRating: number;
  };
  const tmIn: TM[] = [];
  for (let i = 1; i <= MANAGE_TEAM_ROW_SCAN; i++) {
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

  // Hard cap check. The form renders only `maxTeammateRows` empty rows, but a
  // crafted POST (or a team that is already over the cap from before v2.0.3)
  // can still submit more.
  if (tmIn.length > maxTeammateRows) {
    const submitted = tmIn.length + (leaderIsDriver ? 1 : 0);
    throw new Error(
      teamLimit != null
        ? `This season caps teams at ${teamLimit} driver${teamLimit === 1 ? "" : "s"}${
            leaderIsDriver ? " (the team leader included)" : ""
          }. This lineup has ${submitted} — clear a row before saving.`
        : `At most ${maxTeammateRows} teammates can be saved here — clear a row before saving.`
    );
  }

  // Existing teammates (active, not the leader, not the manager — the
  // manager's registration is never managed through the driver rows)
  const existingTeammates = team.registrations.filter(
    (r) =>
      r.userId !== team.leaderUserId &&
      r.status !== "WITHDRAWN" &&
      !r.isTeamManager
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
    if (mate.id === team.managerUserId) continue; // manager never drives

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
          carClassId: baseReg?.carClassId,
          carId: baseReg?.carId,
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
          carClassId: baseReg?.carClassId,
          carId: baseReg?.carId,
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
  // Notify admins of the change
  const finalTeammates = await prisma.registration.findMany({
    where: {
      teamId: team.id,
      userId: { not: team.leaderUserId ?? '' },
      status: { not: 'WITHDRAWN' },
      isTeamManager: false,
    },
    include: { user: true },
    orderBy: { createdAt: 'asc' },
  });
  const teammateLines = finalTeammates.map((r) =>
    `${r.user.firstName ?? ''} ${r.user.lastName ?? ''}`.trim() +
    (r.user.iracingMemberId ? ` (iR ${r.user.iracingMemberId})` : '') +
    (r.user.discordId ? ` [Discord ${r.user.discordId}]` : '')
  );
  const leaderReg = team.registrations.find((r) => r.userId === team.leaderUserId);
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'UPDATED',
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: 'Team leader',
        value: leaderReg
          ? `${leaderReg.user.firstName ?? ''} ${leaderReg.user.lastName ?? ''}`.trim()
          : '—',
        inline: false,
      },
      {
        name: `Active teammates (${finalTeammates.length})`,
        value: teammateLines.length > 0 ? teammateLines.join('\n') : '(none)',
        inline: false,
      },
    ],
  });

  revalidatePath(`/teams/${teamId}/manage`);
  revalidatePath(`/registrations`);
  const updRedirect = String(formData.get("redirectTo") ?? "").trim();
  redirect(
    updRedirect
      ? withQuery(updRedirect, "success", "Team updated")
      : `/registrations?success=team_updated`
  );
}

export async function withdrawTeam(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireTeamLeader(teamId);

  await prisma.registration.updateMany({
    where: { teamId },
    data: { status: "WITHDRAWN" },
  });

  const leaderReg = team.registrations.find((r) => r.userId === team.leaderUserId);
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'WITHDRAWN',
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: 'Withdrawn by',
        value: leaderReg
          ? `${leaderReg.user.firstName ?? ''} ${leaderReg.user.lastName ?? ''}`.trim()
          : '—',
        inline: false,
      },
      {
        name: 'Members affected',
        value: String(team.registrations.length),
        inline: false,
      },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  const wdRedirect = String(formData.get("redirectTo") ?? "").trim();
  redirect(
    wdRedirect
      ? withQuery(wdRedirect, "success", "Team withdrawn")
      : `/registrations?success=team_withdrawn`
  );
}

export async function transferTeamLeadership(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const newLeaderUserId = String(formData.get("newLeaderUserId") ?? "");
  if (!teamId) throw new Error("teamId required");
  if (!newLeaderUserId) throw new Error("New leader is required");

  const { team, sessionUser, isManager } = await requireTeamLeader(teamId);

  const newLeaderReg = team.registrations.find(
    (r) => r.userId === newLeaderUserId && r.status !== "WITHDRAWN"
  );
  if (!newLeaderReg) {
    throw new Error("New leader must be a current team member (not withdrawn)");
  }
  if (newLeaderReg.isTeamManager) {
    throw new Error("The team manager cannot be Teamchef — pick a driver");
  }
  if (newLeaderUserId === sessionUser.id) {
    throw new Error("New leader cannot be yourself");
  }

  if (isManager) {
    // Manager reassigns the Teamchef among the drivers — the manager stays
    // on the team, and the old chef stays a regular driver.
    await prisma.team.update({
      where: { id: teamId },
      data: { leaderUserId: newLeaderUserId },
    });
  } else {
    // Leader hands over and leaves the team (historical behavior).
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
  }

  const oldLeaderReg = team.registrations.find(
    (r) => r.userId === (isManager ? team.leaderUserId : sessionUser.id)
  );
  const newLeaderName = newLeaderReg.user
    ? `${newLeaderReg.user.firstName ?? ''} ${newLeaderReg.user.lastName ?? ''}`.trim()
    : '—';
  const oldLeaderName = oldLeaderReg
    ? `${oldLeaderReg.user.firstName ?? ''} ${oldLeaderReg.user.lastName ?? ''}`.trim()
    : '—';
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: 'LEADERSHIP_TRANSFERRED',
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      { name: 'Old leader', value: oldLeaderName, inline: true },
      { name: 'New leader', value: newLeaderName, inline: true },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/registrations`);
  const ltRedirect = String(formData.get("redirectTo") ?? "").trim();
  redirect(
    ltRedirect
      ? withQuery(ltRedirect, "success", "Leadership transferred")
      : `/registrations?success=leadership_transferred`
  );
}

// ============================================================================
// Class & car change on an EXISTING team (Manage Team page). Allowed for the
// Teamchef or the team manager, but ONLY until the season's first race has
// started — after that, class/car changes go through an admin. Updates every
// active driver registration of the team in one go.
// ============================================================================

export async function updateTeamClassCar(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const carClassId = String(formData.get("carClassId") ?? "").trim();
  const carId = String(formData.get("carId") ?? "").trim();
  if (!teamId) throw new Error("teamId required");
  const { team, isAdmin } = await requireTeamLeader(teamId);

  const back =
    String(formData.get("redirectTo") ?? "").trim() ||
    `/teams/${teamId}/manage`;
  const fail = (msg: string): never =>
    redirect(withQuery(back, "error", msg));

  // Locked once the first race of the season has started — admins bypass.
  if (!isAdmin) {
    const startedRound = await prisma.round.findFirst({
      where: { seasonId: team.seasonId, startsAt: { lte: new Date() } },
      select: { id: true },
    });
    if (startedRound) {
      fail(
        "The season has started — class and car can no longer be changed here. Contact an admin."
      );
    }
  }

  if (!carClassId) fail("Class is required");
  if (!carId) fail("Car is required");

  const carClass = await prisma.carClass.findUnique({
    where: { id: carClassId },
  });
  if (!carClass || carClass.seasonId !== team.seasonId) fail("Invalid class");
  if (carClass!.isLocked) {
    fail("That class is locked — no changes into it are possible");
  }

  const car = await prisma.car.findUnique({ where: { id: carId } });
  // Shared cars (carClassId === null) are valid for every class.
  if (
    !car ||
    car.seasonId !== team.seasonId ||
    (car.carClassId !== null && car.carClassId !== carClassId)
  ) {
    fail("Invalid car for the selected class");
  }

  await prisma.registration.updateMany({
    where: {
      teamId: team.id,
      status: { notIn: ["WITHDRAWN", "REJECTED"] },
      isTeamManager: false,
    },
    data: { carClassId, carId },
  });

  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: "UPDATED",
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: "Class / car changed",
        value: `${carClass!.name} — ${car!.name}`,
        inline: false,
      },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/teams/${team.id}/manage`);
  redirect(
    withQuery(back, "success", `Team switched to ${carClass!.name} — ${car!.name}`)
  );
}

// ============================================================================
// Rename a team — Teamchef, Teammanager or admin. Meant for typo fixes, so
// it is locked once the season's first race has started (admins bypass).
// ============================================================================

export async function renameTeam(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const newName = String(formData.get("newName") ?? "").trim();
  if (!teamId) throw new Error("teamId required");
  const { team, isAdmin } = await requireTeamLeader(teamId);

  const back =
    String(formData.get("redirectTo") ?? "").trim() ||
    `/teams/${teamId}/manage`;
  const fail = (msg: string): never =>
    redirect(withQuery(back, "error", msg));

  // Locked once the first race of the season has started — admins bypass.
  if (!isAdmin) {
    const startedRound = await prisma.round.findFirst({
      where: { seasonId: team.seasonId, startsAt: { lte: new Date() } },
      select: { id: true },
    });
    if (startedRound) {
      fail(
        "The season has started — the team name can no longer be changed here. Contact an admin."
      );
    }
  }

  if (!newName) fail("Team name is required");
  if (newName.length > 60) fail("Team name is too long (max 60 characters)");
  if (newName === team.name) {
    redirect(withQuery(back, "success", "Team name unchanged"));
  }

  // Unique per season (case-insensitive check to avoid near-duplicates).
  const clash = await prisma.team.findFirst({
    where: {
      seasonId: team.seasonId,
      id: { not: team.id },
      name: { equals: newName, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (clash) {
    fail("Another team in this season already uses that name");
  }

  const oldName = team.name;
  await prisma.team.update({
    where: { id: team.id },
    data: { name: newName },
  });

  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: "UPDATED",
    teamName: newName,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: "Team renamed",
        value: `${oldName} → ${newName}`,
        inline: false,
      },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/standings`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/teams`
  );
  revalidatePath(`/teams/${team.id}/manage`);
  revalidatePath("/registrations");
  redirect(withQuery(back, "success", `Team renamed to ${newName}`));
}

// ============================================================================
// Team manager assignment on an EXISTING team. Gated to the Teamchef
// (Team.leaderUserId) or an ADMIN — never self-service, so nobody can claim
// management of a foreign team. The manager-to-be must already have a CLS
// account (one Discord sign-in) and must not be an active driver this season.
// ============================================================================

async function requireChefOrAdmin(teamId: string) {
  const sessionUser = await requireAuth();
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    include: { season: { include: { league: true } } },
  });
  if (!team) throw new Error("Team not found");
  const me = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    select: { role: true },
  });
  const allowed =
    team.leaderUserId === sessionUser.id || me?.role === "ADMIN";
  if (!allowed) {
    throw new Error("Only the Teamchef or an admin can assign a team manager");
  }
  return { team, sessionUser };
}

export async function assignTeamManager(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const managerUserId = String(formData.get("managerUserId") ?? "").trim();
  const redirectTo =
    String(formData.get("redirectTo") ?? "") || `/teams/${teamId}/manage`;
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireChefOrAdmin(teamId);

  const fail = (msg: string): never =>
    redirect(withQuery(redirectTo, "error", msg));

  // The picker submits a user ID — free text is never accepted. Validate the
  // ID against the User table regardless (the client check is convenience).
  if (!managerUserId) {
    fail("Pick the manager from the search results — free text isn't accepted.");
  }
  const managerOrNull = await prisma.user.findUnique({
    where: { id: managerUserId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (!managerOrNull) {
    fail(
      "That CLS account doesn't exist. The manager must sign in to CLS with Discord once — then search again."
    );
  }
  const manager = managerOrNull!;

  if (manager.id === team.leaderUserId) {
    fail(
      "The Teamchef can't be his own manager. To become a non-driving manager, re-submit the team registration with the Teammanager checkbox."
    );
  }

  // A manager never drives: block users with an active driver registration.
  const existingReg = await prisma.registration.findUnique({
    where: {
      seasonId_userId: { seasonId: team.seasonId, userId: manager.id },
    },
    select: { id: true, status: true, isTeamManager: true, teamId: true },
  });
  const regActive =
    existingReg &&
    existingReg.status !== "WITHDRAWN" &&
    existingReg.status !== "REJECTED";
  // A manager may drive for ANOTHER team (driver of one team, manager of any
  // number of teams) — only driving for the team he manages is off-limits.
  if (
    regActive &&
    !existingReg.isTeamManager &&
    existingReg.teamId === team.id
  ) {
    fail(
      `${manager.firstName ?? ""} ${manager.lastName ?? ""} drives for this team — a manager must not drive for the team he manages. Drivers of other teams are fine.`
    );
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { managerUserId: manager.id },
  });

  // Ensure a pure (non-driving) manager has an auto-approved manager
  // registration so they appear under "My Registrations". A driver-manager
  // keeps his driver registration untouched — his manager role lives purely
  // on Team.managerUserId. Multi-team managers keep their single row —
  // Team.managerUserId is the source of truth per team.
  if (!regActive) {
    await prisma.registration.upsert({
      where: {
        seasonId_userId: { seasonId: team.seasonId, userId: manager.id },
      },
      update: {
        status: "APPROVED",
        isTeamManager: true,
        teamId: team.id,
        carClassId: null,
        carId: null,
        iRating: null,
        approvedById: null,
        approvedAt: new Date(),
      },
      create: {
        seasonId: team.seasonId,
        userId: manager.id,
        status: "APPROVED",
        isTeamManager: true,
        teamId: team.id,
        approvedAt: new Date(),
      },
    });
  }

  const managerName =
    `${manager.firstName ?? ""} ${manager.lastName ?? ""}`.trim();
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: "UPDATED",
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: "Team manager assigned",
        value: managerName || "—",
        inline: false,
      },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/teams/${team.id}/manage`);
  revalidatePath(`/registrations`);
  redirect(withQuery(redirectTo, "success", `${managerName} is now team manager`));
}

export async function removeTeamManager(formData: FormData) {
  const teamId = String(formData.get("teamId") ?? "");
  const redirectTo =
    String(formData.get("redirectTo") ?? "") || `/teams/${teamId}/manage`;
  if (!teamId) throw new Error("teamId required");
  const { team } = await requireChefOrAdmin(teamId);

  const oldManagerId = team.managerUserId;
  if (!oldManagerId) {
    redirect(withQuery(redirectTo, "error", "This team has no manager"));
  }

  await prisma.team.update({
    where: { id: team.id },
    data: { managerUserId: null },
  });

  // Withdraw the manager registration only if they manage no other team in
  // this season.
  const stillManages = await prisma.team.count({
    where: { seasonId: team.seasonId, managerUserId: oldManagerId },
  });
  if (stillManages === 0) {
    await prisma.registration.updateMany({
      where: {
        seasonId: team.seasonId,
        userId: oldManagerId!,
        isTeamManager: true,
      },
      data: { status: "WITHDRAWN" },
    });
  }

  const oldManager = await prisma.user.findUnique({
    where: { id: oldManagerId! },
    select: { firstName: true, lastName: true },
  });
  await notifyTeamChange({
    leagueSlug: team.season.league.slug,
    seasonId: team.seasonId,
    kind: "UPDATED",
    teamName: team.name,
    seasonLabel: `${team.season.name} ${team.season.year}`,
    fields: [
      {
        name: "Team manager removed",
        value:
          `${oldManager?.firstName ?? ""} ${oldManager?.lastName ?? ""}`.trim() ||
          "—",
        inline: false,
      },
    ],
  });

  revalidatePath(
    `/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(
    `/admin/leagues/${team.season.league.slug}/seasons/${team.seasonId}/roster`
  );
  revalidatePath(`/teams/${team.id}/manage`);
  revalidatePath(`/registrations`);
  redirect(withQuery(redirectTo, "success", "Manager removed"));
}

// ============================================================================
// Shared notifier for team-leader-driven changes (used by update / withdraw /
// transfer). Fires Discord webhook AND email to the league's notify list.
// Fire-and-forget — never blocks the action on a webhook/email failure.
// ============================================================================
type TeamChangeKind =
  | "REGISTERED"
  | "UPDATED"
  | "WITHDRAWN"
  | "LEADERSHIP_TRANSFERRED";

async function notifyTeamChange(params: {
  leagueSlug: string;
  seasonId: string;
  kind: TeamChangeKind;
  teamName: string;
  seasonLabel: string;
  fields: Array<{ name: string; value: string; inline?: boolean }>;
}) {
  const META: Record<
    TeamChangeKind,
    { emoji: string; title: string; color: number }
  > = {
    REGISTERED: { emoji: "🏁", title: "New team registration", color: 0xff6b35 },
    UPDATED: { emoji: "✏️", title: "Team updated", color: 0x3b82f6 },
    WITHDRAWN: { emoji: "❌", title: "Team withdrawn", color: 0xef4444 },
    LEADERSHIP_TRANSFERRED: {
      emoji: "🔄",
      title: "Team leadership transferred",
      color: 0xf59e0b,
    },
  };
  const meta = META[params.kind];

  const lg = await prisma.league.findUnique({
    where: { slug: params.leagueSlug },
    select: {
      name: true,
      discordRegistrationsWebhookUrl: true,
      registrationNotifyEmails: true,
    },
  });
  if (!lg) return;

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com";
  const rosterUrl = `${baseUrl}/admin/leagues/${params.leagueSlug}/seasons/${params.seasonId}/roster`;
  const heading = `${meta.emoji} ${meta.title} — ${lg.name} ${params.seasonLabel}`;

  // ---- Discord ----
  if (lg.discordRegistrationsWebhookUrl) {
    try {
      await postDiscordWebhook(lg.discordRegistrationsWebhookUrl, {
        username: "CLS Registrations",
        embeds: [
          {
            title: heading,
            description: `Team: **${params.teamName}**`,
            url: rosterUrl,
            color: meta.color,
            fields: params.fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Click the title to open the roster" },
          },
        ],
      });
    } catch {
      // never block on webhook errors
    }
  }

  // ---- Email ----
  const recipients = (lg.registrationNotifyEmails ?? []).filter(
    (e): e is string => typeof e === "string" && /@/.test(e)
  );
  if (recipients.length > 0) {
    const escape = (v: string | number | null | undefined) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    const subject = `${meta.emoji} ${meta.title} — ${lg.name} ${params.seasonLabel} — ${params.teamName}`;
    const fieldsHtml = params.fields
      .map(
        (f) =>
          `<tr><td style="padding:6px 0;color:#71717a;width:140px;vertical-align:top;">${escape(
            f.name
          )}</td><td>${escape(f.value)}</td></tr>`
      )
      .join("");

    const html = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; color: #18181b;">
        <h2 style="margin: 0 0 8px 0; color: #ff6b35;">${escape(heading)}</h2>
        <p style="margin: 0 0 16px 0; color: #52525b; font-size: 13px;">
          Team: <strong>${escape(params.teamName)}</strong>
        </p>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          ${fieldsHtml}
        </table>
        <p style="margin-top: 20px;">
          <a href="${rosterUrl}" style="display: inline-block; background: #ff6b35; color: #18181b; padding: 10px 16px; text-decoration: none; border-radius: 6px; font-weight: 600;">Open roster</a>
        </p>
        <p style="margin-top: 24px; color: #a1a1aa; font-size: 12px;">CLS — CAS League Scoring</p>
      </div>
    `;
    const text = [
      heading,
      "",
      `Team: ${params.teamName}`,
      "",
      ...params.fields.map((f) => `${f.name}: ${f.value}`),
      "",
      `Open roster: ${rosterUrl}`,
    ].join("\n");

    try {
      await sendResendEmail({ to: recipients, subject, html, text });
    } catch {
      // never block on email errors
    }
  }
}

