"use client";

import { useEffect, useState } from "react";
import type { PlannerImage } from "@/lib/stint-plan-state";

/**
 * The race poster and the impressions from the race.
 *
 * A stint plan is the team's memory of a race: the schedule, what actually
 * happened, and — from here on — the finisher's certificate and the pictures
 * taken along the way. Thumbnails keep the page short; a click opens the full
 * picture over the page.
 */
export default function RaceGallery({
  poster,
  impressions,
  busy,
  onPickPoster,
  onPickImpressions,
  onRemovePoster,
  onRemoveImpression,
  onCaption,
  max,
}: {
  poster: PlannerImage | null;
  impressions: PlannerImage[];
  busy: boolean;
  onPickPoster: (files: FileList | null) => void;
  onPickImpressions: (files: FileList | null) => void;
  onRemovePoster: () => void;
  onRemoveImpression: (url: string) => void;
  onCaption: (url: string, caption: string) => void;
  max: number;
}) {
  const [lightbox, setLightbox] = useState<PlannerImage | null>(null);

  // Escape closes the lightbox — nobody wants to hunt for the × on a 4K shot.
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const full = impressions.length >= max;

  return (
    <div className="space-y-5">
      {/* ---- Poster / certificate ---- */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            Result poster / certificate
          </span>
          <label className="print:hidden cursor-pointer rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs text-zinc-300 hover:bg-zinc-800">
            {busy ? "Uploading…" : poster ? "Replace poster" : "Upload poster"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              className="hidden"
              disabled={busy}
              onChange={(e) => {
                onPickPoster(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {poster ? (
          <figure className="overflow-hidden rounded border border-zinc-800 bg-zinc-950/60">
            {/* eslint-disable-next-line @next/next/no-img-element -- Blob URLs
                are external and unsized; next/image would need a loader config
                for no benefit on a picture shown once. */}
            <img
              src={poster.url}
              alt={poster.caption || "Result poster"}
              className="w-full cursor-zoom-in"
              onClick={() => setLightbox(poster)}
            />
            <figcaption className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs text-zinc-500">
              <input
                type="text"
                value={poster.caption ?? ""}
                onChange={(e) => onCaption(poster.url, e.target.value)}
                placeholder="Caption (optional) — e.g. P8 in class, LMP2"
                className="print:hidden min-w-[12rem] flex-1 rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-zinc-200"
              />
              <span className="hidden print:inline">{poster.caption}</span>
              <a
                href={poster.url}
                target="_blank"
                rel="noopener noreferrer"
                className="print:hidden text-orange-300 hover:text-orange-200"
              >
                open
              </a>
              <button
                onClick={onRemovePoster}
                className="print:hidden text-red-300/80 hover:text-red-200"
              >
                Remove
              </button>
            </figcaption>
          </figure>
        ) : (
          <p className="text-sm text-zinc-500">
            Upload the official certificate or your own result poster — it stays
            with the plan and everyone on the share link sees it.
          </p>
        )}
      </div>

      {/* ---- Impressions ---- */}
      <div>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-zinc-500">
            Impressions from the race
            {impressions.length > 0 && (
              <span className="ml-1 text-zinc-600">
                ({impressions.length}/{max})
              </span>
            )}
          </span>
          <label
            className={`print:hidden rounded border border-zinc-700 bg-zinc-900 px-3 py-1 text-xs ${
              full || busy
                ? "cursor-not-allowed text-zinc-600"
                : "cursor-pointer text-zinc-300 hover:bg-zinc-800"
            }`}
          >
            {busy ? "Uploading…" : full ? `Limit ${max} reached` : "Add pictures"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,image/avif,image/gif"
              multiple
              className="hidden"
              disabled={busy || full}
              onChange={(e) => {
                onPickImpressions(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {impressions.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Livery shots, a screenshot of the start, the moment it went wrong —
            several at once is fine.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {impressions.map((img) => (
              <figure
                key={img.url}
                className="overflow-hidden rounded border border-zinc-800 bg-zinc-950/60"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.caption || img.name}
                  loading="lazy"
                  className="aspect-video w-full cursor-zoom-in object-cover"
                  onClick={() => setLightbox(img)}
                />
                <figcaption className="space-y-1 px-2 py-1.5">
                  <input
                    type="text"
                    value={img.caption ?? ""}
                    onChange={(e) => onCaption(img.url, e.target.value)}
                    placeholder="Caption…"
                    className="print:hidden w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-0.5 text-xs text-zinc-200"
                  />
                  <span className="hidden text-xs text-zinc-400 print:block">
                    {img.caption}
                  </span>
                  <button
                    onClick={() => onRemoveImpression(img.url)}
                    className="print:hidden text-[11px] text-red-300/70 hover:text-red-200"
                  >
                    Remove
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </div>

      {/* ---- Lightbox ---- */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 print:hidden"
          onClick={() => setLightbox(null)}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption || lightbox.name}
        >
          <figure
            className="max-h-full max-w-6xl overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox.url}
              alt={lightbox.caption || lightbox.name}
              className="max-h-[85vh] w-auto rounded"
            />
            <figcaption className="mt-2 flex items-center justify-between gap-4 text-sm text-zinc-300">
              <span>{lightbox.caption || lightbox.name}</span>
              <span className="flex gap-3">
                <a
                  href={lightbox.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-orange-300 hover:text-orange-200"
                >
                  Full size
                </a>
                <button
                  onClick={() => setLightbox(null)}
                  className="text-zinc-400 hover:text-zinc-200"
                >
                  Close (Esc)
                </button>
              </span>
            </figcaption>
          </figure>
        </div>
      )}
    </div>
  );
}
