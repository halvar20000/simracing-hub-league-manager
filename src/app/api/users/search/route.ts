import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Authenticated user search for picker components (e.g. assigning a
 * Teammanager). Returns only data that is already public on rosters
 * (display name + iRacing ID) — never emails.
 *
 * GET /api/users/search?q=<query>   (min 2 chars, max 8 results)
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const q = (req.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ users: [] });
  }

  const parts = q.split(/\s+/);
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { name: { contains: q, mode: "insensitive" } },
        // Exact email match only — no substring search on emails.
        { email: { equals: q, mode: "insensitive" } },
        ...(parts.length >= 2
          ? [
              {
                AND: [
                  {
                    firstName: {
                      contains: parts[0],
                      mode: "insensitive" as const,
                    },
                  },
                  {
                    lastName: {
                      contains: parts.slice(1).join(" "),
                      mode: "insensitive" as const,
                    },
                  },
                ],
              },
            ]
          : []),
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      name: true,
      iracingMemberId: true,
    },
    orderBy: [{ firstName: "asc" }, { lastName: "asc" }],
    take: 8,
  });

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      label:
        `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() ||
        u.name ||
        "Unnamed user",
      iracingMemberId: u.iracingMemberId,
    })),
  });
}
