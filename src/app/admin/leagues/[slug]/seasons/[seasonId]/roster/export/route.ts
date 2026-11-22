import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { getUserLiveIratingForLeague } from "@/lib/league-irating-category";
import { compareStartNumber } from "@/lib/start-number";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Wrap a value in double quotes when it contains a comma, quote, or
 * newline (and escape inner quotes). Returns plain string otherwise. */
function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** AdminCheckStatus is the YES / NO / PENDING enum stored on
 * Registration for invitation tracking. Map it to short labels for
 * the CSV column: "Y" for YES, "N" for NO, "?" for PENDING. */
function adminCheck(v: "YES" | "NO" | "PENDING" | "FREE" | null | undefined): string {
  if (v === "YES") return "Y";
  if (v === "NO") return "N";
  if (v === "PENDING") return "?";
  if (v === "FREE") return "Free";
  return "";
}

/**
 * GET /admin/leagues/[slug]/seasons/[seasonId]/roster/export
 *
 * Streams the season's registrations as a CSV — opens cleanly in
 * Google Sheets / Excel / Numbers. Columns match the on-screen roster
 * (team column only present for team-registration seasons).
 *
 * Excel-friendly tweaks: UTF-8 BOM at the start so umlauts / accents
 * render correctly when Excel opens the file directly.
 *
 * `?format=xlsx` returns the same table as a real Excel file (bold frozen
 * header, autofilter, column widths) — no CSV import step needed.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string; seasonId: string }> }
) {
  await requireAdmin();
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Hide the redundant Pro/Am column when the season's CarClasses
  // ARE the Pro/Am tiers (e.g. GT3 WCT — classes "PRO" + "AM"). In
  // that case the Class column already shows PRO/AM so the dedicated
  // Pro/Am column would just repeat the value. For real multiclass
  // leagues like IEC (LMP2/GTP/GT3/GT4 + Pro/Am tier on top) both
  // columns stay because they carry different information.
  const seasonCarClasses = await prisma.carClass.findMany({
    where: { seasonId },
    select: { shortCode: true },
  });
  const proAmShortCodes = new Set(["PRO", "AM"]);
  const proAmIsClass =
    seasonCarClasses.length > 0 &&
    seasonCarClasses.every((c) =>
      proAmShortCodes.has(c.shortCode.toUpperCase())
    );
  const showProAmColumn = season.proAmEnabled && !proAmIsClass;

  const registrations = await prisma.registration.findMany({
    where: { seasonId, isTeamManager: false },
    include: {
      user: true,
      team: true,
      extraTeams: { select: { team: { select: { name: true } } } },
      carClass: true,
      car: true,
    },
    orderBy: [
      { team: { name: "asc" } },
      { carClass: { displayOrder: "asc" } },
      { user: { lastName: "asc" } },
    ],
  });
  // Numeric-aware ordering by start number (text field, leading zeros allowed).
  registrations.sort((a, b) => {
    const at = a.team?.name ?? "";
    const bt = b.team?.name ?? "";
    if (at !== bt) return at.localeCompare(bt);
    const ao = a.carClass?.displayOrder ?? 9999;
    const bo = b.carClass?.displayOrder ?? 9999;
    if (ao !== bo) return ao - bo;
    const sn = compareStartNumber(a.startNumber, b.startNumber);
    if (sn !== 0) return sn;
    return (a.user.lastName ?? "").localeCompare(b.user.lastName ?? "");
  });

  // Team column whenever anyone has a team (solo leagues like GT3 WCT have
  // teams too, not only team-registration seasons); Fee when the league
  // charges one.
  const showTeam =
    season.teamRegistration || registrations.some((r) => r.team || r.extraTeams.length > 0);
  const showFee = !!season.league.registrationFee && season.league.registrationFee > 0;

  // Header row.
  const cols: string[] = [];
  if (showTeam) cols.push("Team");
  cols.push(
    "Start #",
    "First name",
    "Last name",
    "iRacing ID",
    "iRating",
    "Country"
  );
  cols.push("Class");
  if (showProAmColumn) cols.push("Pro/Am");
  cols.push(
    "Car",
    "Email",
    ...(showFee ? ["Fee"] : []),
    "iRacing invitation sent",
    "iRacing invitation accepted",
    "Status"
  );

  const table: (string | number | null)[][] = [];

  for (const r of registrations) {
    const row: (string | number | null)[] = [];
    // Home team first, then any extra teams (TeamMembership).
    if (showTeam)
      row.push(
        [r.team?.name, ...r.extraTeams.map((m) => m.team.name)]
          .filter(Boolean)
          .join(" + ")
      );
    row.push(
      r.startNumber ?? "",
      r.user.firstName ?? "",
      r.user.lastName ?? "",
      r.user.iracingMemberId ?? "",
      getUserLiveIratingForLeague(r.user, season.league.slug) ?? r.iRating ?? "",
      r.user.countryCode ?? ""
    );
    row.push(r.carClass?.name ?? "");
    if (showProAmColumn) row.push(r.proAmClass ?? "");
    row.push(
      r.car?.name ?? "",
      r.user.email ?? "",
      ...(showFee
        ? [r.startingFeePaid === "YES" ? "Paid" : r.startingFeePaid === "FREE" ? "Free" : "Not paid"]
        : []),
      adminCheck(r.iracingInvitationSent),
      adminCheck(r.iracingInvitationAccepted),
      r.status
    );
    table.push(row);
  }

  const baseName = `roster-${slug}-${season.name.replace(/\s+/g, "-")}-${season.year}`;

  if (new URL(req.url).searchParams.get("format") === "xlsx") {
    // iRating as a number so Excel can sort/filter it; everything else as
    // text (start numbers keep their leading zeros, iRacing IDs stay exact).
    const iRatingCol = cols.indexOf("iRating");
    const aoa = [
      cols,
      ...table.map((row) =>
        row.map((v, i) =>
          i === iRatingCol && v !== "" && v != null && !Number.isNaN(Number(v))
            ? Number(v)
            : v == null ? "" : String(v)
        )
      ),
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = cols.map((c, i) => ({
      wch: Math.min(
        40,
        Math.max(c.length, ...aoa.slice(1).map((r) => String(r[i] ?? "").length)) + 2
      ),
    }));
    ws["!autofilter"] = {
      ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: aoa.length - 1, c: cols.length - 1 } }),
    };
    // Freeze the header row.
    ws["!views"] = [{ state: "frozen", ySplit: 1 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roster");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const rows = [cols, ...table].map((row) => row.map(csvCell).join(","));

  // Prepend UTF-8 BOM so Excel auto-detects encoding and renders
  // umlauts (ü, ö, ä, ß) and accents correctly.
  const body = "﻿" + rows.join("\r\n");
  const fileName = `${baseName}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
