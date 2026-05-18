import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

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
function adminCheck(v: "YES" | "NO" | "PENDING" | null | undefined): string {
  if (v === "YES") return "Y";
  if (v === "NO") return "N";
  if (v === "PENDING") return "?";
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
 */
export async function GET(
  _req: Request,
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

  const registrations = await prisma.registration.findMany({
    where: { seasonId },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { team: { name: "asc" } },
      { carClass: { displayOrder: "asc" } },
      { startNumber: "asc" },
      { user: { lastName: "asc" } },
    ],
  });

  // Header row.
  const cols: string[] = [];
  if (season.teamRegistration) cols.push("Team");
  cols.push(
    "Start #",
    "First name",
    "Last name",
    "iRacing ID",
    "iRating",
    "Country"
  );
  cols.push("Class");
  if (season.proAmEnabled) cols.push("Pro/Am");
  cols.push(
    "Car",
    "Email",
    "iRacing invitation sent",
    "iRacing invitation accepted",
    "Status"
  );

  const rows: string[] = [];
  rows.push(cols.map(csvCell).join(","));

  for (const r of registrations) {
    const row: (string | number | null)[] = [];
    if (season.teamRegistration) row.push(r.team?.name ?? "");
    row.push(
      r.startNumber ?? "",
      r.user.firstName ?? "",
      r.user.lastName ?? "",
      r.user.iracingMemberId ?? "",
      r.iRating ?? "",
      r.user.countryCode ?? ""
    );
    row.push(r.carClass?.name ?? "");
    if (season.proAmEnabled) row.push(r.proAmClass ?? "");
    row.push(
      r.car?.name ?? "",
      r.user.email ?? "",
      adminCheck(r.iracingInvitationSent),
      adminCheck(r.iracingInvitationAccepted),
      r.status
    );
    rows.push(row.map(csvCell).join(","));
  }

  // Prepend UTF-8 BOM so Excel auto-detects encoding and renders
  // umlauts (ü, ö, ä, ß) and accents correctly.
  const body = "﻿" + rows.join("\r\n");
  const fileName = `roster-${slug}-${season.name.replace(/\s+/g, "-")}-${season.year}.csv`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
