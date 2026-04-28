import { prisma } from "@/lib/prisma";

const IRACING_IDS = [
  "445964","583549","915496","1005962","1057110","718865","172159","479423",
  "838203","115215","946603","250311","350029","1387737","693261","1380833",
  "181516","891101","564275","1150978","845397","841424","249259","727299",
  "709942","844831","586530","303625","436580","916335","348458","48914","965844",
];

async function main() {
  const leagues = await prisma.league.findMany({
    select: { id: true, name: true, slug: true, _count: { select: { seasons: true } } },
  });
  console.log("All leagues:");
  for (const l of leagues) console.log(" ", l);

  const tssLike = leagues.filter((l) =>
    /tss|gt4|masters/i.test(l.name) || /tss|gt4|masters/i.test(l.slug)
  );
  console.log("Leagues that look TSS / GT4 / Masters:", tssLike);

  const scoringSystems = await prisma.scoringSystem.findMany({
    select: { id: true, name: true, participationPoints: true },
  });
  console.log("Scoring systems:");
  for (const s of scoringSystems) console.log(" ", s);

  const matchedUsers = await prisma.user.findMany({
    where: { iracingMemberId: { in: IRACING_IDS } },
    select: { iracingMemberId: true, firstName: true, lastName: true },
  });
  console.log(`Existing users matching CSV iRacing IDs: ${matchedUsers.length} / ${IRACING_IDS.length}`);
  for (const u of matchedUsers) console.log(" ", u);

  const missingIds = IRACING_IDS.filter(
    (id) => !matchedUsers.some((u) => u.iracingMemberId === id)
  );
  console.log("Missing iRacing IDs (will create new Users):", missingIds.length);
  console.log(" ", missingIds.slice(0, 10).join(", "), missingIds.length > 10 ? "..." : "");
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
