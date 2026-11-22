/**
 * Team names a league already knows from its earlier seasons.
 *
 * Teams are per season (`Team.seasonId`), so a brand-new season starts with
 * no teams and every driver had to type his team again — one typo and the
 * Hall of Fame / team history splits the team in two (GT3 WCT 15th Season,
 * 2026-11-22). The registration form and the admin registration edit offer
 * these names; picking one creates the team in the new season under exactly
 * that name (find-or-create, case-insensitive).
 *
 * Only CLS seasons count (not the `irlm_` archive), only teams somebody was
 * actually registered with, newest season first, one entry per name
 * (case-insensitive), names already present in the current season left out.
 */
import type { PrismaClient } from "@prisma/client";
import { IRLM_ARCHIVE_PREFIX } from "@/lib/irlm-archive";

/** Value prefix used by the admin team <select> for a known name. */
export const KNOWN_TEAM_VALUE_PREFIX = "new:";

export async function loadEarlierTeamNames(
  prisma: PrismaClient,
  leagueId: string,
  seasonId: string,
): Promise<string[]> {
  const [earlier, current] = await Promise.all([
    prisma.team.findMany({
      where: {
        seasonId: { not: seasonId },
        season: { leagueId, id: { not: { startsWith: IRLM_ARCHIVE_PREFIX } } },
        registrations: { some: {} },
      },
      select: { name: true, season: { select: { createdAt: true } } },
    }),
    prisma.team.findMany({ where: { seasonId }, select: { name: true } }),
  ]);
  const key = (n: string) => n.trim().replace(/\s+/g, " ").toLowerCase();
  const taken = new Set(current.map((t) => key(t.name)));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of earlier.sort((a, b) => b.season.createdAt.getTime() - a.season.createdAt.getTime())) {
    const k = key(t.name);
    if (!k || taken.has(k) || seen.has(k) || /^test\b/i.test(t.name.trim())) continue;
    seen.add(k);
    out.push(t.name.trim());
  }
  return out.sort((a, b) => a.localeCompare(b));
}

/** Find the season's team by name (case-insensitive) or create it. */
export async function findOrCreateSeasonTeam(
  prisma: PrismaClient,
  seasonId: string,
  rawName: string,
): Promise<string | null> {
  const name = rawName.trim().replace(/\s+/g, " ");
  if (!name) return null;
  const found = await prisma.team.findFirst({
    where: { seasonId, name: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (found) return found.id;
  const created = await prisma.team.create({ data: { seasonId, name }, select: { id: true } });
  return created.id;
}
