"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { notifyReportingOpenForRound } from "@/lib/notify-reporting";

export async function notifyReportingOpenManually(formData: FormData) {
  await requireAdmin();
  const roundId = String(formData.get("roundId") ?? "");
  if (!roundId) throw new Error("roundId required");
  await notifyReportingOpenForRound(roundId, { force: true });

  // Revalidate the season admin page so the button state refreshes.
  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: { season: { include: { league: true } } },
  });
  if (round) {
    revalidatePath(
      `/admin/leagues/${round.season.league.slug}/seasons/${round.seasonId}`
    );
  }
}
