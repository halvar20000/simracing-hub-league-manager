import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public CSV export of a season's roster. No auth gate — same
 * visibility as the on-screen public roster page. Email and admin-only
 * flags are NOT included. */
function csvCell(raw: unknown): string {
  if (raw === null || raw === undefined) return "";
  const s = String(raw);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function adminCheckLabel(
  v: "YES" | "NO" | "PENDING" | null | undefined,
  labels: { YES: string; NO: string }
): string {
  // The public page renders the YES/NO/PENDING enum as a friendly badge
  // ("Sent" / "Not sent", "Accepted" / "Not accepted", "Paid" / "Not
  // paid"). Mirror that in the CSV so the file matches what users see.
  if (v === "YES") return labels.YES;
  return labels.NO;
}

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ slug: string; seasonId: string }> }
) {
  const { slug, seasonId } = await params;

  const season = await prisma.season.findUnique({
    where: { id: seasonId },
    include: { league: true },
  });
  if (!season || season.league.slug !== slug) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  // Same filter as the public roster page: APPROVED + PENDING.
  const registrations = await prisma.registration.findMany({
    where: { seasonId, status: { in: ["APPROVED", "PENDING"] } },
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

  const showFee =
    !!season.league.registrationFee && season.league.registrationFee > 0;
  const showClass = season.isMulticlass;

  const cols: string[] = [];
  if (season.teamRegistration) cols.push("Team");
  cols.push("Start #", "Driver", "iRacing ID", "iRating");
  if (showClass || season.teamRegistration) cols.push("Class");
  cols.push("Car");
  if (showFee) cols.push("Fee");
  cols.push("iRacing invite", "iRacing accepted", "Status");

  const rows: string[] = [];
  rows.push(cols.map(csvCell).join(","));

  for (const r of registrations) {
    const row: (string | number | null)[] = [];
    if (season.teamRegistration) row.push(r.team?.name ?? "");
    row.push(
      r.startNumber ?? "",
      `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim(),
      r.user.iracingMemberId ?? "",
      r.iRating ?? ""
    );
    if (showClass || season.teamRegistration) row.push(r.carClass?.name ?? "");
    row.push(r.car?.name ?? "");
    if (showFee)
      row.push(
        adminCheckLabel(r.startingFeePaid, { YES: "Paid", NO: "Not paid" })
      );
    row.push(
      adminCheckLabel(r.iracingInvitationSent, { YES: "Sent", NO: "Not sent" }),
      adminCheckLabel(r.iracingInvitationAccepted, {
        YES: "Accepted",
        NO: "Not accepted",
      }),
      r.status
    );
    rows.push(row.map(csvCell).join(","));
  }

  const body = "﻿" + rows.join("\r\n"); // UTF-8 BOM for Excel.
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
