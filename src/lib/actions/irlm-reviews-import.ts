"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireSteward } from "@/lib/auth-helpers";
import { fetchEventReviews, fetchLeagueMembers, type IRLMReview } from "@/lib/irlm";

interface PullSummary {
  rounds: number;
  reviewsSeen: number;
  reviewsImported: number;
  reviewsSkippedDecided: number;
  reviewsSkippedNoMember: number;
  reviewsAlreadyExisted: number;
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
  }

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports`);
  revalidatePath(`/admin/stewards`);

  const params = new URLSearchParams({
    pulled: String(summary.reviewsImported),
    seen: String(summary.reviewsSeen),
    skippedDecided: String(summary.reviewsSkippedDecided),
    skippedNoMember: String(summary.reviewsSkippedNoMember),
    existed: String(summary.reviewsAlreadyExisted),
    rounds: String(summary.rounds),
  });
  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/reports?${params.toString()}`
  );
}
