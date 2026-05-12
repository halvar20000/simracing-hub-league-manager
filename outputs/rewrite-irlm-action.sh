#!/usr/bin/env bash
# Rewrite the iRLM import action file from scratch with a clean structure.

set -euo pipefail
cd "$HOME/Nextcloud/AI/league-manager"

cat > src/lib/actions/irlm-import.ts <<'EOF'
"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { fetchEventResults } from "@/lib/irlm";
import { recomputeRoundScoring } from "@/lib/scoring";
import type { FinishStatus } from "@prisma/client";

export async function pullResultsFromIRLM(formData: FormData): Promise<void> {
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!leagueSlug || !seasonId || !roundId) return;

  const admin = await requireAdmin();

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: true },
  });
  if (!round) {
    redirect(`/admin/leagues/${leagueSlug}/seasons/${seasonId}`);
  }

  if (!round.irlmEventId || !round.season.irlmLeagueName) {
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=Configure+iRLM+league+name+on+the+season+and+event+ID+on+the+round+first`
    );
  }

  let eventResults;
  try {
    eventResults = await fetchEventResults(
      round.season.irlmLeagueName,
      round.irlmEventId
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "iRLM fetch failed";
    redirect(
      `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?error=${encodeURIComponent(msg)}`
    );
  }

  let imported = 0;
  let skipped = 0;
  const errors: { memberId: string; reason: string }[] = [];

  for (const eventResult of eventResults) {
    for (const session of eventResult.sessionResults ?? []) {
      const sessionLabel = (session.sessionType ?? session.sessionName ?? "").toLowerCase();
      if (
        sessionLabel.includes("qualif") ||
        sessionLabel.includes("practice") ||
        sessionLabel.includes("warmup")
      ) {
        continue;
      }
      const rows = session.resultRows ?? [];
      let maxLaps = 0;
      for (const row of rows) {
        const l = Number(row.completedLaps ?? 0);
        if (l > maxLaps) maxLaps = l;
      }
      for (const row of rows) {
        const memberId = String(row.memberId ?? "").trim();
        if (!memberId) {
          skipped++;
          errors.push({ memberId: "", reason: "no memberId" });
          continue;
        }

        const reg = await prisma.registration.findFirst({
          where: {
            seasonId,
            status: "APPROVED",
            user: { iracingMemberId: memberId },
          },
        });
        if (!reg) {
          skipped++;
          errors.push({
            memberId,
            reason: `no approved registration for ${memberId}`,
          });
          continue;
        }

        const statusRaw = (row.status ?? "").toLowerCase();
        let finishStatus: FinishStatus = "CLASSIFIED";
        if (statusRaw.includes("disq")) finishStatus = "DSQ";
        else if (statusRaw.includes("disconnect")) finishStatus = "DNF";
        else if (!statusRaw.includes("running") && statusRaw !== "") finishStatus = "DNF";

        const finishPosition = Math.round(Number(row.finishPosition ?? 0));
        const lapsCompleted = Math.round(Number(row.completedLaps ?? 0));
        let raceDistancePct = 0;
        if (maxLaps > 0) {
          raceDistancePct = Math.round((lapsCompleted / maxLaps) * 100);
        } else if (typeof row.completedPct === "number") {
          raceDistancePct = Math.round(row.completedPct * 100);
        }
        const incidents = Math.round(Number(row.incidents ?? 0));

        let bestLapTimeMs: number | null = null;
        const fastest = row.fastestLapTime;
        if (typeof fastest === "string" && fastest.trim() && fastest !== "00:00:00") {
          const parts = fastest.trim().split(":");
          let h = 0;
          let m = 0;
          let sec = 0;
          if (parts.length === 3) {
            h = parseInt(parts[0], 10);
            m = parseInt(parts[1], 10);
            sec = parseFloat(parts[2]);
          } else if (parts.length === 2) {
            m = parseInt(parts[0], 10);
            sec = parseFloat(parts[1]);
          } else {
            sec = parseFloat(fastest.trim());
          }
          const total = h * 3600 + m * 60 + sec;
          if (total > 0 && !Number.isNaN(total)) bestLapTimeMs = Math.round(total * 1000);
        }

        const iRating = typeof row.newIrating === "number" ? row.newIrating : null;

        await prisma.raceResult.upsert({
          where: { roundId_registrationId: { roundId, registrationId: reg.id } },
          create: {
            roundId,
            registrationId: reg.id,
            finishStatus,
            finishPosition,
            lapsCompleted,
            raceDistancePct,
            bestLapTimeMs,
            totalTimeMs: null,
            incidents,
            iRating,
          },
          update: {
            finishStatus,
            finishPosition,
            lapsCompleted,
            raceDistancePct,
            bestLapTimeMs,
            incidents,
            iRating,
          },
        });
        imported++;
      }
    }
  }

  await prisma.csvImport.create({
    data: {
      roundId,
      uploadedById: admin.id,
      originalFilename: `iRLM-pull-${new Date().toISOString()}`,
      rowsImported: imported,
      rowsSkipped: skipped,
      errorLog: errors.length > 0 ? (errors as object) : undefined,
    },
  });

  await recomputeRoundScoring(prisma, roundId);

  revalidatePath(`/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}`);
  revalidatePath(`/leagues/${leagueSlug}/seasons/${seasonId}/standings`);

  redirect(
    `/admin/leagues/${leagueSlug}/seasons/${seasonId}/rounds/${roundId}?imported=${imported}&skipped=${skipped}`
  );
}
EOF

echo "Done. Action file rewritten cleanly."
echo ""
echo "Push:"
echo "  git add -A && git commit -m 'Rewrite iRLM action file cleanly' && git push"
