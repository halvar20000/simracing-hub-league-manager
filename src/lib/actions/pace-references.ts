"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { parsePacePoints, IRACING_EVENT_TYPE } from "@/lib/pace-reference";

const PATH = "/admin/pace-references";

function str(v: FormDataEntryValue | null): string {
  return String(v ?? "").trim();
}
function optInt(v: FormDataEntryValue | null): number | null {
  const s = str(v);
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
}

const SESSION_TYPES = ["RACE", "QUALIFY", "PRACTICE", "TIME_TRIAL"] as const;
type SessionType = (typeof SESSION_TYPES)[number];

/**
 * Create or update one pace curve.
 *
 * The points come in as pasted JSON: either the whole Series Insights file
 * (`{season_id, race_week_num, car_class_id, event_type, line: […]}`) or just
 * an array of points. When the whole file is pasted we also lift the iRacing
 * ids and the session type out of it, so a curve carries its own provenance
 * and a stale one is recognisable months later.
 */
export async function savePaceReference(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = str(formData.get("id"));
  const carClass = str(formData.get("carClass"));
  const track = str(formData.get("track"));
  const raw = str(formData.get("points"));

  if (!carClass || !track) {
    redirect(PATH + "?error=" + encodeURIComponent("Car class and track are required."));
  }

  let parsedJson: unknown = null;
  if (raw) {
    try {
      parsedJson = JSON.parse(raw);
    } catch {
      redirect(
        PATH +
          "?error=" +
          encodeURIComponent(
            "That is not valid JSON. Paste the whole file from the Pace Analysis chart, or a [{irating, lap_time}] array."
          )
      );
    }
  }
  const points = parsePacePoints(parsedJson);
  if (raw && points.length < 2) {
    redirect(
      PATH +
        "?error=" +
        encodeURIComponent(
          "No usable points in that JSON — a curve needs at least two {irating, lap_time} entries."
        )
    );
  }

  // Provenance out of the pasted file, when it was the whole file.
  const file = (parsedJson ?? {}) as Record<string, unknown>;
  const evt = typeof file.event_type === "number" ? file.event_type : null;
  const fromFile =
    evt != null
      ? (IRACING_EVENT_TYPE as Record<number, SessionType | undefined>)[evt]
      : undefined;
  const chosen = str(formData.get("sessionType")) as SessionType;
  const sessionType: SessionType = SESSION_TYPES.includes(chosen)
    ? chosen
    : (fromFile ?? "RACE");

  const data = {
    label: str(formData.get("label")) || `${carClass} · ${track}`,
    carClass,
    track,
    sessionType,
    iracingSeasonId:
      optInt(formData.get("iracingSeasonId")) ??
      (typeof file.season_id === "number" ? file.season_id : null),
    iracingRaceWeek:
      optInt(formData.get("iracingRaceWeek")) ??
      (typeof file.race_week_num === "number" ? file.race_week_num : null),
    iracingCarClassId:
      optInt(formData.get("iracingCarClassId")) ??
      (typeof file.car_class_id === "number" ? file.car_class_id : null),
    source: str(formData.get("source")) || null,
    notes: str(formData.get("notes")) || null,
    updatedById: admin.id,
  };

  if (id) {
    // An edit with an empty paste box keeps the curve it already has.
    await prisma.paceReference.update({
      where: { id },
      data: points.length >= 2 ? { ...data, points } : data,
    });
  } else {
    if (points.length < 2) {
      redirect(
        PATH + "?error=" + encodeURIComponent("Paste the curve JSON for a new entry.")
      );
    }
    await prisma.paceReference.create({ data: { ...data, points } });
  }

  revalidatePath(PATH);
  redirect(
    PATH +
      "?ok=" +
      encodeURIComponent(
        `Saved ${data.label}${points.length >= 2 ? ` — ${points.length} points` : ""}.`
      )
  );
}

export async function deletePaceReference(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = str(formData.get("id"));
  if (id) await prisma.paceReference.delete({ where: { id } }).catch(() => null);
  revalidatePath(PATH);
  redirect(PATH + "?ok=" + encodeURIComponent("Deleted."));
}
