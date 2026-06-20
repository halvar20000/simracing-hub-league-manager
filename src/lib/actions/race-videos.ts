"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { matchYoutubeForRound } from "@/lib/match-youtube";
import { extractYoutubeVideoId } from "@/lib/youtube";

/**
 * Admin button: auto-match the race-stream YouTube VOD for a round now.
 * Uses force so it re-matches even if a video is already linked. Redirects
 * back to the admin round page with a `yt=` status flag.
 */
export async function matchYoutubeAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const slug = String(formData.get("slug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const base = `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;

  const res = await matchYoutubeForRound(roundId, { force: true });

  const params = new URLSearchParams();
  if (res.ok) {
    params.set("yt", res.action === "matched" ? "matched" : "yt-unchanged");
  } else {
    params.set("yt", `failed:${res.reason}`);
    if (res.detail) params.set("ytDetail", res.detail.slice(0, 300));
  }

  revalidatePath(base);
  revalidatePath(`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`);
  redirect(`${base}?${params.toString()}`);
}

/**
 * Admin: manually set or clear the round's YouTube video. Accepts a full URL
 * or a bare video ID; an empty value clears it. A manual value is preserved
 * by the auto-match cron (which only fills empty rounds).
 */
export async function setRoundYoutubeAction(formData: FormData): Promise<void> {
  await requireAdmin();

  const slug = String(formData.get("slug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  const base = `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`;

  const raw = String(formData.get("youtubeUrl") ?? "").trim();
  const params = new URLSearchParams();

  if (!raw) {
    await prisma.round.update({
      where: { id: roundId },
      data: { youtubeVideoId: null, youtubeMatchedAt: null },
    });
    params.set("yt", "cleared");
  } else {
    const videoId = extractYoutubeVideoId(raw);
    if (!videoId) {
      params.set("yt", "failed:bad-url");
    } else {
      await prisma.round.update({
        where: { id: roundId },
        data: { youtubeVideoId: videoId, youtubeMatchedAt: new Date() },
      });
      params.set("yt", "matched");
    }
  }

  revalidatePath(base);
  revalidatePath(`/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}`);
  redirect(`${base}?${params.toString()}`);
}
