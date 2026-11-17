/**
 * Seasons imported from the old iRLM league manager (pre-CLS history).
 *
 * Imported once by a script (not by the app): every row it writes has an id
 * starting with `irlm_` (seasons `irlm_<league>_<irlmSeasonId>`, rounds
 * `irlm_r_<eventId>`, results, teams, registrations) and drivers without a CLS
 * account became users `irlmu_<iracingId>`. The seasons are COMPLETED +
 * archived and use an "iRLM archive" scoring system: points are stored exactly
 * as iRLM scored them, so these rounds must never be recomputed.
 *
 * Archive registrations are history only: they must not make someone a
 * "current" CLS driver (CAS Rating ranking, stint-planner picker).
 */
export const IRLM_ARCHIVE_PREFIX = "irlm_";

export const IRLM_ARCHIVE_ROUND_PREFIX = "irlm_r_";

export const isIrlmArchiveSeason = (seasonId: string) => seasonId.startsWith(IRLM_ARCHIVE_PREFIX);

/** Prisma `Registration` filter: leave out archive seasons. */
export const notIrlmArchive = { seasonId: { not: { startsWith: IRLM_ARCHIVE_PREFIX } } };

/** AppSetting holding an archive season's final team standing as iRLM had it
 *  (`[{ name, points, drivers }]`, best first). iRLM scored teams per race
 *  with the team a driver drove for THAT race; CLS has one team per driver
 *  per season, so recomputing would not match. Written by the import script. */
export const irlmArchiveTeamsKey = (seasonId: string) => `irlm-archive-teams:${seasonId}`;

export type IrlmArchiveTeamRow = { name: string; points: number; drivers: number };

export async function loadIrlmArchiveTeams(
  prisma: { appSetting: { findUnique(args: { where: { key: string } }): Promise<{ value: string } | null> } },
  seasonId: string,
): Promise<IrlmArchiveTeamRow[] | null> {
  const row = await prisma.appSetting.findUnique({ where: { key: irlmArchiveTeamsKey(seasonId) } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value);
    return Array.isArray(v) ? (v as IrlmArchiveTeamRow[]) : null;
  } catch {
    return null;
  }
}
