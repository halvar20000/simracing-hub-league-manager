"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { CR_CONFIG_KEY, type CrConfig } from "@/lib/cas-rating-data";
import { STREAMERS } from "@/lib/stream-calendar";

/**
 * Saves the CAS Rating configuration: per league the season it counts from
 * (empty = league does not count) and an optional from-date, plus which CLS
 * user each stream-calendar name is.
 */
export async function saveCasRatingConfigAction(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagues = await prisma.league.findMany({ select: { id: true, slug: true } });

  const next: CrConfig = { leagues: {}, streamers: {} };
  for (const l of leagues) {
    const seasonId = String(formData.get(`season:${l.slug}`) ?? "").trim();
    if (!seasonId) continue;
    const season = await prisma.season.findFirst({ where: { id: seasonId, leagueId: l.id }, select: { id: true } });
    if (!season) continue;
    const fromDate = String(formData.get(`from:${l.slug}`) ?? "").trim();
    next.leagues[l.slug] = {
      fromSeasonId: season.id,
      fromDate: /^\d{4}-\d{2}-\d{2}$/.test(fromDate) ? fromDate : null,
    };
  }
  for (const name of STREAMERS) {
    const userId = String(formData.get(`streamer:${name}`) ?? "").trim();
    if (!userId) continue;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (user) next.streamers[name] = user.id;
  }

  await prisma.appSetting.upsert({
    where: { key: CR_CONFIG_KEY },
    update: { value: JSON.stringify(next) },
    create: { key: CR_CONFIG_KEY, value: JSON.stringify(next) },
  });
  revalidatePath("/admin/cas-rating/live");
  redirect("/admin/cas-rating/live?saved=1");
}
