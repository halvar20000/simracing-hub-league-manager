import { prisma } from "@/lib/prisma";
async function main() {
  const total = await prisma.user.count();
  const withCC = await prisma.user.count({ where: { countryCode: { not: null } } });
  console.log(`Users total: ${total}`);
  console.log(`Users with countryCode set: ${withCC}`);
  const sample = await prisma.user.findMany({
    where: { countryCode: { not: null } },
    select: { firstName: true, lastName: true, countryCode: true },
    take: 5,
  });
  console.log("Sample:", sample);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
