import * as XLSX from "xlsx";
import { fmtPaceSec } from "@/lib/pace-reference";
import type { PaceReferenceRow } from "@/lib/pace-references";

/**
 * .xlsx export of the pace-reference library (iRating → lap time).
 *
 * The curves are typed in once from iRacing's Series Insights and then live
 * only in CLS. Being able to take them out again matters for two reasons: the
 * source they came from is a members-site page that is refitted every week and
 * cannot be asked for last season's numbers, and a team that wants to do its
 * own maths on the curve should not have to retype 102 rows.
 *
 * One sheet per curve, plus an Info sheet naming where each came from.
 * Pure module — no DB, no "use server".
 */

/** Excel sheet names: 31 chars, and none of : \ / ? * [ ] */
function sheetName(raw: string, taken: Set<string>): string {
  const base =
    raw
      .replace(/[:\\/?*[\]]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 31) || "Curve";
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  // " 2", " 3", … appended within the 31-char budget.
  for (let i = 2; i < 100; i += 1) {
    const suffix = ` ${i}`;
    const candidate = base.slice(0, 31 - suffix.length) + suffix;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
  return base.slice(0, 29) + "~~";
}

function curveSheet(row: PaceReferenceRow): XLSX.WorkSheet {
  const header = ["iRating", "Lap time (s)", "Lap time"];
  const body = row.points.map((p) => [
    p.irating,
    // Rounded on the way out: the stored values are already 3 decimals, but a
    // curve that ever arrives with binary-float noise should not print
    // 117.99600000000001 in a spreadsheet cell.
    Math.round(p.lapSec * 1000) / 1000,
    fmtPaceSec(p.lapSec),
  ]);
  const ws = XLSX.utils.aoa_to_sheet([
    [row.label],
    [`${row.carClass} · ${row.track} · ${row.sessionType}`],
    [],
    header,
    ...body,
  ]);
  ws["!cols"] = [{ wch: 10 }, { wch: 14 }, { wch: 12 }];
  return ws;
}

function infoSheet(rows: PaceReferenceRow[], generatedAt: Date): XLSX.WorkSheet {
  const head = [
    "Label",
    "Car class",
    "Track",
    "Session",
    "Points",
    "iR from",
    "iR to",
    "At 1000 iR",
    "At 5000 iR",
    "At 10000 iR",
    "iRacing season",
    "Race week",
    "Car class id",
    "Source",
    "Last updated",
  ];
  const body = rows.map((r) => {
    const first = r.points[0];
    const last = r.points[r.points.length - 1];
    const at = (ir: number) => {
      // Straight lookup, no interpolation: the Info sheet is a summary, and a
      // curve that does not reach 10k should say so rather than show its end
      // point as if it were measured there.
      const hit = r.points.find((p) => p.irating === ir);
      return hit ? fmtPaceSec(hit.lapSec) : "—";
    };
    return [
      r.label,
      r.carClass,
      r.track,
      r.sessionType,
      r.points.length,
      first?.irating ?? "—",
      last?.irating ?? "—",
      at(1000),
      at(5000),
      at(10000),
      r.iracingSeasonId ?? "—",
      r.iracingRaceWeek == null ? "—" : r.iracingRaceWeek + 1,
      r.iracingCarClassId ?? "—",
      r.source ?? "",
      r.updatedAt.toISOString().slice(0, 16).replace("T", " "),
    ];
  });
  const ws = XLSX.utils.aoa_to_sheet([
    ["CLS pace references"],
    [
      "iRating → lap time, exported from iRacing's Series Insights (Pace Analysis) by hand.",
    ],
    ["Race week is shown 1-based, as the members site labels it."],
    [`Generated: ${generatedAt.toISOString().slice(0, 16).replace("T", " ")} UTC`],
    [],
    head,
    ...body,
  ]);
  ws["!cols"] = head.map((h) => ({ wch: Math.max(11, h.length + 2) }));
  return ws;
}

export function buildPaceWorkbook(
  rows: PaceReferenceRow[],
  generatedAt = new Date()
): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, infoSheet(rows, generatedAt), "Info");
  const taken = new Set<string>(["Info"]);
  for (const r of rows) {
    XLSX.utils.book_append_sheet(wb, curveSheet(r), sheetName(r.label, taken));
  }
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** "pace-gt-sprint-spa-2026-09-06.xlsx" */
export function paceFileName(row: PaceReferenceRow | null, at = new Date()): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  const day = at.toISOString().slice(0, 10);
  return row
    ? `pace-${slug(row.label) || "curve"}-${day}.xlsx`
    : `pace-references-${day}.xlsx`;
}
