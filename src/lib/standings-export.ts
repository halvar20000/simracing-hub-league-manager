import * as XLSX from "xlsx";
import type { DriverStanding } from "@/lib/standings";

/**
 * Spreadsheet export of the driver standings.
 *
 * Pure helper (NOT "use server") so both the API route and any future server
 * action can import it — see the "Common gotchas" note in CLAUDE.md.
 *
 * The workbook mirrors exactly what the public standings page shows: the
 * summary columns of the list view plus one numeric column per round (the
 * race-by-race view), so the sheet can be re-sorted / charted in Excel,
 * Numbers or Google Sheets without re-deriving anything.
 *
 * Publish gate: the caller passes standings computed with the default
 * options, so only COMPLETED rounds are ever exported.
 */

export type StandingsExportMeta = {
  leagueName: string;
  seasonName: string;
  seasonYear: number;
  scoringSystemName: string;
  /** Mirrors ScoringSystem.participationInCombined. */
  participationInCombined: boolean;
  proAmEnabled: boolean;
  generatedAt: Date;
  sourceUrl: string;
};

type Kind = "combined" | "class";

type Cell = string | number | null;

/** Championship order — identical to the standings page's sortByCombined. */
function sortRows(rows: DriverStanding[], kind: Kind): DriverStanding[] {
  return [...rows].sort((a, b) => {
    const at = kind === "combined" ? a.combinedTotal : a.classTotal;
    const bt = kind === "combined" ? b.combinedTotal : b.classTotal;
    return (
      Number(b.roundsCompleted > 0) - Number(a.roundsCompleted > 0) ||
      bt - at ||
      a.totalIncidents - b.totalIncidents ||
      (kind === "combined"
        ? b.rawPoints - a.rawPoints
        : b.classRawPoints - a.classRawPoints) ||
      (a.driverLastName ?? "").localeCompare(b.driverLastName ?? "")
    );
  });
}

/** Round columns come from any row — every driver carries the full list. */
function roundColumns(rows: DriverStanding[]) {
  const source = rows.find((r) => r.roundPoints.length > 0);
  return source ? source.roundPoints : [];
}

/** One sheet: summary columns + one column per round + a dropped-rounds note. */
function buildSheet(
  rowsIn: DriverStanding[],
  kind: Kind,
  meta: StandingsExportMeta
): XLSX.WorkSheet {
  const rows = sortRows(rowsIn, kind);
  const rounds = roundColumns(rows);

  const header: string[] = [
    "Pos",
    "#",
    "Driver",
    "Country",
    "Team",
    ...(meta.proAmEnabled ? ["Class"] : []),
    "Status",
    "Rounds",
    "Inc",
    "iR",
    "Raw",
    "Part.",
    "Pen.",
    "Total",
    ...rounds.map((r) => `R${r.roundNumber} ${r.roundName}`),
    "Dropped",
  ];

  const body: Cell[][] = rows.map((r, idx) => {
    const byRound = new Map(r.roundPoints.map((p) => [p.roundId, p]));
    // Net penalty = gross penalties − season-end forgiveness credit, written
    // as a negative number so the column sums the way a reader expects.
    const netPen = r.manualPenalties - r.forgivenessCredit;
    const dropped = r.roundPoints
      .filter((p) => p.dropped && p.hasResult)
      .map((p) => `R${p.roundNumber}`)
      .join(", ");
    return [
      idx + 1,
      r.startNumber ?? "",
      `${r.driverFirstName ?? ""} ${r.driverLastName ?? ""}`.trim(),
      r.countryCode ?? "",
      r.teamName ?? "",
      ...(meta.proAmEnabled ? [r.proAmClass ?? ""] : []),
      r.excludedAt ? "Excluded" : r.retiredAt ? "Retired" : "",
      r.roundsCompleted,
      r.totalIncidents,
      r.iRating ?? "",
      kind === "combined" ? r.rawPoints : r.classRawPoints,
      r.participationPoints,
      netPen === 0 ? 0 : -netPen,
      kind === "combined" ? r.combinedTotal : r.classTotal,
      ...rounds.map((rd) => {
        const p = byRound.get(rd.roundId);
        if (!p || !p.hasResult) return "";
        return kind === "combined" ? p.combinedPoints : p.classPoints;
      }),
      dropped,
    ];
  });

  const ws = XLSX.utils.aoa_to_sheet([header, ...body]);
  ws["!cols"] = header.map((h, i) => ({
    wch: i === 2 ? 24 : i === 4 ? 20 : Math.max(6, Math.min(16, h.length + 2)),
  }));
  ws["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: body.length, c: header.length - 1 },
    }),
  };
  return ws;
}

function infoSheet(meta: StandingsExportMeta, roundCount: number): XLSX.WorkSheet {
  const rows: Cell[][] = [
    ["CAS League Scoring — standings export"],
    [],
    ["League", meta.leagueName],
    ["Season", `${meta.seasonName} ${meta.seasonYear}`],
    ["Scoring system", meta.scoringSystemName],
    ["Rounds included", roundCount],
    ["Generated", meta.generatedAt.toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    ["Source", meta.sourceUrl],
    [],
    ["Notes"],
    ["", "Only published (COMPLETED) rounds are included — same as the public standings page."],
    [
      "",
      meta.participationInCombined
        ? "Total = race points + participation − penalties."
        : "Total = race points − penalties. Participation points are listed for reference but do NOT count toward the Combined total.",
    ],
    ["", "Pen. is written as a negative number (0 when the driver has none)."],
    ["", "Blank round cell = no result for that round. The Dropped column lists rounds excluded by the drop-week rule."],
    ["", "Penalty points held in a deferred pool only count once released — see the penalty pool page."],
  ];
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [{ wch: 18 }, { wch: 96 }];
  return ws;
}

/**
 * Build the .xlsx workbook for a season's driver standings.
 *
 * `combined` is always written. `pro` / `am` are written as extra sheets when
 * the season has the Pro/Am split enabled and the arrays are non-empty.
 */
export function buildStandingsWorkbook({
  combined,
  pro,
  am,
  meta,
}: {
  combined: DriverStanding[];
  pro?: DriverStanding[];
  am?: DriverStanding[];
  meta: StandingsExportMeta;
}): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, buildSheet(combined, "combined", meta), "Standings");
  if (meta.proAmEnabled && pro && pro.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildSheet(pro, "class", meta), "Pro");
  }
  if (meta.proAmEnabled && am && am.length > 0) {
    XLSX.utils.book_append_sheet(wb, buildSheet(am, "class", meta), "Am");
  }
  XLSX.utils.book_append_sheet(
    wb,
    infoSheet(meta, roundColumns(combined).length),
    "Info"
  );
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

/** Safe, descriptive download filename. */
export function standingsFileName(meta: StandingsExportMeta): string {
  const slugify = (s: string) =>
    s
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  return `${slugify(meta.leagueName)}-${slugify(meta.seasonName)}-${meta.seasonYear}-standings.xlsx`;
}
