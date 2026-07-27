"use server";

import { put } from "@vercel/blob";
import { MAX_IMPRESSIONS, type PlannerImage } from "@/lib/stint-plan-state";

// Pictures kept with a stint plan: the finisher's certificate/poster and the
// impressions from the race. Archived on Vercel Blob; the plan payload only
// stores the URLs, so a shared link shows the same gallery to the whole team.

/** Per file. A 4K screenshot is ~5 MB; 12 MB leaves room for a PNG poster. */
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
/** Server Actions cap the whole request at 25 MB (next.config.ts). */
const MAX_BATCH_BYTES = 22 * 1024 * 1024;

void MAX_IMPRESSIONS; // re-exported from the state module for the client

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

export type UploadImagesResult =
  | { ok: true; images: PlannerImage[]; skipped: string[] }
  | { ok: false; error: string };

/**
 * Upload one or more pictures for a plan.
 *
 * `kind` only picks the folder — the caller decides whether the result becomes
 * the poster or lands in the impressions grid.
 */
export async function uploadStintPlanImages(
  formData: FormData
): Promise<UploadImagesResult> {
  const kindRaw = formData.get("kind");
  const kind = kindRaw === "poster" ? "poster" : "impression";
  const files = formData
    .getAll("files")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length === 0) return { ok: false, error: "No image selected." };

  const total = files.reduce((n, f) => n + f.size, 0);
  if (total > MAX_BATCH_BYTES) {
    return {
      ok: false,
      error: `Those images are ${(total / 1024 / 1024).toFixed(1)} MB together — upload them in smaller batches (max 22 MB per go).`,
    };
  }

  const images: PlannerImage[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    if (!ALLOWED.includes(file.type)) {
      // HEIC straight off an iPhone is the common case here, and browsers
      // can't display it — say so instead of storing something unviewable.
      skipped.push(`${file.name} (${file.type || "unknown type"})`);
      continue;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      skipped.push(`${file.name} (${(file.size / 1024 / 1024).toFixed(1)} MB)`);
      continue;
    }
    try {
      const blob = await put(
        `stint-planner/${kind}/${file.name}`,
        await file.arrayBuffer(),
        {
          access: "public",
          contentType: file.type,
          addRandomSuffix: true,
        }
      );
      images.push({
        url: blob.url,
        name: file.name,
        uploadedAt: new Date().toISOString(),
      });
    } catch {
      skipped.push(`${file.name} (upload failed)`);
    }
  }

  if (images.length === 0) {
    return {
      ok: false,
      error: `Nothing uploaded — ${skipped.join(", ")}. JPEG, PNG, WebP, AVIF and GIF work; HEIC does not.`,
    };
  }
  return { ok: true, images, skipped };
}
