"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { put, del } from "@vercel/blob";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  postStreamAnnouncement,
  refreshStreamAnnouncement,
} from "@/lib/notify-stream";
import { deleteBotMessage } from "@/lib/discord-bot";

const ACCEPT = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB

function streamPagePath(slug: string, seasonId: string, roundId: string) {
  return `/admin/leagues/${slug}/seasons/${seasonId}/rounds/${roundId}/stream`;
}

/**
 * Create or update the StreamAnnouncement for a round.
 *
 * Form fields:
 *   leagueSlug          (hidden)
 *   seasonId            (hidden)
 *   roundId             (hidden)
 *   scheduledAt         (datetime-local, in admin's local tz — converted by browser)
 *   twitchUrl           (optional override of league.twitchUrl)
 *   messageText         (optional body)
 *   poster              (file input; optional on update)
 */
export async function saveStreamAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");
  if (!leagueSlug || !seasonId || !roundId) {
    throw new Error("Missing leagueSlug/seasonId/roundId");
  }

  const scheduledAtRaw = String(formData.get("scheduledAt") ?? "").trim();
  if (!scheduledAtRaw) {
    redirect(
      streamPagePath(leagueSlug, seasonId, roundId) +
        "?error=Please+pick+a+scheduled+time"
    );
  }
  const scheduledAt = new Date(scheduledAtRaw);
  if (Number.isNaN(scheduledAt.getTime())) {
    redirect(
      streamPagePath(leagueSlug, seasonId, roundId) +
        "?error=Invalid+scheduled+time"
    );
  }

  // Optional: when the stream actually goes live (shown in the embed).
  // Falls back to scheduledAt when left blank.
  const streamAtRaw = String(formData.get("streamAt") ?? "").trim();
  let streamAt: Date | null = null;
  if (streamAtRaw) {
    const parsed = new Date(streamAtRaw);
    if (Number.isNaN(parsed.getTime())) {
      redirect(
        streamPagePath(leagueSlug, seasonId, roundId) +
          "?error=Invalid+stream-live+time"
      );
    }
    streamAt = parsed;
  }

  const twitchUrl =
    String(formData.get("twitchUrl") ?? "").trim() || null;
  const messageText =
    String(formData.get("messageText") ?? "").trim() || null;

  // Existing record (if any)
  const existing = await prisma.streamAnnouncement.findUnique({
    where: { roundId },
  });

  // Optional file upload
  const file = formData.get("poster");
  let posterBlobUrl: string | null | undefined = undefined; // undefined = leave alone
  if (file instanceof File && file.size > 0) {
    if (!ACCEPT.includes(file.type)) {
      redirect(
        streamPagePath(leagueSlug, seasonId, roundId) +
          "?error=Image+must+be+PNG%2FJPG%2FWebP%2FGIF"
      );
    }
    if (file.size > MAX_BYTES) {
      redirect(
        streamPagePath(leagueSlug, seasonId, roundId) +
          "?error=" +
          encodeURIComponent(
            `Image is ${(file.size / 1024 / 1024).toFixed(1)} MB — max is 20 MB. Compress or use JPEG.`
          )
      );
    }

    // Stable filename including roundId so re-uploads can be diffed/audited
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "png";
    const filename = `stream-posters/${roundId}.${Date.now()}.${ext}`;
    try {
      const blob = await put(filename, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
      });
      posterBlobUrl = blob.url;
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Unknown blob upload error";
      const hint = /BLOB_READ_WRITE_TOKEN|No token|Forbidden|401/i.test(msg)
        ? "Vercel Blob store not configured. Create one in Vercel → Storage; BLOB_READ_WRITE_TOKEN is auto-injected."
        : msg;
      redirect(
        streamPagePath(leagueSlug, seasonId, roundId) +
          "?error=" +
          encodeURIComponent("Poster upload failed: " + hint)
      );
    }

    // Delete the previous blob if we're replacing.
    if (existing?.posterBlobUrl && existing.posterBlobUrl !== posterBlobUrl) {
      try {
        await del(existing.posterBlobUrl);
      } catch {
        /* ignore */
      }
    }
  }

  if (existing) {
    await prisma.streamAnnouncement.update({
      where: { id: existing.id },
      data: {
        scheduledAt,
        streamAt,
        twitchUrl,
        messageText,
        ...(posterBlobUrl !== undefined ? { posterBlobUrl } : {}),
      },
    });
  } else {
    await prisma.streamAnnouncement.create({
      data: {
        roundId,
        scheduledAt,
        streamAt,
        twitchUrl,
        messageText,
        posterBlobUrl: posterBlobUrl ?? null,
      },
    });
  }

  revalidatePath(streamPagePath(leagueSlug, seasonId, roundId));
  redirect(streamPagePath(leagueSlug, seasonId, roundId) + "?ok=Saved");
}

export async function deleteStreamAnnouncement(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");

  const existing = await prisma.streamAnnouncement.findUnique({
    where: { roundId },
  });
  if (existing) {
    // Best-effort delete the Discord message + blob.
    if (existing.discordChannelId && existing.discordMessageId) {
      try {
        await deleteBotMessage(
          existing.discordChannelId,
          existing.discordMessageId
        );
      } catch {
        /* ignore */
      }
    }
    if (existing.posterBlobUrl) {
      try {
        await del(existing.posterBlobUrl);
      } catch {
        /* ignore */
      }
    }
    await prisma.streamAnnouncement.delete({ where: { id: existing.id } });
  }

  revalidatePath(streamPagePath(leagueSlug, seasonId, roundId));
  redirect(streamPagePath(leagueSlug, seasonId, roundId) + "?ok=Removed");
}

/**
 * Turn a failed post/refresh into something an admin can act on. Without this
 * the banner just said "edit-failed", which hid e.g. Discord error 30046
 * ("Maximum number of edits to messages older than 1 hour reached") — a
 * transient rate limit that looks exactly like a broken feature.
 */
function describeDiscordFailure(r: {
  reason: string;
  discordStatus?: number;
  discordBody?: string;
}): string {
  if (r.discordStatus === undefined) return r.reason;
  let detail = (r.discordBody ?? "").slice(0, 200);
  try {
    const j = JSON.parse(r.discordBody ?? "") as { message?: string; code?: number };
    if (j.message) detail = j.code ? `${j.message} (code ${j.code})` : j.message;
  } catch {
    /* keep the raw snippet */
  }
  return `${r.reason} — Discord ${r.discordStatus}${detail ? `: ${detail}` : ""}`;
}

export async function postStreamNow(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");

  const r = await postStreamAnnouncement(roundId, { force: true });
  const qs = r.ok
    ? "?ok=Posted"
    : "?error=" +
      encodeURIComponent(`Could not post: ${describeDiscordFailure(r)}`);

  revalidatePath(streamPagePath(leagueSlug, seasonId, roundId));
  redirect(streamPagePath(leagueSlug, seasonId, roundId) + qs);
}

export async function refreshStreamEmbed(formData: FormData): Promise<void> {
  await requireAdmin();
  const leagueSlug = String(formData.get("leagueSlug") ?? "");
  const seasonId = String(formData.get("seasonId") ?? "");
  const roundId = String(formData.get("roundId") ?? "");

  const r = await refreshStreamAnnouncement(roundId);
  const qs = r.ok
    ? "?ok=Embed+refreshed"
    : "?error=" +
      encodeURIComponent(`Could not refresh: ${describeDiscordFailure(r)}`);

  revalidatePath(streamPagePath(leagueSlug, seasonId, roundId));
  redirect(streamPagePath(leagueSlug, seasonId, roundId) + qs);
}
