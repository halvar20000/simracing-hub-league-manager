/**
 * Public read-only league + season picker for the iRacing championship overlay
 * config page. Returns the list of leagues plus their currently runnable
 * (ACTIVE or OPEN_REGISTRATION) seasons.
 *
 * Companion to /api/overlay/standings.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  const leagues = await prisma.league.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      slug: true,
      name: true,
      seasons: {
        where: { status: { in: ["ACTIVE", "OPEN_REGISTRATION"] } },
        orderBy: { startsOn: "desc" },
        select: {
          id: true,
          name: true,
          status: true,
          isMulticlass: true,
          proAmEnabled: true,
        },
      },
    },
  });
