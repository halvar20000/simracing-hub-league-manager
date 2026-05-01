"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSteward } from "@/lib/auth-helpers";
import { fetchEventReviews, fetchEventProtests, fetchLeagueMembers, type IRLMReview, type IRLMProtest } from "@/lib/irlm";

interface PullSummary {
  rounds: number;
  reviewsSeen: number;
  reviewsImported: number;
  reviewsSkippedDecided: number;
  reviewsSkippedNoMember: number;
  reviewsAlreadyExisted: number;
  protestsSeen: number;
  protestsImported: number;
  protestsSkippedNoMember: number;
  protestsAlreadyExisted: number;
}

export async function pullReviewsFromIRLM(formData: FormData): Promise<void> {
  const me = await requireSteward();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  if (!leagueSlug || !seasonId) {
    redirect(`/admin/stewards?error=${encodeURIComponent("Missing leagueSlug or seasonId")}`);
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: {
      league: { select: { slug: true } },
      rounds: {
        where: { irlmEventId: { not: null } },
        select: { id: true, name: true, roundNumber: true, irlmEventId: true },
      },
    },
  });
  if (!season || season.league.slug !== leagueSlug) {
    redirect(`/admin/stewards?error=${encodeURIComponent("Season not found")}`);
  }
  if (!season.irlmLeagueName) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports?error=${encodeURIComponent(
        "Season has no irlmLeagueName configured"
      )}`
    );
  }

  // Build memberId → iRacingId map (and to display name) once.
  const irlmMembers = await fetchLeagueMembers(season.irlmLeagueName!);
  const memberToCust = new Map<number, string>();
  const memberDisplay = new Map<number, string>();
  for (const m of irlmMembers) {
    memberToCust.set(m.memberId, String(m.iRacingId));
    memberDisplay.set(m.memberId, `${m.firstname ?? ""} ${m.lastname ?? ""}`.trim());
  }

  const summary: PullSummary = {
    rounds: 0,
    reviewsSeen: 0,
    reviewsImported: 0,
    reviewsSkippedDecided: 0,
    reviewsSkippedNoMember: 0,
    reviewsAlreadyExisted: 0,
    protestsSeen: 0,
    protestsImported: 0,
    protestsSkippedNoMember: 0,
    protestsAlreadyExisted: 0,
  };

  for (const round of season.rounds) {
    if (!round.irlmEventId) continue;
    summary.rounds += 1;

    let reviews: IRLMReview[] = [];
    try {
      reviews = await fetchEventReviews(season.irlmLeagueName!, round.irlmEventId);
    } catch (e) {
      console.error("[iRLM Reviews]", round.name, e);
      continue;
    }
    summary.reviewsSeen += reviews.length;

    for (const r of reviews) {
      // Filter: only open / under review (no decision yet)
      if (Array.isArray(r.voteResults) && r.voteResults.length > 0) {
        summary.reviewsSkippedDecided += 1;
        continue;
      }

      // Skip if we already have this review
      const existing = await prisma.incidentReport.findFirst({
        where: { irlmReviewId: r.reviewId },
      });
      if (existing) {
        summary.reviewsAlreadyExisted += 1;
        continue;
      }

      // Reporter: first involved member that maps to a registered driver in our season
      const involved = Array.isArray(r.involvedMembers) ? r.involvedMembers : [];
      let reporterReg: { id: string; userId: string } | null = null;
      const matchedRegs: { regId: string; userId: string }[] = [];

      for (const m of involved) {
        const cust = memberToCust.get(m.memberId);
        if (!cust) continue;
        const reg = await prisma.registration.findFirst({
          where: {
            seasonId,
            status: "APPROVED",
            user: { iracingMemberId: cust },
          },
          select: { id: true, userId: true },
        });
        if (reg) {
          matchedRegs.push({ regId: reg.id, userId: reg.userId });
          if (!reporterReg) reporterReg = reg;
        }
      }

      if (!reporterReg) {
        summary.reviewsSkippedNoMember += 1;
        continue;
      }

      // Build description with metadata + iRLM authorName for transparency.
      const descParts: string[] = [];
      if (r.fullDescription) descParts.push(r.fullDescription.trim());
      const meta: string[] = [];
      if (r.authorName) meta.push(`Reported on iRLM by ${r.authorName}`);
      if (r.sessionName) meta.push(`Session: ${r.sessionName}`);
      meta.push(`iRLM review #${r.reviewId}`);
      descParts.push("\n— " + meta.join(" • "));

      const lapNumber = r.onLap ? parseInt(String(r.onLap), 10) : null;
      const corner = (r.corner ?? "").trim() || null;
      const timeStamp = (r.timeStamp ?? "").trim() || null;

      const created = await prisma.incidentReport.create({
        data: {
          roundId: round.id,
          reporterUserId: reporterReg.userId,
          reporterRegistrationId: reporterReg.id,
          lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
          turnOrSector: corner,
          description: descParts.filter(Boolean).join("\n"),
          status: "SUBMITTED",
          submittedAt: r.createdOn ? new Date(r.createdOn) : new Date(),
          replayTimestamp: timeStamp,
          outsideRaceIncident: false,
          irlmReviewId: r.reviewId,
        },
      });

      // Tag involved drivers (skip the reporter themself)
      for (const reg of matchedRegs) {
        await prisma.incidentReportInvolvedDriver
          .create({
            data: {
              incidentReportId: created.id,
              registrationId: reg.regId,
              role: reg.regId === reporterReg.id ? "REPORTER" : "ACCUSED",
            },
          })
          .catch(() => {
            /* dup */
          });
      }

      summary.reviewsImported += 1;
    }

    // ---------- PROTESTS ----------
    let protests: IRLMProtest[] = [];
    try {
      protests = await fetchEventProtests(season.irlmLeagueName!, round.irlmEventId);
    } catch (e) {
      console.error("[iRLM Protests]", round.name, e);
    }
    summary.protestsSeen += protests.length;

    for (const pr of protests) {
      const existing = await prisma.incidentReport.findFirst({
        where: { irlmProtestId: pr.protestId },
      });
      if (existing) {
        summary.protestsAlreadyExisted += 1;
        continue;
      }

      // Reporter from author.memberId
      const authorMemberId = pr.author?.memberId;
      const authorCust = authorMemberId != null ? memberToCust.get(authorMemberId) : undefined;
      let reporterReg: { id: string; userId: string } | null = null;
      if (authorCust) {
        const reg = await prisma.registration.findFirst({
          where: { seasonId, status: "APPROVED", user: { iracingMemberId: authorCust } },
          select: { id: true, userId: true },
        });
        if (reg) reporterReg = reg;
      }
      if (!reporterReg) {
        summary.protestsSkippedNoMember += 1;
        continue;
      }

      // Accused from involvedMembers
      const involved = Array.isArray(pr.involvedMembers) ? pr.involvedMembers : [];
      const accusedRegs: { regId: string; userId: string }[] = [];
      for (const m of involved) {
        const cust = memberToCust.get(m.memberId);
        if (!cust) continue;
        const reg = await prisma.registration.findFirst({
          where: { seasonId, status: "APPROVED", user: { iracingMemberId: cust } },
          select: { id: true, userId: true },
        });
        if (reg) accusedRegs.push({ regId: reg.id, userId: reg.userId });
      }

      const descParts: string[] = [];
      if (pr.fullDescription) descParts.push(pr.fullDescription.trim());
      const meta: string[] = [];
      const authorName = pr.author ? `${pr.author.firstName ?? ""} ${pr.author.lastName ?? ""}`.trim() : null;
      if (authorName) meta.push(`Protest by ${authorName}`);
      if (pr.sessionName) meta.push(`Session: ${pr.sessionName}`);
      meta.push(`iRLM protest #${pr.protestId}`);
      descParts.push("\n— " + meta.join(" • "));

      const lapNumber = pr.onLap ? parseInt(String(pr.onLap), 10) : null;
      const corner = (pr.corner ?? "").trim() || null;

      const created = await prisma.incidentReport.create({
        data: {
          roundId: round.id,
          reporterUserId: reporterReg.userId,
          reporterRegistrationId: reporterReg.id,
          lapNumber: Number.isFinite(lapNumber) ? lapNumber : null,
          turnOrSector: corner,
          description: descParts.filter(Boolean).join("\n"),
          status: "SUBMITTED",
          submittedAt: new Date(),
          outsideRaceIncident: false,
          irlmProtestId: pr.protestId,
        },
      });

      // Reporter as REPORTER
      await prisma.incidentReportInvolvedDriver
        .create({
          data: {
            incidentReportId: created.id,
            registrationId: reporterReg.id,
            role: "REPORTER",
          },
        })
        .catch(() => { /* dup */ });
      // Involved as ACCUSED
      for (const a of accusedRegs) {
        if (a.regId === reporterReg.id) continue;
        await prisma.incidentReportInvolvedDriver
          .create({
            data: {
              incidentReportId: created.id,
              registrationId: a.regId,
              role: "ACCUSED",
            },
          })
          .catch(() => { /* dup */ });
      }

      summary.protestsImported += 1;
    }
  }

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  revalidatePath(`/admin/stewards`);

  const params = new URLSearchParams({
    pulled: String(summary.reviewsImported + summary.protestsImported),
    pulledReviews: String(summary.reviewsImported),
    pulledProtests: String(summary.protestsImported),
    seen: String(summary.reviewsSeen + summary.protestsSeen),
    seenReviews: String(summary.reviewsSeen),
    seenProtests: String(summary.protestsSeen),
    skippedDecided: String(summary.reviewsSkippedDecided),
    skippedNoMember: String(summary.reviewsSkippedNoMember + summary.protestsSkippedNoMember),
    existed: String(summary.reviewsAlreadyExisted + summary.protestsAlreadyExisted),
    rounds: String(summary.rounds),
  });
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports?${params.toString()}`
  );
}
