import "server-only";

import sharp from "sharp";
import type { PlannerImage } from "@/lib/stint-plan-state";

/**
 * The pictures from the race, ready to drop into a PowerPoint.
 *
 * The plan already holds them — the event poster and whatever the team
 * screenshotted during the night — as Vercel Blob URLs. A .pptx has to carry
 * the bytes, so they are fetched, shrunk and handed over as base64.
 *
 * Shrinking is not optional: eight 4K screenshots straight from iRacing make a
 * 40 MB deck that nobody can mail. 1600 px on the long edge is still sharp on
 * a projector and lands around 200 KB each.
 *
 * NOTHING here may throw. A picture that 404s, times out or turns out not to
 * be an image is skipped — a de-briefing without one photo is worth far more
 * than an export that fails.
 */

export type DebriefPicture = {
  /** "image/jpeg;base64,…" — the shape pptxgenjs wants in `data`. */
  data: string;
  /** Pixel dimensions, so the slide can place it without distortion. */
  w: number;
  h: number;
  name: string;
  caption: string | null;
};

export type DebriefPictures = {
  poster: DebriefPicture | null;
  impressions: DebriefPicture[];
  /** How many were asked for but could not be fetched or decoded. */
  skipped: number;
};

/** Long edge in pixels. Sharp on a projector, small enough to mail. */
const MAX_EDGE = 1600;
/** Per-image and total budgets for the finished deck, in bytes. */
const MAX_ONE = 6_000_000;
const MAX_TOTAL = 14_000_000;
/** Most impressions to carry — a debrief is not a photo album. */
const MAX_IMPRESSIONS = 8;
const FETCH_TIMEOUT_MS = 8000;

async function fetchPicture(
  img: PlannerImage,
  budget: { left: number }
): Promise<DebriefPicture | null> {
  if (budget.left <= 0) return null;
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(img.url, { signal: ctrl.signal, cache: "no-store" });
    } finally {
      clearTimeout(t);
    }
    if (!res.ok) return null;

    const raw = Buffer.from(await res.arrayBuffer());
    if (raw.length === 0 || raw.length > MAX_ONE * 6) return null;

    const pipeline = sharp(raw, { failOn: "none" }).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) return null;

    const out = await pipeline
      .resize({
        width: MAX_EDGE,
        height: MAX_EDGE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });

    if (out.data.length > MAX_ONE || out.data.length > budget.left) return null;
    budget.left -= out.data.length;

    return {
      data: `image/jpeg;base64,${out.data.toString("base64")}`,
      w: out.info.width,
      h: out.info.height,
      name: img.name,
      caption: img.caption?.trim() ? img.caption.trim() : null,
    };
  } catch {
    // Deliberately silent: see the note at the top.
    return null;
  }
}

export async function loadDebriefPictures(
  poster: PlannerImage | null,
  impressions: PlannerImage[]
): Promise<DebriefPictures> {
  const budget = { left: MAX_TOTAL };
  let skipped = 0;

  // The poster gets the budget first — it is the one picture the title slide
  // is built around, and losing it to eight screenshots would be backwards.
  const posterPic = poster ? await fetchPicture(poster, budget) : null;
  if (poster && !posterPic) skipped += 1;

  const wanted = impressions.slice(0, MAX_IMPRESSIONS);
  skipped += Math.max(0, impressions.length - wanted.length);

  const out: DebriefPicture[] = [];
  for (const img of wanted) {
    const pic = await fetchPicture(img, budget);
    if (pic) out.push(pic);
    else skipped += 1;
  }

  return { poster: posterPic, impressions: out, skipped };
}
