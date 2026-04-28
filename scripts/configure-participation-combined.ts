import { prisma } from "@/lib/prisma";

const CONFIG: { name: string; flag: boolean }[] = [
  { name: "CAS GT3 WCT",     flag: false }, // combined = race only (no participation)
  // Defaults (true) cover GT4 Masters, SFL Cup, IEC, PCCD, ...
];

async function main() {
  for (const c of CONFIG) {
    const ss = await prisma.scoringSystem.findUnique({ where: { name: c.name } });
    if (!ss) { console.log(`(skip) ${c.name} not found`); continue; }
    if (ss.participationInCombined === c.flag) {
      console.log(`${c.name}: already ${c.flag}`);
      continue;
    }
    await prisma.scoringSystem.update({
      where: { id: ss.id },
      data: { participationInCombined: c.flag },
    });
    console.log(`${c.name}: participationInCombined ${ss.participationInCombined} -> ${c.flag}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
