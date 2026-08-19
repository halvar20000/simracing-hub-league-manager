import type { Prisma } from "@prisma/client";

/**
 * Who may open the full text of an incident report.
 *
 * The public /incidents feed shows only WHO reported WHOM and (once
 * published) the verdict — never the written accusation. The description,
 * the evidence links and the lap/turn detail are private to three parties:
 *
 *   1. the reporter who filed it,
 *   2. the driver(s) named as ACCUSED — added 2026-08-19, because an accused
 *      driver could see that a case existed against them but not read a word
 *      of it, which makes answering it impossible,
 *   3. admins / stewards.
 *
 * WITNESS is deliberately NOT included: being named as a bystander is not the
 * same as being asked to defend yourself.
 *
 * Kept in one module so the detail page's access check, the "Reports against
 * me" list and the /incidents "View details" link can never drift apart — a
 * link that appears for someone the page then redirects away is worse than no
 * link at all.
 */

/** Prisma `where` fragment: reports in which this user is the accused. */
export function accusedByUserWhere(
  userId: string
): Prisma.IncidentReportWhereInput {
  return {
    involvedDrivers: {
      some: { role: "ACCUSED", registration: { userId } },
    },
  };
}

type InvolvedLike = {
  role: string;
  registration: { userId: string };
};

/** True when `userId` is named as ACCUSED among these involved-driver rows. */
export function isAccusedIn(
  involvedDrivers: InvolvedLike[],
  userId: string | null | undefined
): boolean {
  if (!userId) return false;
  return involvedDrivers.some(
    (d) => d.role === "ACCUSED" && d.registration.userId === userId
  );
}
