import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeDriverStandings } from "@/lib/standings";
import {
  buildStandingsWorkbook,
  standingsFileName,
  type StandingsExportMeta,
} from "@/lib/standings-export";
import { isStandingsExportEnabled } from "@/lib/standings-export-config";

/**
 * Public .xlsx export of a season's driver standings.
 *
 *   GET /api/export/standings?season=<seasonId>
 *
 * Public and read-only: it exposes exactly the data already on
 * /leagues/<slug>/seasons/<id>/standings, computed with the default options
 * so the COMPLETED publish gate applies (no admin-preview leak).
 *
 * Currently enabled for CAS GT3 WCT only — see standings-export-config.ts.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const seasonId = new URL(req.url).searchParams.get("season");
  if (!seasonId) {
    return NextResponse.json({ error: "Missing ?season=<seasonId>" }, { status: 400 });
  }

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true, scoringSystem: true },
  });
  if (!season) {
    return NextResponse.json({ error: "Season not found" }, { status: 404 });
  }
  if (!isStandingsExportEnabled(season.league.slug)) {
    return NextResponse.json(
      { error: "Standings export is not enabled for this league" },
      { status: 403 }
    );
  }

  const drivers = await computeDriverStandings(prisma, seasonId);

  const meta: StandingsExportMeta = {
    leagueName: season.league.name,
    seasonName: season.name,
    seasonYear: season.year,
    scoringSystemName: season.scoringSystem?.name ?? "—",
    participationInCombined: season.scoringSystem?.participationInCombined ?? true,
    proAmEnabled: season.proAmEnabled,
    generatedAt: new Date(),
    sourceUrl: `${
      process.env.NEXT_PUBLIC_SITE_URL ?? "https://league.simracing-hub.com"
    }/leagues/${season.league.slug}/seasons/${season.id}/standings`,
  };

  const buf = buildStandingsWorkbook({
    combined: drivers,
    pro: drivers.filter((d) => d.proAmClass === "PRO"),
    am: drivers.filter((d) => d.proAmClass === "AM"),
    meta,
  });

  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${standingsFileName(meta)}"`,
      "Cache-Control": "no-store",
    },
  });
}
