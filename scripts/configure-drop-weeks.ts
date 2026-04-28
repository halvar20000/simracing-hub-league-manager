import { prisma } from "@/lib/prisma";

const CONFIG: { name: string; n: number | null }[] = [
  { name: "CAS GT4 Masters", n: 1    },
  { name: "CAS SFL Cup",     n: 1    },
  { name: "CAS GT3 WCT",     n: 3    },
  { name: "CAS IEC",         n: null },
];

async function main() {
  for (const c of CONFIG) {
    const ss = await prisma.scoringSystem.findUnique({ where: { name: c.name } });
    if (!ss) { console.log(`(skip) ${c.name} not found`); continue; }
    if (ss.dropWorstNRounds === c.n) {
      console.log(`${c.name}: already ${c.n}`);
      continue;
    }
    await prisma.scoringSystem.update({
      where: { id: ss.id },
      data: { dropWorstNRounds: c.n },
    });
    console.log(`${c.name}: dropWorstNRounds ${ss.dropWorstNRounds} -> ${c.n}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
