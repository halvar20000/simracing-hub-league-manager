import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { compareStartNumber } from "@/lib/start-number";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public JSON export of a season's roster. No auth gate — same visibility
 * as the on-screen public roster page (APPROVED + PENDING drivers, team
 * managers excluded). Email and other admin-only fields are NOT included.
 *
 * Unlike the on-page CSV export (which scrapes the rendered table), this
 * reads straight from the DB, so it can include driver ALLOCATIONS that are
 * not shown as table columns — notably GDC (Registration.inGdc) and Pro/Am
 * (Registration.proAmClass). Flat "drivers" array under a small header.
 */
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

  // Same driver set as the public roster page: APPROVED + PENDING, excluding
  // non-driving team managers. Waitlisted drivers (APPROVED-but-over-cap) are
  // included and flagged.
  const registrations = await prisma.registration.findMany({
    where: {
      seasonId,
      status: { in: ["APPROVED", "PENDING"] },
      isTeamManager: false,
    },
    include: {
      user: true,
      team: true,
      carClass: true,
      car: true,
    },
    orderBy: [
      { team: { name: "asc" } },
      { carClass: { displayOrder: "asc" } },
      { user: { lastName: "asc" } },
    ],
  });
  // Numeric-aware ordering by start number (text field, leading zeros allowed),
  // keeping team then car-class order primary and last name as final tiebreak.
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

  const drivers = registrations.map((r) => ({
    firstName: r.user.firstName ?? null,
    lastName: r.user.lastName ?? null,
    name: `${r.user.firstName ?? ""} ${r.user.lastName ?? ""}`.trim() || null,
    startNumber: r.startNumber ?? null,
    iracingMemberId: r.user.iracingMemberId ?? null,
    countryCode: r.user.countryCode ?? null,
    iRating: r.iRating ?? null,
    team: r.team?.name ?? null,
    car: r.car?.name ?? null,
    // --- allocations ---
    carClass: r.carClass?.name ?? null,
    carClassShortCode: r.carClass?.shortCode ?? null,
    proAmClass: r.proAmClass ?? null, // "PRO" | "AM" | null
    gdc: r.inGdc === true,
    // --- status flags ---
    status: r.status, // "APPROVED" | "PENDING"
    waitlisted: r.waitlistedAt != null,
    retired: r.retiredAt != null,
    feePaid: r.startingFeePaid, // "YES" | "NO" | "PENDING"
    iracingInviteSent: r.iracingInvitationSent,
    iracingInviteAccepted: r.iracingInvitationAccepted,
  }));

  const payload = {
    league: { slug: season.league.slug, name: season.league.name },
    season: {
      id: season.id,
      name: season.name,
      year: season.year,
      teamRegistration: season.teamRegistration,
      isMulticlass: season.isMulticlass,
      proAmEnabled: season.proAmEnabled,
      gdcEnabled: season.gdcEnabled,
    },
    generatedAt: new Date().toISOString(),
    driverCount: drivers.length,
    drivers,
  };

  const fileName = `roster-${slug}-${season.name.replace(/\s+/g, "-")}-${season.year}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
