import { prisma } from "@/lib/prisma";

const SEASON_ID = process.env.SEASON_ID!;

async function main() {
  const season = await prisma.season.findUnique({
    where: { id: SEASON_ID },
    select: { id: true, name: true, isMulticlass: true },
  });
  console.log("Season:", season);

  const classes = await prisma.carClass.findMany({
    where: { seasonId: SEASON_ID },
    orderBy: { displayOrder: "asc" },
    select: { id: true, name: true, shortCode: true, displayOrder: true },
  });
  console.log("CarClasses:");
  for (const c of classes) {
    console.log(" ", c);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
