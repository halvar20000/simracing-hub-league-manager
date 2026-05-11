import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
(async () => {
  const leagues = await p.league.findMany({ select: { id: true, slug: true, name: true } });
  for (const l of leagues) console.log(`  ${l.slug.padEnd(20)}  ${l.name}`);
  await p.$disconnect();
})();
